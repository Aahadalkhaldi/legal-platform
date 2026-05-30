import { z } from "zod";
import { getAuthContext } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { assertMatterAccess, assertMatterActionAccess } from "@/lib/api/matters-access";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { normalizePlatformRole, type MatterActionPermission } from "@/lib/access-control";
import {
  isSchemaDriftError,
  normalizeMatterApiError,
} from "@/lib/api/matter-api-errors";
import {
  applyProceedingLifecycleMutation,
  buildProceedingTimeline,
  readProceedingLifecycle,
} from "@/lib/proceeding-lifecycle";

const lifecycleMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_session"),
    stage: z.enum(["first_instance", "appeal", "cassation"]),
    hearingDate: z.string().datetime(),
    hearingResult: z.string().trim().max(1000).optional(),
    nextHearing: z.string().datetime().optional(),
    reminderAt: z.string().datetime().optional(),
    notes: z.string().trim().max(1500).optional(),
  }),
  z.object({
    action: z.literal("add_filing"),
    filingType: z.enum([
      "pleading",
      "evidence",
      "expert_report",
      "execution_application",
      "objection",
      "attachment",
      "seizure",
      "payment",
    ]),
    title: z.string().trim().min(2).max(240),
    filedAt: z.string().datetime().optional(),
    notes: z.string().trim().max(1500).optional(),
    amountQar: z.number().nonnegative().optional(),
  }),
  z.object({
    action: z.literal("set_judgment"),
    stage: z.enum(["first_instance", "appeal", "cassation"]),
    judgmentDate: z.string().datetime(),
    summary: z.string().trim().min(2).max(8000),
    isFinal: z.boolean(),
    appealAvailable: z.boolean(),
  }),
  z.object({
    action: z.literal("set_appeal_grounds"),
    grounds: z.array(z.string().trim().min(2).max(1200)).min(1),
    parentProceedingId: z.string().uuid().optional(),
  }),
  z.object({
    action: z.literal("set_cassation_grounds"),
    grounds: z.array(z.string().trim().min(2).max(1200)).min(1),
  }),
  z.object({
    action: z.literal("set_execution_file"),
    executionFileNumber: z.string().trim().min(1).max(120),
  }),
  z.object({
    action: z.literal("close_execution"),
    closedAt: z.string().datetime().optional(),
    notes: z.string().trim().max(1500).optional(),
  }),
]);

