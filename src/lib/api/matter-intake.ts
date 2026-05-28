import { ZodError } from "zod";
import { ApiError } from "@/lib/api/errors";
import type { CreateMatterIntakePayload } from "@/lib/api/schemas";
import type { CurrentUser } from "@/lib/types";

export const MATTER_INTAKE_FALLBACK_STEPS = [
  "client_saved_in_metadata",
  "related_parties_saved_in_metadata",
  "initial_action_saved_in_metadata",
  "intake_type_saved_in_metadata",
] as const;

export type MatterIntakeFallbackStep = (typeof MATTER_INTAKE_FALLBACK_STEPS)[number];
export const MATTER_INTAKE_WORKFLOW_STATUSES = ["draft", "active", "pending_documents"] as const;
export type MatterIntakeWorkflowStatus = (typeof MATTER_INTAKE_WORKFLOW_STATUSES)[number];
export type MatterIntakeSaveMode = "draft" | "activate";

type RepresentationReadinessIssue =
  | "conflict_check_not_clear"
  | "engagement_not_signed"
  | "poa_not_valid";

type RepresentationReadiness = {
  readyForActivation: boolean;
  issues: RepresentationReadinessIssue[];
};

type PgErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

export function isMissingRelationError(error: unknown, relation: string) {
  const typed = asPgError(error);
  if (typed.code !== "42P01") {
    return false;
  }

  const relationPattern = relation.toLowerCase();
  return typed.message.toLowerCase().includes(relationPattern)
    || typed.details.toLowerCase().includes(relationPattern);
}

export function isUndefinedColumnError(error: unknown, column?: string) {
  const typed = asPgError(error);
  if (typed.code !== "42703") {
    return false;
  }

  if (!column) {
    return true;
  }

  const columnPattern = column.toLowerCase();
  return typed.message.toLowerCase().includes(columnPattern)
    || typed.details.toLowerCase().includes(columnPattern);
}

export function normalizeMatterIntakeError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const path = firstIssue?.path?.length ? `${firstIssue.path.join(".")}: ` : "";
    return new ApiError("VALIDATION_ERROR", `${path}${firstIssue?.message ?? "Invalid request payload."}`, {
      issues: error.issues,
    });
  }

  const typed = asPgError(error);
  if (typed.message) {
    return new ApiError("BAD_REQUEST", typed.message, {
      postgresCode: typed.code || null,
      details: typed.details || null,
      hint: typed.hint || null,
    });
  }

  if (error instanceof Error && error.message) {
    return new ApiError("BAD_REQUEST", error.message);
  }

  return new ApiError("BAD_REQUEST", "Matter intake request could not be processed.");
}

export function buildMatterIntakeMetadata(input: {
  context: CurrentUser;
  payload: CreateMatterIntakePayload;
  clientId: string | null;
  relatedParties: {
    persistedIds: string[];
    persistedCount: number;
  };
  proceedingId: string | null;
  fallbackSteps: MatterIntakeFallbackStep[];
  workflowStatus: MatterIntakeWorkflowStatus;
  representationReadiness: RepresentationReadiness;
}) {
  const initialActionDetails = input.payload.initialAction === "lawsuit"
    ? input.payload.lawsuit ?? null
    : input.payload.complaint ?? null;

  return {
    intakeMvp: {
      version: 1,
      capturedAt: new Date().toISOString(),
      actorUserId: input.context.userId,
      saveMode: input.payload.saveMode,
      workflowStatus: input.workflowStatus,
      conflictCheck: {
        status: input.payload.conflictCheckStatus,
      },
      engagementAgreement: {
        status: input.payload.engagementAgreementStatus,
      },
      poa: {
        status: input.payload.poaStatus,
      },
      client: {
        id: input.clientId,
        persisted: Boolean(input.clientId),
        payload: input.payload.client,
      },
      relatedParties: {
        ids: input.relatedParties.persistedIds,
        persistedCount: input.relatedParties.persistedCount,
        payload: input.payload.relatedParties,
      },
      initialAction: {
        type: input.payload.initialAction,
        proceedingId: input.proceedingId,
        persisted: Boolean(input.proceedingId),
        payload: initialActionDetails,
      },
      representationReadiness: input.representationReadiness,
      fallbackSteps: input.fallbackSteps,
    },
  };
}

export function resolveMatterIntakeWorkflowStatus(input: {
  saveMode: MatterIntakeSaveMode;
  representationReadiness: RepresentationReadiness;
}): MatterIntakeWorkflowStatus {
  if (input.saveMode === "draft") {
    return "draft";
  }

  if (input.representationReadiness.readyForActivation) {
    return "active";
  }

  return "pending_documents";
}

export function evaluateRepresentationReadiness(payload: CreateMatterIntakePayload): RepresentationReadiness {
  const issues: RepresentationReadinessIssue[] = [];

  if (payload.conflictCheckStatus !== "clear") {
    issues.push("conflict_check_not_clear");
  }

  if (payload.engagementAgreementStatus !== "signed") {
    issues.push("engagement_not_signed");
  }

  if (payload.poaStatus !== "valid") {
    issues.push("poa_not_valid");
  }

  return {
    readyForActivation: issues.length === 0,
    issues,
  };
}

export function mapWorkflowStatusToMatterStatus(workflowStatus: MatterIntakeWorkflowStatus) {
  if (workflowStatus === "active") {
    return "open";
  }

  return "on_hold";
}

export function readWorkflowStatusFromMatter(metadata: unknown, matterStatus: string | null | undefined): MatterIntakeWorkflowStatus {
  if (metadata && typeof metadata === "object") {
    const candidate = (metadata as { intakeMvp?: { workflowStatus?: unknown } }).intakeMvp?.workflowStatus;
    if (typeof candidate === "string" && MATTER_INTAKE_WORKFLOW_STATUSES.includes(candidate as MatterIntakeWorkflowStatus)) {
      return candidate as MatterIntakeWorkflowStatus;
    }
  }

  if (matterStatus === "open") {
    return "active";
  }

  return "draft";
}

export function listRepresentationReadinessMessages(issues: RepresentationReadinessIssue[]) {
  return issues.map((issue) => {
    if (issue === "conflict_check_not_clear") {
      return "Conflict check status must be clear for activation.";
    }

    if (issue === "engagement_not_signed") {
      return "Engagement agreement must be signed for activation.";
    }

    return "Power of attorney must be valid for activation.";
  });
}

function asPgError(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      code: "",
      message: "",
      details: "",
      hint: "",
    };
  }

  const typed = error as PgErrorLike;
  return {
    code: typeof typed.code === "string" ? typed.code : "",
    message: typeof typed.message === "string" ? typed.message : "",
    details: typeof typed.details === "string" ? typed.details : "",
    hint: typeof typed.hint === "string" ? typed.hint : "",
  };
}
