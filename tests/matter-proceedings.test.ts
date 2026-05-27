import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  assertMatterStageTransition,
  buildProceedingTransitionInsert,
  type MatterProceedingRecord,
} from "@/lib/api/matter-proceedings";
import { createLegalMatterSchema, createMatterProceedingSchema, convertMatterProceedingSchema } from "@/lib/api/schemas";

const sourceProceeding: MatterProceedingRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  stage: "first_instance",
  status: "closed",
  account_id: "22222222-2222-4222-8222-222222222222",
  legal_matter_id: "33333333-3333-4333-8333-333333333333",
  case_number: "2026/1042",
  court_id: "44444444-4444-4444-8444-444444444444",
  department: "Commercial",
  filing_date: "2026-01-15T08:00:00.000Z",
  next_deadline_at: "2026-02-10T08:00:00.000Z",
  fees_amount: 12000,
  metadata: { source: "fixture" },
};

describe("matter proceedings transition rules", () => {
  it("allows creating appeal from first instance", () => {
    expect(() => assertMatterStageTransition("first_instance", "appeal")).not.toThrow();
  });

  it("blocks creating appeal from non first-instance stages", () => {
    expect(() => assertMatterStageTransition("cassation", "appeal")).toThrowError(ApiError);
  });

  it("allows creating cassation from appeal only", () => {
    expect(() => assertMatterStageTransition("appeal", "cassation")).not.toThrow();
    expect(() => assertMatterStageTransition("first_instance", "cassation")).toThrowError(ApiError);
  });

  it("blocks creating execution from execution", () => {
    expect(() => assertMatterStageTransition("execution", "execution")).toThrowError(ApiError);
  });
});

describe("buildProceedingTransitionInsert", () => {
  it("creates a new proceeding payload without mutating the source stage", () => {
    const payload = buildProceedingTransitionInsert({
      sourceProceeding,
      targetStage: "appeal",
      actorUserId: "55555555-5555-4555-8555-555555555555",
    });

    expect(payload).toMatchObject({
      account_id: sourceProceeding.account_id,
      legal_matter_id: sourceProceeding.legal_matter_id,
      parent_proceeding_id: sourceProceeding.id,
      stage: "appeal",
      status: "open",
      case_number: sourceProceeding.case_number,
      court_id: sourceProceeding.court_id,
      department: sourceProceeding.department,
      next_deadline_at: sourceProceeding.next_deadline_at,
      fees_amount: sourceProceeding.fees_amount,
      created_by: "55555555-5555-4555-8555-555555555555",
      updated_by: "55555555-5555-4555-8555-555555555555",
    });
    expect(sourceProceeding.stage).toBe("first_instance");
  });

  it("applies explicit overrides when provided", () => {
    const payload = buildProceedingTransitionInsert({
      sourceProceeding,
      targetStage: "appeal",
      actorUserId: "55555555-5555-4555-8555-555555555555",
      caseNumber: "2026/221",
      department: "Appeals",
      feesAmount: 4000,
      metadata: { convertedBy: "manual_action" },
    });

    expect(payload.case_number).toBe("2026/221");
    expect(payload.department).toBe("Appeals");
    expect(payload.fees_amount).toBe(4000);
    expect(payload.metadata).toEqual({ convertedBy: "manual_action" });
  });
});

describe("matter lifecycle schemas", () => {
  it("applies default legal matter status", () => {
    const payload = createLegalMatterSchema.parse({
      title: "Commercial Contract Dispute",
    });

    expect(payload.status).toBe("open");
  });

  it("validates proceeding creation payload", () => {
    const payload = createMatterProceedingSchema.parse({
      stage: "first_instance",
      caseNumber: "2026/1042",
      feesAmountQar: 1000,
    });

    expect(payload.stage).toBe("first_instance");
    expect(payload.status).toBe("open");
    expect(payload.caseNumber).toBe("2026/1042");
  });

  it("accepts conversion payload overrides", () => {
    const payload = convertMatterProceedingSchema.parse({
      caseNumber: "2026/221",
      department: "Appeals",
      feesAmountQar: 4000,
    });

    expect(payload.caseNumber).toBe("2026/221");
    expect(payload.department).toBe("Appeals");
    expect(payload.feesAmountQar).toBe(4000);
  });
});
