import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  buildMatterIntakeMetadata,
  isMissingRelationError,
  isUndefinedColumnError,
  normalizeMatterIntakeError,
} from "@/lib/api/matter-intake";
import { createMatterIntakeSchema } from "@/lib/api/schemas";

const basePayload = {
  client: {
    fullName: "Ahmed Ali",
  },
  opposingParty: {
    fullName: "Opponent Name",
  },
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
    expect(payload.lawsuit?.caseNumber).toBe("2026/1024");
  });

  it("requires lawsuit details when initialAction is lawsuit", () => {
    expect(() => createMatterIntakeSchema.parse({
      ...basePayload,
      initialAction: "lawsuit",
    })).toThrowError("Lawsuit details are required when initialAction is lawsuit.");
  });

  it("requires complaint details when initialAction is complaint", () => {
    expect(() => createMatterIntakeSchema.parse({
      ...basePayload,
      initialAction: "complaint",
    })).toThrowError("Complaint details are required when initialAction is complaint.");
  });
});

describe("matter intake helpers", () => {
  it("detects missing-table and undefined-column database drift errors", () => {
    expect(isMissingRelationError({
      code: "42P01",
      message: "relation \"public.clients\" does not exist",
    }, "clients")).toBe(true);

    expect(isUndefinedColumnError({
      code: "42703",
      message: "column intake_type does not exist",
    }, "intake_type")).toBe(true);
  });

  it("builds metadata that keeps fallback and onboarding fields", () => {
    const payload = createMatterIntakeSchema.parse({
      ...basePayload,
      initialAction: "complaint",
      complaint: {
        actionType: "police_report",
        authority: "Doha Police",
      },
    });

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
      opponentId: "33333333-3333-4333-8333-333333333333",
      proceedingId: null,
      fallbackSteps: ["client_saved_in_metadata", "initial_action_saved_in_metadata"],
    });

    expect(metadata.intakeMvp.client.persisted).toBe(false);
    expect(metadata.intakeMvp.opposingParty.persisted).toBe(true);
    expect(metadata.intakeMvp.initialAction.persisted).toBe(false);
    expect(metadata.intakeMvp.fallbackSteps).toContain("client_saved_in_metadata");
  });

  it("normalizes zod and postgres errors into ApiError with exact messages", () => {
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
    expect(normalizedValidationError.message).toContain("Lawsuit details are required");

    const normalizedDbError = normalizeMatterIntakeError({
      code: "23505",
      message: "duplicate key value violates unique constraint",
      details: "Key (account_id,matter_number) already exists.",
    });
    expect(normalizedDbError.code).toBe("BAD_REQUEST");
    expect(normalizedDbError.message).toBe("duplicate key value violates unique constraint");
  });
});
