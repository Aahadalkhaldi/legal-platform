import { ZodError } from "zod";
import { ApiError } from "@/lib/api/errors";

type DbErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

type NormalizeOptions = {
  endpoint: string;
  operation: string;
  fallbackMessage: string;
};

export function normalizeMatterApiError(error: unknown, options: NormalizeOptions) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const path = firstIssue?.path?.join(".") || "payload";
    const message = firstIssue?.message || "Invalid request payload.";
    return new ApiError("VALIDATION_ERROR", `${path}: ${message}`);
  }

  const dbError = asDbError(error);
  if (dbError) {
    if (isPermissionDeniedError(dbError)) {
      return new ApiError("FORBIDDEN", `Permission denied for ${options.operation}.`);
    }

    if (isMissingRelationError(dbError) || isMissingColumnError(dbError)) {
      return new ApiError("BAD_REQUEST", buildSchemaDriftMessage(dbError, options));
    }

    if (typeof dbError.message === "string" && dbError.message.trim().length > 0) {
      return new ApiError("BAD_REQUEST", dbError.message.trim());
    }
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return new ApiError("INTERNAL_ERROR", error.message.trim());
  }

  return new ApiError("INTERNAL_ERROR", options.fallbackMessage);
}

export function isMissingRelationError(error: unknown, relationName?: string) {
  const dbError = asDbError(error);
  if (!dbError) return false;

  const code = typeof dbError.code === "string" ? dbError.code : "";
  const message = typeof dbError.message === "string" ? dbError.message.toLowerCase() : "";
  const details = typeof dbError.details === "string" ? dbError.details.toLowerCase() : "";
  const relationPattern = relationName ? relationName.toLowerCase() : "";

  const missingRelation = code === "42P01"
    || message.includes("does not exist")
    || message.includes("relation")
    || details.includes("does not exist");

  if (!missingRelation) {
    return false;
  }

  if (!relationPattern) {
    return true;
  }

  return message.includes(relationPattern) || details.includes(relationPattern);
}

export function isMissingColumnError(error: unknown, columnName?: string) {
  const dbError = asDbError(error);
  if (!dbError) return false;

  const code = typeof dbError.code === "string" ? dbError.code : "";
  const message = typeof dbError.message === "string" ? dbError.message.toLowerCase() : "";
  const details = typeof dbError.details === "string" ? dbError.details.toLowerCase() : "";
  const columnPattern = columnName ? columnName.toLowerCase() : "";

  const missingColumn = code === "42703"
    || message.includes("column")
    || details.includes("column");

  if (!missingColumn) {
    return false;
  }

  if (!columnPattern) {
    return true;
  }

  return message.includes(columnPattern) || details.includes(columnPattern);
}

export function isSchemaDriftError(error: unknown) {
  return isMissingRelationError(error) || isMissingColumnError(error);
}

export function extractSchemaDriftArtifact(error: unknown) {
  const dbError = asDbError(error);
  if (!dbError) {
    return null;
  }

  const message = typeof dbError.message === "string" ? dbError.message : "";
  const details = typeof dbError.details === "string" ? dbError.details : "";
  const source = `${message}\n${details}`;

  const relationMatch = source.match(/relation\s+"([^"]+)"/i) ?? source.match(/table\s+"([^"]+)"/i);
  if (relationMatch?.[1]) {
    return {
      type: "table" as const,
      name: relationMatch[1],
    };
  }

  const columnMatch = source.match(/column\s+"([^"]+)"/i);
  if (columnMatch?.[1]) {
    return {
      type: "column" as const,
      name: columnMatch[1],
    };
  }

  return null;
}

function buildSchemaDriftMessage(error: DbErrorLike, options: NormalizeOptions) {
  const artifact = extractSchemaDriftArtifact(error);
  if (artifact) {
    return `Schema drift in ${options.endpoint} (${options.operation}): missing ${artifact.type} "${artifact.name}".`;
  }

  const code = typeof error.code === "string" ? error.code : "UNKNOWN";
  const message = typeof error.message === "string" ? error.message : "Schema mismatch detected.";
  return `Schema drift in ${options.endpoint} (${options.operation}): [${code}] ${message}`;
}

function isPermissionDeniedError(error: DbErrorLike) {
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  const details = typeof error.details === "string" ? error.details.toLowerCase() : "";
  return code === "42501"
    || message.includes("permission denied")
    || details.includes("permission denied");
}

function asDbError(error: unknown): DbErrorLike | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  return error as DbErrorLike;
}
