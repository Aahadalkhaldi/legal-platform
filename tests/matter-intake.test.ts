import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  buildMatterIntakeMetadata,
  evaluateRepresentationReadiness,
  isMissingRelationError,
  isUndefinedColumnError,
  mapWorkflowStatusToMatterStatus,
  normalizeMatterIntakeError,
  readWorkflowStatusFromMatter,
  resolveMatterIntakeWorkflowStatus,
} from "@/lib/api/matter-intake";
import { createMatterIntakeSchema } from "@/lib/api/schemas";

const basePayload = {
  saveMode: "activate" as const,
  client: {
    partyType: "natural_person" as const,
    naturalPerson: {
      fullName: "Ahmed Ali",
    },
  },
  relatedParties: [
    {
      partyName: "Opponent Name",
      partyType: "company" as const,
      legalCapacity: "defendant" as const,
    },
  ],
  conflictCheckStatus: "clear" as const,
  engagementAgreementStatus: "signed" as const,
  poaStatus: "valid" as const,
  matter: {
    title: "Commercial Dispute",
    status: "open" as const,
  },
};

describe("matter intake schema", () => {
  it("accepts a valid lawsuit intake payload", () => {
    const payload = createMatterIntakeSchema.parse({
      ...basePayload,
      initialAction: "lawsuit",
      lawsuit: {
        caseNumber: "2026/1024",
      },
    });

    expect(payload.initialAction).toBe("lawsuit");
    expect(payload.client.partyType).toBe("natural_person");
    expect(payload.relatedParties.length).toBe(1);
  });

  it("requires complaint details when initialAction is complaint", () => {
    expect(() => createMatterIntakeSchema.parse({
      ...basePayload,
      initialAction: "complaint",
    })).toThrowError("Complaint details are required when initialAction is complaint.");
  });

  it("requires client organization details for company-like client types", () => {
    expect(() => createMatterIntakeSchema.parse({
      ...basePayload,
      client: {
        partyType: "company",
      },
      initialAction: "lawsuit",
      lawsuit: {
        caseNumber: "2026/1024",
      },
    })).toThrowError("Organization details are required");
  });
});

describe("matter intake helpers", () => {
  it("detects missing-table and undefined-column errors", () => {
    expect(isMissingRelationError({
      code: "42P01",
      message: "relation \"public.opponents\" does not exist",
    }, "opponents")).toBe(true);

    expect(isUndefinedColumnError({
      code: "42703",
      message: "column legal_matter_id does not exist",
    }, "legal_matter_id")).toBe(true);
  });

  it("builds metadata with related parties and readiness", () => {
    const payload = createMatterIntakeSchema.parse({
      ...basePayload,
      initialAction: "complaint",
      complaint: {
        actionType: "police_report",
        policeStation: "Doha Station",
      },
      saveMode: "draft",
      conflictCheckStatus: "pending",
      engagementAgreementStatus: "pending",
      poaStatus: "pending",
    });

    const readiness = evaluateRepresentationReadiness(payload);
    expect(readiness.readyForActivation).toBe(false);

    const metadata = buildMatterIntakeMetadata({
      context: {
        userId: "11111111-1111-4111-8111-111111111111",
        email: "owner@example.com",
        accountId: "22222222-2222-4222-8222-222222222222",
        role: "owner",
        permissions: ["cases:create"],
      },
      payload,
      clientId: null,
      relatedParties: {
        persistedIds: [],
        persistedCount: 0,
      },
      proceedingId: null,
      fallbackSteps: ["client_saved_in_metadata", "related_parties_saved_in_metadata"],
      workflowStatus: "draft",
      representationReadiness: readiness,
    });

    expect(metadata.intakeMvp.client.persisted).toBe(false);
    expect(metadata.intakeMvp.relatedParties.persistedCount).toBe(0);
    expect(metadata.intakeMvp.workflowStatus).toBe("draft");
    expect(metadata.intakeMvp.representationReadiness.readyForActivation).toBe(false);
  });

  it("resolves workflow status and status mapping correctly", () => {
    const payload = createMatterIntakeSchema.parse({
      ...basePayload,
      initialAction: "lawsuit",
      lawsuit: { caseNumber: "2026/1024" },
    });
    const readiness = evaluateRepresentationReadiness(payload);

    const activeWorkflow = resolveMatterIntakeWorkflowStatus({
      saveMode: "activate",
      representationReadiness: readiness,
    });
    expect(activeWorkflow).toBe("active");
    expect(mapWorkflowStatusToMatterStatus(activeWorkflow)).toBe("open");

    const pendingWorkflow = resolveMatterIntakeWorkflowStatus({
      saveMode: "activate",
      representationReadiness: {
        readyForActivation: false,
        issues: ["poa_not_valid"],
      },
    });
    expect(pendingWorkflow).toBe("pending_documents");
    expect(mapWorkflowStatusToMatterStatus(pendingWorkflow)).toBe("on_hold");
  });

  it("reads workflow status from metadata with fallback", () => {
    expect(readWorkflowStatusFromMatter({
      intakeMvp: { workflowStatus: "pending_documents" },
    }, "open")).toBe("pending_documents");

    expect(readWorkflowStatusFromMatter({}, "open")).toBe("active");
    expect(readWorkflowStatusFromMatter({}, "on_hold")).toBe("draft");
  });

  it("normalizes validation and postgres errors to ApiError", () => {
    const zodError = (() => {
      try {
        createMatterIntakeSchema.parse({
          ...basePayload,
          initialAction: "lawsuit",
        });
      } catch (error) {
        return error;
      }
      return new Error("Expected schema parse to fail.");
    })();

    const normalizedValidationError = normalizeMatterIntakeError(zodError);
    expect(normalizedValidationError).toBeInstanceOf(ApiError);
    expect(normalizedValidationError.code).toBe("VALIDATION_ERROR");

    const normalizedDbError = normalizeMatterIntakeError({
      code: "23505",
      message: "duplicate key value violates unique constraint",
      details: "Key (account_id,matter_number) already exists.",
    });
    expect(normalizedDbError.code).toBe("BAD_REQUEST");
    expect(normalizedDbError.message).toBe("duplicate key value violates unique constraint");
  });
});
