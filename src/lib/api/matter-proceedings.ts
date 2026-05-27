import { ApiError } from "@/lib/api/errors";

export const PROCEEDING_STAGE_VALUES = [
  "first_instance",
  "appeal",
  "cassation",
  "execution",
  "urgent_request",
  "related_case",
] as const;

export const MATTER_ACTION_TYPE_VALUES = [
  "lawsuit",
  "appeal",
  "cassation",
  "execution",
  "urgent_request",
  "police_report",
  "public_prosecution_complaint",
  "cybercrime_report",
  "labor_complaint",
  "administrative_complaint",
  "regulatory_complaint",
] as const;

export const COMPLAINT_ACTION_TYPE_VALUES = [
  "police_report",
  "public_prosecution_complaint",
  "cybercrime_report",
  "labor_complaint",
  "administrative_complaint",
  "regulatory_complaint",
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
export type MatterActionType = (typeof MATTER_ACTION_TYPE_VALUES)[number];

export type MatterProceedingRecord = {
  id: string;
  action_type: MatterActionType;
  stage: ProceedingStage;
  status: ProceedingStatus;
  account_id: string;
  legal_matter_id: string;
  case_number: string | null;
  court_id: string | null;
  circuit: string | null;
  department: string | null;
  claim_type: string | null;
  judgment_summary: string | null;
  authority: string | null;
  report_number: string | null;
  submission_date: string | null;
  complainant: string | null;
  respondent: string | null;
  investigation_sessions: Record<string, unknown>[] | null;
  prosecutor_name: string | null;
  police_station: string | null;
  related_lawsuit_proceeding_id: string | null;
  filing_date: string | null;
  next_deadline_at: string | null;
  fees_amount: number | null;
  metadata: Record<string, unknown> | null;
};

export function isComplaintActionType(actionType: MatterActionType) {
  return COMPLAINT_ACTION_TYPE_VALUES.includes(actionType as (typeof COMPLAINT_ACTION_TYPE_VALUES)[number]);
}

export function resolveStageForActionType(actionType: MatterActionType, explicitStage?: ProceedingStage): ProceedingStage {
  const defaultStage = defaultStageByActionType[actionType];
  if (!explicitStage) {
    return defaultStage;
  }

  const allowedStages = allowedStagesByActionType[actionType];
  if (!allowedStages.includes(explicitStage)) {
    throw new ApiError(
      "CONFLICT",
      `Stage ${explicitStage} is not valid for action type ${actionType}.`,
    );
  }

  return explicitStage;
}

export function assertMatterActionTransition(
  sourceProceeding: Pick<MatterProceedingRecord, "action_type" | "stage">,
  targetActionType: MatterActionType,
) {
  if (targetActionType === "appeal" && sourceProceeding.stage !== "first_instance") {
    throw new ApiError("CONFLICT", "Appeal can only be created from a first-instance proceeding.");
  }

  if (targetActionType === "cassation" && sourceProceeding.stage !== "appeal") {
    throw new ApiError("CONFLICT", "Cassation can only be created from an appeal proceeding.");
  }

  if (targetActionType === "execution" && sourceProceeding.action_type === "execution") {
    throw new ApiError("CONFLICT", "Execution proceeding cannot be created from another execution proceeding.");
  }

  if (targetActionType === "lawsuit" && !isComplaintActionType(sourceProceeding.action_type)) {
    throw new ApiError("CONFLICT", "Lawsuit conversion is only allowed from a complaint/report proceeding.");
  }

  if (targetActionType === "public_prosecution_complaint" && !isComplaintActionType(sourceProceeding.action_type)) {
    throw new ApiError("CONFLICT", "Prosecution case conversion is only allowed from a complaint/report proceeding.");
  }
}

export function buildProceedingTransitionInsert(input: {
  sourceProceeding: MatterProceedingRecord;
  targetActionType: MatterActionType;
  targetStage?: ProceedingStage;
  actorUserId: string;
  metadata?: Record<string, unknown>;
  caseNumber?: string | null;
  courtId?: string | null;
  circuit?: string | null;
  department?: string | null;
  claimType?: string | null;
  judgmentSummary?: string | null;
  authority?: string | null;
  reportNumber?: string | null;
  submissionDate?: string | null;
  complainant?: string | null;
  respondent?: string | null;
  investigationSessions?: Record<string, unknown>[] | null;
  prosecutorName?: string | null;
  policeStation?: string | null;
  relatedLawsuitProceedingId?: string | null;
  filingDate?: string | null;
  nextDeadlineAt?: string | null;
  feesAmount?: number | null;
}) {
  assertMatterActionTransition(input.sourceProceeding, input.targetActionType);
  const resolvedStage = resolveStageForActionType(input.targetActionType, input.targetStage);

  return {
    account_id: input.sourceProceeding.account_id,
    legal_matter_id: input.sourceProceeding.legal_matter_id,
    parent_proceeding_id: input.sourceProceeding.id,
    action_type: input.targetActionType,
    stage: resolvedStage,
    status: "open" as ProceedingStatus,
    case_number: input.caseNumber ?? input.sourceProceeding.case_number,
    court_id: input.courtId ?? input.sourceProceeding.court_id,
    circuit: input.circuit ?? input.sourceProceeding.circuit,
    department: input.department ?? input.sourceProceeding.department,
    claim_type: input.claimType ?? input.sourceProceeding.claim_type,
    judgment_summary: input.judgmentSummary ?? null,
    authority: input.authority ?? input.sourceProceeding.authority,
    report_number: input.reportNumber ?? input.sourceProceeding.report_number,
    submission_date: input.submissionDate ?? input.sourceProceeding.submission_date,
    complainant: input.complainant ?? input.sourceProceeding.complainant,
    respondent: input.respondent ?? input.sourceProceeding.respondent,
    investigation_sessions: input.investigationSessions ?? input.sourceProceeding.investigation_sessions ?? [],
    prosecutor_name: input.prosecutorName ?? input.sourceProceeding.prosecutor_name,
    police_station: input.policeStation ?? input.sourceProceeding.police_station,
    related_lawsuit_proceeding_id:
      input.relatedLawsuitProceedingId ?? input.sourceProceeding.related_lawsuit_proceeding_id ?? null,
    filing_date: input.filingDate ?? null,
    next_deadline_at: input.nextDeadlineAt ?? input.sourceProceeding.next_deadline_at,
    fees_amount: input.feesAmount ?? input.sourceProceeding.fees_amount ?? 0,
    metadata: input.metadata ?? {
      inheritedFromProceedingId: input.sourceProceeding.id,
      sourceActionType: input.sourceProceeding.action_type,
      targetActionType: input.targetActionType,
      sourceStage: input.sourceProceeding.stage,
      targetStage: resolvedStage,
    },
    created_by: input.actorUserId,
    updated_by: input.actorUserId,
  };
}

const defaultStageByActionType: Record<MatterActionType, ProceedingStage> = {
  lawsuit: "first_instance",
  appeal: "appeal",
  cassation: "cassation",
  execution: "execution",
  urgent_request: "urgent_request",
  police_report: "related_case",
  public_prosecution_complaint: "related_case",
  cybercrime_report: "related_case",
  labor_complaint: "related_case",
  administrative_complaint: "related_case",
  regulatory_complaint: "related_case",
};

const allowedStagesByActionType: Record<MatterActionType, ProceedingStage[]> = {
  lawsuit: ["first_instance"],
  appeal: ["appeal"],
  cassation: ["cassation"],
  execution: ["execution"],
  urgent_request: ["urgent_request"],
  police_report: ["related_case", "urgent_request"],
  public_prosecution_complaint: ["related_case", "urgent_request"],
  cybercrime_report: ["related_case", "urgent_request"],
  labor_complaint: ["related_case", "urgent_request"],
  administrative_complaint: ["related_case", "urgent_request"],
  regulatory_complaint: ["related_case", "urgent_request"],
};
