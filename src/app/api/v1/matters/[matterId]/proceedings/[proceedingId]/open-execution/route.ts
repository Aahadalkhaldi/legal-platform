import { getAuthContext, requirePermission } from "@/lib/api/context";
import { assertMatterAccess, loadMatterProceeding } from "@/lib/api/matters-access";
import { buildProceedingTransitionInsert } from "@/lib/api/matter-proceedings";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { convertMatterProceedingSchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(
  request: Request,
  contextParams: { params: Promise<{ matterId: string; proceedingId: string }> },
) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "cases:update");
    const { matterId, proceedingId } = await contextParams.params;
    const payload = convertMatterProceedingSchema.parse(await request.json());
    const supabase = createSupabaseAdmin();

    await assertMatterAccess(supabase, context, matterId);
    const source = await loadMatterProceeding(supabase, context, matterId, proceedingId);

    const { data: existingTransition, error: existingError } = await supabase
      .from("matter_proceedings")
      .select("id")
      .eq("account_id", context.accountId)
      .eq("legal_matter_id", matterId)
      .eq("parent_proceeding_id", source.id)
      .eq("action_type", "execution")
      .is("deleted_at", null)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existingTransition) {
      throw new ApiError("CONFLICT", "Execution proceeding already exists for this source proceeding.");
    }

    const insertPayload = buildProceedingTransitionInsert({
      sourceProceeding: source,
      targetActionType: "execution",
      actorUserId: context.userId,
      caseNumber: payload.caseNumber ?? null,
      courtId: payload.courtId ?? null,
      circuit: payload.circuit ?? null,
      department: payload.department ?? null,
      claimType: payload.claimType ?? null,
      judgmentSummary: payload.judgmentSummary ?? null,
      authority: payload.authority ?? null,
      reportNumber: payload.reportNumber ?? null,
      submissionDate: payload.submissionDate ?? null,
      complainant: payload.complainant ?? null,
      respondent: payload.respondent ?? null,
      investigationSessions: payload.investigationSessions ?? null,
      prosecutorName: payload.prosecutorName ?? null,
      policeStation: payload.policeStation ?? null,
      relatedLawsuitProceedingId: payload.relatedLawsuitProceedingId ?? null,
      targetStage: payload.stage ?? "execution",
      filingDate: payload.filingDate ?? null,
      nextDeadlineAt: payload.nextDeadlineAt ?? null,
      feesAmount: payload.feesAmountQar ?? null,
      metadata: payload.metadata ?? undefined,
    });

    const { data, error } = await supabase
      .from("matter_proceedings")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: "MATTER_PROCEEDING_EXECUTION_OPENED",
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
