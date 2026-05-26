import { getAuthContext, requirePermission } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { fail, ok, requestId } from "@/lib/api/errors";
import { parseSearchParams } from "@/lib/api/pagination";
import { createCaseSchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { cursor, limit, updated_after: updatedAfter } = parseSearchParams(request.url);
    const supabase = createSupabaseAdmin();

    let query = supabase
      .from("cases")
      .select("id, case_number, title, status, stage, court:courts(name_ar), next_hearing_at, updated_at")
      .eq("account_id", context.accountId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) query = query.lt("updated_at", cursor);
    if (updatedAfter) query = query.gte("updated_at", updatedAfter);

    if (context.role === "client") {
      query = query.in(
        "id",
        (
          await supabase
            .from("case_participants")
            .select("case_id")
            .eq("account_id", context.accountId)
            .eq("user_id", context.userId)
            .eq("participant_type", "client")
        ).data?.map((row) => row.case_id) ?? [],
      );
    }

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const pageRows = rows.slice(0, limit);

    return ok({
      data: pageRows.map((item) => ({
        id: item.id,
        caseNumber: item.case_number,
        title: item.title,
        status: item.status,
        stage: item.stage,
        courtName: courtNameFromJoin(item.court),
        nextHearingAt: item.next_hearing_at,
        updatedAt: item.updated_at,
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

function courtNameFromJoin(court: unknown) {
  if (Array.isArray(court)) {
    const first = court[0] as { name_ar?: string } | undefined;
    return first?.name_ar ?? null;
  }

  if (court && typeof court === "object" && "name_ar" in court) {
    return String((court as { name_ar: unknown }).name_ar ?? "");
  }

  return null;
}

export async function POST(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "cases:create");
    const payload = createCaseSchema.parse(await request.json());
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("cases")
      .insert({
        account_id: context.accountId,
        title: payload.title,
        case_number: payload.caseNumber ?? null,
        status: payload.status,
        stage: payload.stage,
        client_id: payload.clientId ?? null,
        court_id: payload.courtId ?? null,
        description: payload.description ?? null,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, case_number, title, status, stage, updated_at")
      .single();

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: "CASE_CREATED",
      targetType: "case",
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
