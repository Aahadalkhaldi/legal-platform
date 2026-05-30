import { getAuthContext, requirePermission } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { hasMatterAction, isMatterScopedRole, normalizePlatformRole } from "@/lib/access-control";
import { parseSearchParams } from "@/lib/api/pagination";
import { createLegalMatterSchema } from "@/lib/api/schemas";
import { readWorkflowStatusFromMatter } from "@/lib/api/matter-intake";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isMissingRelationError,
  isSchemaDriftError,
  normalizeMatterApiError,
} from "@/lib/api/matter-api-errors";

type MatterListRow = {
  id: string;
  matter_number: string | null;
  title: string | null;
  status: string | null;
  intake_type: string | null;
  opened_at: string | null;
  closed_at: string | null;
  updated_at: string | null;
  metadata: Record<string, unknown> | null;
  client?: unknown;
};

type MatterListQueryInput = {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  accountId: string;
  cursor: string | null;
  updatedAfter: string | null;
  limit: number;
  matterIdsFilter: string[] | null;
  clientIdsFilter: string[] | null;
};

export async function GET(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { cursor, limit, updated_after: updatedAfter } = parseSearchParams(request.url);
    const supabase = createSupabaseAdmin();
    const normalizedRole = normalizePlatformRole(context.role);

    let matterIdsFilter: string[] | null = null;
    if (isMatterScopedRole(context.role)) {
      matterIdsFilter = await loadAccessibleMatterIds(supabase, context.accountId, context.userId, normalizedRole);
      if (matterIdsFilter !== null && matterIdsFilter.length === 0) {
        return ok({ data: [], page: { limit, nextCursor: null } });
      }
    }

    let clientIdsFilter: string[] | null = null;
    if (normalizedRole === "client_portal" && matterIdsFilter === null) {
      const clientFilter = await loadClientIdsFilter(supabase, context.accountId, context.userId);
      if (clientFilter.status === "none") {
        return ok({ data: [], page: { limit, nextCursor: null } });
      }

      if (clientFilter.status === "ids") {
        clientIdsFilter = clientFilter.clientIds;
      }

      if (clientFilter.status === "missing_clients_table" && matterIdsFilter === null) {
        throw new ApiError(
          "BAD_REQUEST",
          'Schema drift in /api/v1/matters (list matters): missing table "clients" and no matter access fallback.',
        );
      }
    }

    const rows = await loadMatterRowsWithFallback({
      supabase,
      accountId: context.accountId,
      cursor: cursor ?? null,
      updatedAfter: updatedAfter ?? null,
      limit,
      matterIdsFilter,
      clientIdsFilter,
    });

    const pageRows = rows.slice(0, limit);
    const matterIds = pageRows.map((row) => row.id);
    const proceedingCountMap = await loadProceedingCountMap(supabase, context.accountId, matterIds);

    return ok({
      data: pageRows.map((row) => {
        const matterStatus = readMatterString(row, ["status", "matter_status"], "open");
        return {
          id: row.id,
          matterNumber: readMatterString(row, ["matter_number", "matterNumber"], null),
          title: readMatterString(row, ["title", "matter_title", "name"], `Matter ${row.id}`) ?? `Matter ${row.id}`,
          status: matterStatus ?? "open",
          intakeType: readMatterString(row, ["intake_type", "intakeType"], null),
          intakeWorkflowStatus: readWorkflowStatusFromMatter(row.metadata, matterStatus),
          openedAt: row.opened_at ?? null,
          closedAt: row.closed_at ?? null,
          updatedAt: row.updated_at ?? row.opened_at ?? new Date().toISOString(),
          clientName: extractClientName(row.client),
          proceedingCount: proceedingCountMap.get(row.id) ?? 0,
        };
      }),
      page: {
        limit,
        nextCursor: rows.length > limit ? pageRows.at(-1)?.updated_at ?? null : null,
      },
    });
  } catch (error) {
    return fail(normalizeMatterApiError(error, {
      endpoint: "/api/v1/matters",
      operation: "list matters",
      fallbackMessage: "Failed to load matters.",
    }), reqId);
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
    return fail(normalizeMatterApiError(error, {
      endpoint: "/api/v1/matters",
      operation: "create matter",
      fallbackMessage: "Failed to create legal matter.",
    }), reqId);
  }
}

async function loadMatterRowsWithFallback(input: MatterListQueryInput): Promise<MatterListRow[]> {
  const primary = await runMatterListQuery({ ...input, includeClientJoin: true });
  if (!primary.error) {
    return primary.data ?? [];
  }

  if (!isMissingRelationError(primary.error, "clients")) {
    throw primary.error;
  }

  const fallback = await runMatterListQuery({ ...input, includeClientJoin: false });
  if (fallback.error) {
    throw fallback.error;
  }

  return (fallback.data ?? []).map((row) => ({
    ...row,
    client: null,
  }));
}

async function runMatterListQuery(input: MatterListQueryInput & { includeClientJoin: boolean }) {
  let query = input.supabase
    .from("legal_matters")
    .select(input.includeClientJoin
      ? "id, matter_number, title, status, intake_type, opened_at, closed_at, updated_at, metadata, client:clients(id, full_name)"
      : "id, matter_number, title, status, intake_type, opened_at, closed_at, updated_at, metadata")
    .eq("account_id", input.accountId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(input.limit + 1);

  if (input.cursor) query = query.lt("updated_at", input.cursor);
  if (input.updatedAfter) query = query.gte("updated_at", input.updatedAfter);
  if (input.matterIdsFilter !== null) query = query.in("id", input.matterIdsFilter);
  if (input.clientIdsFilter !== null) query = query.in("client_id", input.clientIdsFilter);

  const result = await query;
  return result as unknown as {
    data: MatterListRow[] | null;
    error: unknown;
  };
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

  if (error) {
    if (isSchemaDriftError(error)) {
      return counts;
    }
    throw error;
  }

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
    const typed = clientJoin as { full_name?: unknown };
    return typeof typed.full_name === "string" ? typed.full_name : null;
  }

  return null;
}

async function loadClientIdsFilter(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("clients")
    .select("id")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error) {
    if (isMissingRelationError(error, "clients")) {
      return {
        status: "missing_clients_table" as const,
      };
    }
    throw error;
  }

  const clientIds = (data ?? []).map((row) => row.id);
  if (clientIds.length === 0) {
    return {
      status: "none" as const,
    };
  }

  return {
    status: "ids" as const,
    clientIds,
  };
}

function readMatterString(
  row: MatterListRow,
  keys: string[],
  fallback: string | null,
) {
  const typedRow = row as unknown as Record<string, unknown>;
  for (const key of keys) {
    const value = typedRow[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  if (row.metadata && typeof row.metadata === "object") {
    const typedMetadata = row.metadata as Record<string, unknown>;
    for (const key of keys) {
      const value = typedMetadata[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  }

  return fallback;
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
    if (isSchemaDriftError(error)) {
      return null;
    }

    throw error;
  }
}
