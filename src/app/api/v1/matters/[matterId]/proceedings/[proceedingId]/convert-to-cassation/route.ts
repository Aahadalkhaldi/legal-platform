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
      .eq("stage", "cassation")
      .is("deleted_at", null)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existingTransition) {
      throw new ApiError("CONFLICT", "Cassation proceeding already exists for this source proceeding.");
    }

    const insertPayload = buildProceedingTransitionInsert({
      sourceProceeding: source,
      targetStage: "cassation",
      actorUserId: context.userId,
      caseNumber: payload.caseNumber ?? null,
      courtId: payload.courtId ?? null,
      department: payload.department ?? null,
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
      action: "MATTER_PROCEEDING_CASSATION_CREATED",
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
