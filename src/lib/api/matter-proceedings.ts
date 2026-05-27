import { ApiError } from "@/lib/api/errors";

export const PROCEEDING_STAGE_VALUES = [
  "first_instance",
  "appeal",
  "cassation",
  "execution",
  "urgent_request",
  "related_case",
] as const;

export const PROCEEDING_STATUS_VALUES = [
  "open",
  "pending",
  "on_hold",
  "closed",
  "archived",
] as const;

export type ProceedingStage = (typeof PROCEEDING_STAGE_VALUES)[number];
export type ProceedingStatus = (typeof PROCEEDING_STATUS_VALUES)[number];

export type MatterProceedingRecord = {
  id: string;
  stage: ProceedingStage;
  status: ProceedingStatus;
  account_id: string;
  legal_matter_id: string;
  case_number: string | null;
  court_id: string | null;
  department: string | null;
  filing_date: string | null;
  next_deadline_at: string | null;
  fees_amount: number | null;
  metadata: Record<string, unknown> | null;
};

export function assertMatterStageTransition(sourceStage: ProceedingStage, targetStage: ProceedingStage) {
  if (targetStage === "appeal" && sourceStage !== "first_instance") {
    throw new ApiError("CONFLICT", "Appeal can only be created from a first-instance proceeding.");
  }

  if (targetStage === "cassation" && sourceStage !== "appeal") {
    throw new ApiError("CONFLICT", "Cassation can only be created from an appeal proceeding.");
  }

  if (targetStage === "execution" && sourceStage === "execution") {
    throw new ApiError("CONFLICT", "Execution proceeding cannot be created from another execution proceeding.");
  }
}

export function buildProceedingTransitionInsert(input: {
  sourceProceeding: MatterProceedingRecord;
  targetStage: ProceedingStage;
  actorUserId: string;
  metadata?: Record<string, unknown>;
  caseNumber?: string | null;
  courtId?: string | null;
  department?: string | null;
  filingDate?: string | null;
  nextDeadlineAt?: string | null;
  feesAmount?: number | null;
}) {
  assertMatterStageTransition(input.sourceProceeding.stage, input.targetStage);

  return {
    account_id: input.sourceProceeding.account_id,
    legal_matter_id: input.sourceProceeding.legal_matter_id,
    parent_proceeding_id: input.sourceProceeding.id,
    stage: input.targetStage,
    status: "open" as ProceedingStatus,
    case_number: input.caseNumber ?? input.sourceProceeding.case_number,
    court_id: input.courtId ?? input.sourceProceeding.court_id,
    department: input.department ?? input.sourceProceeding.department,
    filing_date: input.filingDate ?? null,
    next_deadline_at: input.nextDeadlineAt ?? input.sourceProceeding.next_deadline_at,
    fees_amount: input.feesAmount ?? input.sourceProceeding.fees_amount ?? 0,
    metadata: input.metadata ?? {
      inheritedFromProceedingId: input.sourceProceeding.id,
      sourceStage: input.sourceProceeding.stage,
      targetStage: input.targetStage,
    },
    created_by: input.actorUserId,
    updated_by: input.actorUserId,
  };
}
