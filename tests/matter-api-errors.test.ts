import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  extractSchemaDriftArtifact,
  isMissingColumnError,
  isMissingRelationError,
  isSchemaDriftError,
  normalizeMatterApiError,
} from "@/lib/api/matter-api-errors";

describe("matter api schema drift detection", () => {
  it("detects missing relation errors for related proceeding tables", () => {
    const missingHearings = {
      code: "42P01",
      message: 'relation "public.hearings" does not exist',
    };
    const missingDocuments = {
      code: "42P01",
      message: 'relation "public.documents" does not exist',
    };

    expect(isMissingRelationError(missingHearings, "hearings")).toBe(true);
    expect(isMissingRelationError(missingDocuments, "documents")).toBe(true);
    expect(isSchemaDriftError(missingHearings)).toBe(true);
    expect(isSchemaDriftError(missingDocuments)).toBe(true);
  });

  it("detects missing column errors and extracts artifact name", () => {
    const missingColumn = {
      code: "42703",
      message: 'column "matter_proceeding_id" does not exist',
    };

    expect(isMissingColumnError(missingColumn, "matter_proceeding_id")).toBe(true);
    expect(isSchemaDriftError(missingColumn)).toBe(true);
    expect(extractSchemaDriftArtifact(missingColumn)).toEqual({
      type: "column",
      name: "matter_proceeding_id",
    });
  });
});

describe("matter api error normalization", () => {
  it("maps zod errors to validation errors with field path", () => {
    const schema = z.object({
      actionType: z.string().min(2),
    });

    let zodError: unknown = null;
    try {
      schema.parse({ actionType: "" });
    } catch (error) {
      zodError = error;
    }

    const normalized = normalizeMatterApiError(zodError, {
      endpoint: "/api/v1/matters/{matterId}/proceedings",
      operation: "create proceeding",
      fallbackMessage: "Failed to create proceeding.",
    });

    expect(normalized.code).toBe("VALIDATION_ERROR");
    expect(normalized.message).toContain("actionType");
  });

  it("returns precise schema drift message for missing proceeding table", () => {
    const normalized = normalizeMatterApiError(
      {
        code: "42P01",
        message: 'relation "public.matter_proceedings" does not exist',
      },
      {
        endpoint: "/api/v1/matters/{matterId}/proceedings",
        operation: "create proceeding",
        fallbackMessage: "Failed to create proceeding.",
      },
    );

    expect(normalized.code).toBe("BAD_REQUEST");
    expect(normalized.message).toContain("missing table");
    expect(normalized.message).toContain("matter_proceedings");
  });

  it("maps permission denied database errors to forbidden", () => {
    const normalized = normalizeMatterApiError(
      {
        code: "42501",
        message: "permission denied for table matter_proceedings",
      },
      {
        endpoint: "/api/v1/matters/{matterId}/proceedings",
        operation: "create proceeding",
        fallbackMessage: "Failed to create proceeding.",
      },
    );

    expect(normalized.code).toBe("FORBIDDEN");
    expect(normalized.message).toContain("Permission denied");
  });
});
