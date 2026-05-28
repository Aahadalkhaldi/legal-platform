import { getAuthContext, requirePermission } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { hasMatterAction, isMatterScopedRole, normalizePlatformRole } from "@/lib/access-control";
import { parseSearchParams } from "@/lib/api/pagination";
import { createLegalMatterSchema } from "@/lib/api/schemas";
import { readWorkflowStatusFromMatter } from "@/lib/api/matter-intake";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { cursor, limit, updated_after: updatedAfter } = parseSearchParams(request.url);
    const supabase = createSupabaseAdmin();

    let query = supabase
      .from("legal_matters")
      .select("id, matter_number, title, status, intake_type, opened_at, closed_at, updated_at, metadata, client:clients(id, full_name)")
      .eq("account_id", context.accountId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) query = query.lt("updated_at", cursor);
    if (updatedAfter) query = query.gte("updated_at", updatedAfter);

    const normalizedRole = normalizePlatformRole(context.role);
    if (isMatterScopedRole(context.role)) {
      const accessibleMatterIds = await loadAccessibleMatterIds(supabase, context.accountId, context.userId, normalizedRole);
      if (accessibleMatterIds !== null) {
        if (accessibleMatterIds.length === 0) {
          return ok({ data: [], page: { limit, nextCursor: null } });
        }

        query = query.in("id", accessibleMatterIds);
      }
    }

    if (normalizedRole === "client_portal") {
      const { data: clientRows, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("account_id", context.accountId)
        .eq("user_id", context.userId)
        .is("deleted_at", null);

      if (clientError) throw clientError;
      const clientIds = (clientRows ?? []).map((row) => row.id);
      if (clientIds.length === 0) {
        return ok({ data: [], page: { limit, nextCursor: null } });
      }

      query = query.in("client_id", clientIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const pageRows = rows.slice(0, limit);

    const matterIds = pageRows.map((row) => row.id);
    const proceedingCountMap = await loadProceedingCountMap(supabase, context.accountId, matterIds);

    return ok({
      data: pageRows.map((row) => ({
        id: row.id,
        matterNumber: row.matter_number,
        title: row.title,
        status: row.status,
        intakeType: row.intake_type,
        intakeWorkflowStatus: readWorkflowStatusFromMatter(row.metadata, row.status),
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        updatedAt: row.updated_at,
        clientName: extractClientName(row.client),
        proceedingCount: proceedingCountMap.get(row.id) ?? 0,
      })),
      page: {
        limit,
        nextCursor: rows.length > limit ? pageRows.at(-1)?.updated_at ?? null : null,
      },
    });
  } catch (error) {
    return fail(error, reqId);
  }
}

export async function POST(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "cases:create");
    if (!hasMatterAction({
      role: context.role,
      action: "manage_clients",
      directPermissions: context.permissions,
      inheritedPermissions: context.inheritedPermissions,
    })) {
      throw new ApiError("FORBIDDEN", "Missing action permission: manage_clients.");
    }
    const payload = createLegalMatterSchema.parse(await request.json());
    const supabase = createSupabaseAdmin();

    if (payload.clientId) {
      const { data: clientRow, error: clientError } = await supabase
        .from("clients")
        .select("id")
        .eq("id", payload.clientId)
        .eq("account_id", context.accountId)
        .is("deleted_at", null)
        .maybeSingle();

      if (clientError) throw clientError;
      if (!clientRow) throw new ApiError("FORBIDDEN", "Client must belong to the same account.");
    }

    if (payload.leadLawyerUserId) {
      const { data: memberRow, error: memberError } = await supabase
        .from("account_memberships")
        .select("id")
        .eq("account_id", context.accountId)
        .eq("user_id", payload.leadLawyerUserId)
        .eq("status", "active")
        .is("deleted_at", null)
        .maybeSingle();

      if (memberError) throw memberError;
      if (!memberRow) throw new ApiError("FORBIDDEN", "Lead lawyer must be an active account member.");
    }

    const { data, error } = await supabase
      .from("legal_matters")
      .insert({
        account_id: context.accountId,
        client_id: payload.clientId ?? null,
        lead_lawyer_user_id: payload.leadLawyerUserId ?? null,
        matter_number: payload.matterNumber ?? null,
        title: payload.title,
        description: payload.description ?? null,
        status: payload.status,
        intake_type: payload.intakeType,
        opened_at: payload.openedAt ?? new Date().toISOString(),
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: "LEGAL_MATTER_CREATED",
      targetType: "legal_matter",
      targetId: data.id,
      requestId: reqId,
      request,
      after: data,
    });

    return ok({ data, requestId: reqId }, { status: 201 });
  } catch (error) {
    return fail(error, reqId);
  }
}

async function loadProceedingCountMap(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  matterIds: string[],
) {
  const counts = new Map<string, number>();
  if (matterIds.length === 0) {
    return counts;
  }

  const { data, error } = await supabase
    .from("matter_proceedings")
    .select("id, legal_matter_id")
    .eq("account_id", accountId)
    .in("legal_matter_id", matterIds)
    .is("deleted_at", null);

  if (error) throw error;

  for (const row of data ?? []) {
    counts.set(row.legal_matter_id, (counts.get(row.legal_matter_id) ?? 0) + 1);
  }

  return counts;
}

function extractClientName(clientJoin: unknown) {
  if (Array.isArray(clientJoin)) {
    const first = clientJoin[0] as { full_name?: string } | undefined;
    return first?.full_name ?? null;
  }

  if (clientJoin && typeof clientJoin === "object" && "full_name" in clientJoin) {
    return String((clientJoin as { full_name: unknown }).full_name ?? "");
  }

  return null;
}

async function loadAccessibleMatterIds(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  userId: string,
  normalizedRole: string,
) {
  try {
    let query = supabase
      .from("matter_access_entries")
      .select("legal_matter_id, access_role")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .eq("status", "active")
      .is("deleted_at", null);

    if (normalizedRole === "client_portal") {
      query = query.eq("access_role", "client_access");
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => row.legal_matter_id);
  } catch (error) {
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "";
    if (code === "42P01") {
      return null;
    }

    throw error;
  }
}
