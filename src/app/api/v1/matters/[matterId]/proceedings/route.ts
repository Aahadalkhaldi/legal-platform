import { getAuthContext, requirePermission } from "@/lib/api/context";
import { assertMatterAccess, assertLinkedCaseInAccount } from "@/lib/api/matters-access";
import { writeAuditEvent } from "@/lib/api/audit";
import { fail, ok, requestId } from "@/lib/api/errors";
import { createMatterProceedingSchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request, contextParams: { params: Promise<{ matterId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "cases:create");
    const { matterId } = await contextParams.params;
    const payload = createMatterProceedingSchema.parse(await request.json());
    const supabase = createSupabaseAdmin();

    await assertMatterAccess(supabase, context, matterId);
    if (payload.linkedCaseId) {
      await assertLinkedCaseInAccount(supabase, context, payload.linkedCaseId);
    }

    const { data, error } = await supabase
      .from("matter_proceedings")
      .insert({
        account_id: context.accountId,
        legal_matter_id: matterId,
        stage: payload.stage,
        status: payload.status,
        case_number: payload.caseNumber ?? null,
        linked_case_id: payload.linkedCaseId ?? null,
        court_id: payload.courtId ?? null,
        department: payload.department ?? null,
        filing_date: payload.filingDate ?? null,
        next_deadline_at: payload.nextDeadlineAt ?? null,
        fees_amount: payload.feesAmountQar ?? 0,
        metadata: payload.metadata ?? {},
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: "MATTER_PROCEEDING_CREATED",
      targetType: "matter_proceeding",
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
