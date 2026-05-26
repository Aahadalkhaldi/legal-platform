import { getAuthContext, requirePermission } from "@/lib/api/context";
import { assertCaseAccess } from "@/lib/api/case-access";
import { writeAuditEvent } from "@/lib/api/audit";
import { fail, ok, requestId } from "@/lib/api/errors";
import { createTimelineEventSchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request, contextParams: { params: Promise<{ caseId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { caseId } = await contextParams.params;
    await assertCaseAccess(context, caseId);

    let query = createSupabaseAdmin()
      .from("case_timeline_events")
      .select("*")
      .eq("account_id", context.accountId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (context.role === "client") {
      query = query.eq("visible_to_client", true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return ok({ data, requestId: reqId });
  } catch (error) {
    return fail(error, reqId);
  }
}

export async function POST(request: Request, contextParams: { params: Promise<{ caseId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "timeline:create");
    const { caseId } = await contextParams.params;
    await assertCaseAccess(context, caseId);
    const payload = createTimelineEventSchema.parse(await request.json());

    const { data, error } = await createSupabaseAdmin()
      .from("case_timeline_events")
      .insert({
        account_id: context.accountId,
        case_id: caseId,
        event_type: payload.eventType,
        title: payload.title,
        body: payload.body ?? null,
        visible_to_client: payload.visibleToClient,
        created_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: "TIMELINE_EVENT_CREATED",
      targetType: "case_timeline_event",
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