export async function GET(
  request: Request,
  contextParams: { params: Promise<{ matterId: string; proceedingId: string }> },
) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { matterId, proceedingId } = await contextParams.params;
    const supabase = createSupabaseAdmin();

    await assertMatterAccess(supabase, context, matterId);
    const proceeding = await loadProceedingDetail(supabase, context.accountId, matterId, proceedingId);

    if (normalizePlatformRole(context.role) === "client_portal" && !proceeding.client_visible) {
      throw new ApiError("FORBIDDEN", "Proceeding is not shared with the client portal.");
    }

    const [parentProceeding, hearings, documents, tasks, notifications, billing] = await Promise.all([
      loadParentProceeding(supabase, context.accountId, proceeding.parent_proceeding_id),
      loadProceedingRows(supabase, context.accountId, "hearings", proceedingId, "id, hearing_at, status, agenda, outcome"),
      loadProceedingRows(supabase, context.accountId, "documents", proceedingId, "id, title, document_type, classification, visible_to_client, updated_at"),
      loadProceedingRows(supabase, context.accountId, "tasks", proceedingId, "id, title, status, priority, due_at"),
      loadProceedingRows(supabase, context.accountId, "client_updates", proceedingId, "id, title, visible_to_client, created_at"),
      loadProceedingRows(supabase, context.accountId, "invoices", proceedingId, "id, invoice_number, status, total_amount, balance_due, due_at"),
    ]);

    const scopedDocuments = normalizePlatformRole(context.role) === "client_portal"
      ? documents.filter((row) => row.visible_to_client === true)
      : documents;
    const scopedNotifications = normalizePlatformRole(context.role) === "client_portal"
      ? notifications.filter((row) => row.visible_to_client === true)
      : notifications;

    const lifecycle = readProceedingLifecycle(proceeding.metadata);
    const timeline = buildProceedingTimeline({
      proceeding: {
        id: proceeding.id,
        actionType: proceeding.action_type,
        stage: proceeding.stage,
        status: proceeding.status,
        caseNumber: proceeding.case_number,
        reportNumber: proceeding.report_number,
        createdAt: proceeding.created_at,
        nextDeadlineAt: proceeding.next_deadline_at,
      },
      lifecycle,
      hearings,
      documents: scopedDocuments,
      updates: scopedNotifications,
    });

    await writeAuditEvent({
      context,
      action: "MATTER_PROCEEDING_VIEWED",
      targetType: "matter_proceeding",
      targetId: proceedingId,
      requestId: reqId,
      request,
    });

    return ok({
      data: {
        id: proceeding.id,
        legalMatterId: proceeding.legal_matter_id,
        parentProceedingId: proceeding.parent_proceeding_id,
        parentProceeding,
        actionType: proceeding.action_type,
        stage: proceeding.stage,
        status: proceeding.status,
        caseNumber: proceeding.case_number,
        reportNumber: proceeding.report_number,
        authority: proceeding.authority,
        complainant: proceeding.complainant,
        respondent: proceeding.respondent,
        courtId: proceeding.court_id,
        circuit: proceeding.circuit,
        department: proceeding.department,
        claimType: proceeding.claim_type,
        judgmentSummary: proceeding.judgment_summary,
        executionFileNumber: lifecycle.execution.executionFileNumber,
        filingDate: proceeding.filing_date,
        nextDeadlineAt: proceeding.next_deadline_at,
        createdAt: proceeding.created_at,
        updatedAt: proceeding.updated_at,
        hearings,
        documents: scopedDocuments,
        tasks,
        notifications: scopedNotifications,
        billing,
        lifecycle,
        timeline,
      },
      requestId: reqId,
    });
  } catch (error) {
    return fail(normalizeMatterApiError(error, {
      endpoint: "/api/v1/matters/{matterId}/proceedings/{proceedingId}",
      operation: "load proceeding detail",
      fallbackMessage: "Failed to load proceeding detail.",
    }), reqId);
  }
}

export async function PATCH(
  request: Request,
  contextParams: { params: Promise<{ matterId: string; proceedingId: string }> },
) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { matterId, proceedingId } = await contextParams.params;
    const payload = lifecycleMutationSchema.parse(await request.json());
    const supabase = createSupabaseAdmin();

    await assertMatterActionAccess(supabase, context, matterId, requiredPermissionForMutation(payload.action));
    const proceeding = await loadProceedingDetail(supabase, context.accountId, matterId, proceedingId);

    const mutationResult = applyProceedingLifecycleMutation({
      metadata: proceeding.metadata,
      mutation: payload,
      nowIso: new Date().toISOString(),
      createId: () => crypto.randomUUID(),
    });

    const updatePayload: Record<string, unknown> = {
      metadata: mutationResult.metadata,
      updated_by: context.userId,
    };

    if (mutationResult.nextDeadlineAt) {
      updatePayload.next_deadline_at = mutationResult.nextDeadlineAt;
    }

    if (mutationResult.judgmentSummary) {
      updatePayload.judgment_summary = mutationResult.judgmentSummary;
    }

    if (payload.action === "close_execution") {
      updatePayload.status = "closed";
    }

    const { data: updated, error: updateError } = await supabase
      .from("matter_proceedings")
      .update(updatePayload)
      .eq("id", proceedingId)
      .eq("account_id", context.accountId)
      .eq("legal_matter_id", matterId)
      .select("id, metadata, judgment_summary, next_deadline_at, status, updated_at")
      .single();

    if (updateError) throw updateError;

    await writeAuditEvent({
      context,
      action: "MATTER_PROCEEDING_LIFECYCLE_UPDATED",
      targetType: "matter_proceeding",
      targetId: proceedingId,
      requestId: reqId,
      request,
      after: {
        lifecycleAction: payload.action,
        lifecycle: mutationResult.lifecycle,
      },
    });

    return ok({
      data: {
        id: updated.id,
        status: updated.status,
        judgmentSummary: updated.judgment_summary,
        nextDeadlineAt: updated.next_deadline_at,
        updatedAt: updated.updated_at,
        lifecycle: mutationResult.lifecycle,
      },
      requestId: reqId,
    });
  } catch (error) {
    return fail(normalizeMatterApiError(error, {
      endpoint: "/api/v1/matters/{matterId}/proceedings/{proceedingId}",
      operation: "update proceeding lifecycle",
      fallbackMessage: "Failed to update proceeding lifecycle.",
    }), reqId);
  }
}

