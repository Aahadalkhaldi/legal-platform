import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  assertMatterActionTransition,
  buildProceedingTransitionInsert,
  resolveStageForActionType,
  type MatterProceedingRecord,
} from "@/lib/api/matter-proceedings";
import {
  createLegalMatterSchema,
  createMatterProceedingSchema,
  convertMatterProceedingSchema,
} from "@/lib/api/schemas";

const sourceProceeding: MatterProceedingRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  action_type: "lawsuit",
  stage: "first_instance",
  status: "closed",
  account_id: "22222222-2222-4222-8222-222222222222",
  legal_matter_id: "33333333-3333-4333-8333-333333333333",
  case_number: "2026/1042",
  court_id: "44444444-4444-4444-8444-444444444444",
  circuit: "Commercial Chamber",
  department: "Commercial",
  claim_type: "contract_dispute",
  judgment_summary: null,
  authority: null,
  report_number: null,
  submission_date: null,
  complainant: null,
  respondent: null,
  investigation_sessions: [],
  prosecutor_name: null,
  police_station: null,
  related_lawsuit_proceeding_id: null,
  filing_date: "2026-01-15T08:00:00.000Z",
  next_deadline_at: "2026-02-10T08:00:00.000Z",
  fees_amount: 12000,
  metadata: { source: "fixture" },
};

const sourceComplaint: MatterProceedingRecord = {
  ...sourceProceeding,
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  action_type: "police_report",
  stage: "related_case",
  case_number: null,
  claim_type: null,
  authority: "Central Police Station",
  report_number: "PR-2026-22",
};

describe("matter proceedings transition rules", () => {
  it("allows creating appeal from first instance lawsuit", () => {
    expect(() => assertMatterActionTransition(sourceProceeding, "appeal")).not.toThrow();
  });

  it("blocks creating appeal from non first-instance stage", () => {
    expect(() => assertMatterActionTransition({ ...sourceProceeding, stage: "cassation" }, "appeal")).toThrowError(ApiError);
  });

  it("allows creating cassation from appeal only", () => {
    expect(() => assertMatterActionTransition({ ...sourceProceeding, stage: "appeal", action_type: "appeal" }, "cassation")).not.toThrow();
    expect(() => assertMatterActionTransition(sourceProceeding, "cassation")).toThrowError(ApiError);
  });

  it("blocks creating execution from execution action type", () => {
    expect(() => assertMatterActionTransition({ ...sourceProceeding, action_type: "execution", stage: "execution" }, "execution")).toThrowError(ApiError);
  });

  it("allows complaint conversion to lawsuit or prosecution case", () => {
    expect(() => assertMatterActionTransition(sourceComplaint, "lawsuit")).not.toThrow();
    expect(() => assertMatterActionTransition(sourceComplaint, "public_prosecution_complaint")).not.toThrow();
  });

  it("blocks lawsuit conversion from non-complaint action type", () => {
    expect(() => assertMatterActionTransition(sourceProceeding, "lawsuit")).toThrowError(ApiError);
  });
});

describe("resolveStageForActionType", () => {
  it("maps complaint actions to related_case by default", () => {
    expect(resolveStageForActionType("police_report")).toBe("related_case");
  });

  it("maps lawsuit/court actions to matching stages", () => {
    expect(resolveStageForActionType("lawsuit")).toBe("first_instance");
    expect(resolveStageForActionType("appeal")).toBe("appeal");
    expect(resolveStageForActionType("execution")).toBe("execution");
  });

  it("rejects invalid explicit stage for action type", () => {
    expect(() => resolveStageForActionType("cassation", "first_instance")).toThrowError(ApiError);
  });
});

describe("buildProceedingTransitionInsert", () => {
  it("creates a new appeal payload without mutating the source proceeding", () => {
    const payload = buildProceedingTransitionInsert({
      sourceProceeding,
      targetActionType: "appeal",
      actorUserId: "55555555-5555-4555-8555-555555555555",
    });

    expect(payload).toMatchObject({
      account_id: sourceProceeding.account_id,
      legal_matter_id: sourceProceeding.legal_matter_id,
      parent_proceeding_id: sourceProceeding.id,
      action_type: "appeal",
      stage: "appeal",
      status: "open",
      case_number: sourceProceeding.case_number,
      court_id: sourceProceeding.court_id,
      circuit: sourceProceeding.circuit,
      department: sourceProceeding.department,
      claim_type: sourceProceeding.claim_type,
      next_deadline_at: sourceProceeding.next_deadline_at,
      fees_amount: sourceProceeding.fees_amount,
      created_by: "55555555-5555-4555-8555-555555555555",
      updated_by: "55555555-5555-4555-8555-555555555555",
    });
    expect(sourceProceeding.stage).toBe("first_instance");
    expect(sourceProceeding.action_type).toBe("lawsuit");
  });

  it("applies explicit overrides for complaint to lawsuit conversion", () => {
    const payload = buildProceedingTransitionInsert({
      sourceProceeding: sourceComplaint,
      targetActionType: "lawsuit",
      actorUserId: "55555555-5555-4555-8555-555555555555",
      caseNumber: "2026/221",
      department: "Appeals",
      claimType: "damages",
      feesAmount: 4000,
      metadata: { convertedBy: "manual_action" },
    });

    expect(payload.case_number).toBe("2026/221");
    expect(payload.department).toBe("Appeals");
    expect(payload.claim_type).toBe("damages");
    expect(payload.fees_amount).toBe(4000);
    expect(payload.metadata).toEqual({ convertedBy: "manual_action" });
    expect(payload.stage).toBe("first_instance");
  });
});

describe("matter lifecycle schemas", () => {
  it("applies default legal matter status and intake type", () => {
    const payload = createLegalMatterSchema.parse({
      title: "Commercial Contract Dispute",
    });

    expect(payload.status).toBe("open");
    expect(payload.intakeType).toBe("lawsuit");
  });

  it("validates proceeding creation payload with action type", () => {
    const payload = createMatterProceedingSchema.parse({
      actionType: "lawsuit",
      caseNumber: "2026/1042",
      claimType: "commercial",
      feesAmountQar: 1000,
    });

    expect(payload.actionType).toBe("lawsuit");
    expect(payload.status).toBe("open");
    expect(payload.caseNumber).toBe("2026/1042");
  });

  it("validates complaint payload fields", () => {
    const payload = createMatterProceedingSchema.parse({
      actionType: "police_report",
      authority: "Central Police Station",
      reportNumber: "PR-22",
      complainant: "ACME",
      respondent: "John Doe",
      investigationSessions: [{ date: "2026-05-27", note: "session-1" }],
    });

    expect(payload.actionType).toBe("police_report");
    expect(payload.authority).toBe("Central Police Station");
    expect(payload.investigationSessions?.length).toBe(1);
  });

  it("accepts conversion payload overrides including complaint/lawsuit fields", () => {
    const payload = convertMatterProceedingSchema.parse({
      caseNumber: "2026/221",
      circuit: "Civil",
      department: "Appeals",
      claimType: "damages",
      authority: "Prosecution",
      reportNumber: "PP-123",
      feesAmountQar: 4000,
    });

    expect(payload.caseNumber).toBe("2026/221");
    expect(payload.circuit).toBe("Civil");
    expect(payload.department).toBe("Appeals");
    expect(payload.claimType).toBe("damages");
    expect(payload.authority).toBe("Prosecution");
    expect(payload.feesAmountQar).toBe(4000);
  });
});
