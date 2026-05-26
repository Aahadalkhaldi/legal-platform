import { getAuthContext, requirePermission } from "@/lib/api/context";
import { assertCaseAccess } from "@/lib/api/case-access";
import { writeAuditEvent } from "@/lib/api/audit";
import { fail, ok, requestId } from "@/lib/api/errors";
import { updateCaseSchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request, contextParams: { params: Promise<{ caseId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { caseId } = await contextParams.params;
    await assertCaseAccess(context, caseId);

    const { data, error } = await createSupabaseAdmin()
      .from("cases")
      .select("*, court:courts(*), client:clients(*)")
      .eq("id", caseId)
      .eq("account_id", context.accountId)
      .single();

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: "CASE_VIEWED",
      targetType: "case",
      targetId: caseId,
      requestId: reqId,
      request,
    });

    return ok({ data, requestId: reqId });
  } catch (error) {
    return fail(error, reqId);
  }
}

export async function PATCH(request: Request, contextParams: { params: Promise<{ caseId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "cases:update");
    const { caseId } = await contextParams.params;
    await assertCaseAccess(context, caseId);
    const payload = updateCaseSchema.parse(await request.json());
    const supabase = createSupabaseAdmin();

    const { data: before } = await supabase
      .from("cases")
      .select("*")
      .eq("id", caseId)
      .eq("account_id", context.accountId)
      .single();

    const { data, error } = await supabase
      .from("cases")
      .update({
        title: payload.title,
        case_number: payload.caseNumber,
        status: payload.status,
        stage: payload.stage,
        client_id: payload.clientId,
        court_id: payload.courtId,
        description: payload.description,
        updated_by: context.userId,
      })
      .eq("id", caseId)
      .eq("account_id", context.accountId)
      .select("*")
      .single();

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: "CASE_UPDATED",
      targetType: "case",
      targetId: caseId,
      requestId: reqId,
      request,
      before,
      after: data,
    });

    return ok({ data, requestId: reqId });
  } catch (error) {
    return fail(error, reqId);
  }
}