function requiredPermissionForMutation(action: z.infer<typeof lifecycleMutationSchema>["action"]): MatterActionPermission {
  if (action === "add_session") return "manage_hearings";
  if (action === "close_execution") return "open_execution";
  return "create_proceeding";
}

async function loadProceedingDetail(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  matterId: string,
  proceedingId: string,
) {
  const fullResult = await supabase
    .from("matter_proceedings")
    .select("id, account_id, legal_matter_id, parent_proceeding_id, action_type, stage, status, case_number, report_number, authority, complainant, respondent, court_id, circuit, department, claim_type, judgment_summary, metadata, filing_date, next_deadline_at, client_visible, created_at, updated_at")
    .eq("id", proceedingId)
    .eq("account_id", accountId)
    .eq("legal_matter_id", matterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!fullResult.error && fullResult.data) {
    return fullResult.data;
  }

  if (fullResult.error && !isSchemaDriftError(fullResult.error)) {
    throw fullResult.error;
  }

  if (fullResult.error && isSchemaDriftError(fullResult.error)) {
    const minimalResult = await supabase
      .from("matter_proceedings")
      .select("id, account_id, legal_matter_id, parent_proceeding_id, action_type, stage, status, case_number, report_number, authority, metadata, filing_date, next_deadline_at, client_visible, created_at, updated_at")
      .eq("id", proceedingId)
      .eq("account_id", accountId)
      .eq("legal_matter_id", matterId)
      .is("deleted_at", null)
      .maybeSingle();

    if (minimalResult.error) {
      throw minimalResult.error;
    }

    if (minimalResult.data) {
      return {
        ...minimalResult.data,
        complainant: null,
        respondent: null,
        court_id: null,
        circuit: null,
        department: null,
        claim_type: null,
        judgment_summary: null,
      };
    }
  }

  if (!fullResult.data) {
    throw new ApiError("NOT_FOUND", "Matter proceeding was not found.");
  }

  return fullResult.data;
}

async function loadParentProceeding(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  parentProceedingId: string | null,
) {
  if (!parentProceedingId) {
    return null;
  }

  const { data, error } = await supabase
    .from("matter_proceedings")
    .select("id, action_type, stage, status, case_number, report_number")
    .eq("id", parentProceedingId)
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    if (isSchemaDriftError(error)) {
      return null;
    }
    throw error;
  }
  if (!data) return null;

  return {
    id: data.id,
    actionType: data.action_type,
    stage: data.stage,
    status: data.status,
    caseNumber: data.case_number,
    reportNumber: data.report_number,
  };
}

async function loadProceedingRows(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  table: "hearings" | "documents" | "tasks" | "client_updates" | "invoices",
  proceedingId: string,
  columns: string,
) {
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("account_id", accountId)
    .eq("matter_proceeding_id", proceedingId)
    .is("deleted_at", null);

  if (!error) {
    return (data ?? []) as unknown as Array<Record<string, unknown>>;
  }

  if (isSchemaDriftError(error)) {
    return [];
  }

  throw error;
}
