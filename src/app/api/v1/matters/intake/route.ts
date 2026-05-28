import { getAuthContext, requirePermission } from "@/lib/api/context";
import { resolveStageForActionType } from "@/lib/api/matter-proceedings";
import {
  buildMatterIntakeMetadata,
  isMissingRelationError,
  isUndefinedColumnError,
  normalizeMatterIntakeError,
  type MatterIntakeFallbackStep,
} from "@/lib/api/matter-intake";
import { createMatterIntakeSchema, type CreateMatterIntakePayload } from "@/lib/api/schemas";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { hasMatterAction } from "@/lib/access-control";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type PersistedEntity = {
  id: string | null;
  persisted: boolean;
};

type CreatedMatterRow = {
  id: string;
  matter_number: string | null;
  title: string;
  status: string;
  intake_type: string | null;
  client_id: string | null;
  opened_at: string;
  updated_at: string;
};

type CreatedProceedingRow = {
  id: string;
  action_type: string;
  stage: string;
  status: string;
  case_number: string | null;
  authority: string | null;
  report_number: string | null;
};

export async function POST(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "cases:create");
    if (!hasMatterAction({
      role: context.role,
      action: "manage_clients",
      directPermissions: context.permissions,
      inheritedPermissions: context.inheritedPermissions,
    })) {
      throw new ApiError("FORBIDDEN", "Missing action permission: manage_clients.");
    }

    const payload = createMatterIntakeSchema.parse(await request.json());
    const supabase = createSupabaseAdmin();
    const fallbackSteps: MatterIntakeFallbackStep[] = [];

    const client = await insertClientOrFallback({
      supabase,
      accountId: context.accountId,
      userId: context.userId,
      fallbackSteps,
      payload: payload.client,
    });

    const opponent = await insertOpponentOrFallback({
      supabase,
      accountId: context.accountId,
      userId: context.userId,
      fallbackSteps,
      payload: payload.opposingParty,
    });

    const desiredIntakeType = payload.initialAction === "lawsuit" ? "lawsuit" : "complaint_report";
    const intakeMetadataDraft = buildMatterIntakeMetadata({
      context,
      payload,
      clientId: client.id,
      opponentId: opponent.id,
      proceedingId: null,
      fallbackSteps,
    });

    const matterInsertResult = await insertMatterWithFallback({
      supabase,
      accountId: context.accountId,
      userId: context.userId,
      fallbackSteps,
      payload: {
        clientId: client.id,
        title: payload.matter.title,
        matterNumber: payload.matter.matterNumber,
        description: payload.matter.description,
        status: payload.matter.status,
        openedAt: payload.matter.openedAt,
        desiredIntakeType,
        metadata: intakeMetadataDraft,
      },
    });

    const proceedingResult = await insertInitialProceedingOrFallback({
      supabase,
      accountId: context.accountId,
      userId: context.userId,
      fallbackSteps,
      matterId: matterInsertResult.row.id,
      payload,
    });

    const intakeMetadataFinal = buildMatterIntakeMetadata({
      context,
      payload,
      clientId: client.id,
      opponentId: opponent.id,
      proceedingId: proceedingResult.id,
      fallbackSteps,
    });

    const { error: metadataError } = await supabase
      .from("legal_matters")
      .update({
        metadata: intakeMetadataFinal,
        updated_by: context.userId,
      })
      .eq("id", matterInsertResult.row.id)
      .eq("account_id", context.accountId);

    if (metadataError && !isUndefinedColumnError(metadataError, "metadata")) {
      throw metadataError;
    }

    await writeAuditEvent({
      context,
      action: "LEGAL_MATTER_INTAKE_CREATED",
      targetType: "legal_matter",
      targetId: matterInsertResult.row.id,
      requestId: reqId,
      request,
      after: {
        matterId: matterInsertResult.row.id,
        clientId: client.id,
        opponentId: opponent.id,
        proceedingId: proceedingResult.id,
        fallbackSteps,
      },
    });

    return ok({
      data: {
        matter: {
          id: matterInsertResult.row.id,
          matterNumber: matterInsertResult.row.matter_number,
          title: matterInsertResult.row.title,
          status: matterInsertResult.row.status,
          intakeType: matterInsertResult.row.intake_type ?? desiredIntakeType,
          clientId: matterInsertResult.row.client_id ?? client.id,
          openedAt: matterInsertResult.row.opened_at,
          updatedAt: matterInsertResult.row.updated_at,
        },
        client: {
          id: client.id,
          persisted: client.persisted,
        },
        opposingParty: {
          id: opponent.id,
          persisted: opponent.persisted,
        },
        conflictCheckStatus: payload.conflictCheckStatus,
        engagementAgreementStatus: payload.engagementAgreementStatus,
        poaStatus: payload.poaStatus,
        initialAction: {
          type: payload.initialAction,
          proceedingId: proceedingResult.id,
          proceedingPersisted: proceedingResult.persisted,
        },
        fallbackSteps,
      },
      requestId: reqId,
    }, { status: 201 });
  } catch (error) {
    return fail(normalizeMatterIntakeError(error), reqId);
  }
}

async function insertClientOrFallback(input: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  accountId: string;
  userId: string;
  payload: {
    fullName: string;
    displayName?: string;
    email?: string;
    phone?: string;
    nationalId?: string;
    address?: string;
  };
  fallbackSteps: MatterIntakeFallbackStep[];
}): Promise<PersistedEntity> {
  const { data, error } = await input.supabase
    .from("clients")
    .insert({
      account_id: input.accountId,
      full_name: input.payload.fullName,
      display_name: input.payload.displayName ?? input.payload.fullName,
      national_id: input.payload.nationalId ?? null,
      email: input.payload.email ?? null,
      phone: input.payload.phone ?? null,
      address: input.payload.address ?? null,
      status: "active",
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (isMissingRelationError(error, "clients") || isUndefinedColumnError(error)) {
      input.fallbackSteps.push("client_saved_in_metadata");
      return { id: null, persisted: false };
    }

    throw error;
  }

  return {
    id: typeof data?.id === "string" ? data.id : null,
    persisted: typeof data?.id === "string",
  };
}

async function insertOpponentOrFallback(input: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  accountId: string;
  userId: string;
  payload: {
    fullName: string;
    identityNumber?: string;
    email?: string;
    phone?: string;
    notes?: string;
  };
  fallbackSteps: MatterIntakeFallbackStep[];
}): Promise<PersistedEntity> {
  const { data, error } = await input.supabase
    .from("opponents")
    .insert({
      account_id: input.accountId,
      full_name: input.payload.fullName,
      identity_number: input.payload.identityNumber ?? null,
      email: input.payload.email ?? null,
      phone: input.payload.phone ?? null,
      notes: input.payload.notes ?? null,
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select("id")
    .single();

  if (error) {
    if (isMissingRelationError(error, "opponents") || isUndefinedColumnError(error)) {
      input.fallbackSteps.push("opponent_saved_in_metadata");
      return { id: null, persisted: false };
    }

    throw error;
  }

  return {
    id: typeof data?.id === "string" ? data.id : null,
    persisted: typeof data?.id === "string",
  };
}

async function insertMatterWithFallback(input: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  accountId: string;
  userId: string;
  payload: {
    clientId: string | null;
    title: string;
    matterNumber?: string;
    description?: string;
    status: string;
    openedAt?: string;
    desiredIntakeType: "lawsuit" | "complaint_report";
    metadata: Record<string, unknown>;
  };
  fallbackSteps: MatterIntakeFallbackStep[];
}): Promise<{ row: CreatedMatterRow }> {
  const baseInsert = {
    account_id: input.accountId,
    client_id: input.payload.clientId,
    matter_number: input.payload.matterNumber ?? null,
    title: input.payload.title,
    description: input.payload.description ?? null,
    status: input.payload.status,
    intake_type: input.payload.desiredIntakeType,
    opened_at: input.payload.openedAt ?? new Date().toISOString(),
    metadata: input.payload.metadata,
    created_by: input.userId,
    updated_by: input.userId,
  };

  const withoutIntakeType = {
    account_id: input.accountId,
    client_id: input.payload.clientId,
    matter_number: input.payload.matterNumber ?? null,
    title: input.payload.title,
    description: input.payload.description ?? null,
    status: input.payload.status,
    opened_at: input.payload.openedAt ?? new Date().toISOString(),
    metadata: input.payload.metadata,
    created_by: input.userId,
    updated_by: input.userId,
  };
  const attempts = [baseInsert, withoutIntakeType];

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
    const { data, error } = await input.supabase
      .from("legal_matters")
      .insert(attempts[attemptIndex])
      .select("id, matter_number, title, status, intake_type, client_id, opened_at, updated_at")
      .single();

    if (!error && data) {
      return { row: data as CreatedMatterRow };
    }

    if (error && attemptIndex === 0 && isUndefinedColumnError(error, "intake_type")) {
      input.fallbackSteps.push("intake_type_saved_in_metadata");
      continue;
    }

    throw error ?? new Error("Unable to create legal matter.");
  }

  throw new Error("Unable to create legal matter.");
}

async function insertInitialProceedingOrFallback(input: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  accountId: string;
  userId: string;
  matterId: string;
  payload: CreateMatterIntakePayload;
  fallbackSteps: MatterIntakeFallbackStep[];
}): Promise<{ id: string | null; persisted: boolean }> {
  const isLawsuit = input.payload.initialAction === "lawsuit";
  const complaintDetails = input.payload.complaint;
  const lawsuitDetails = input.payload.lawsuit;
  const actionType = isLawsuit
    ? "lawsuit"
    : complaintDetails?.actionType ?? "police_report";

  const { data, error } = await input.supabase
    .from("matter_proceedings")
    .insert({
      account_id: input.accountId,
      legal_matter_id: input.matterId,
      action_type: actionType,
      stage: resolveStageForActionType(actionType),
      status: "open",
      case_number: isLawsuit ? lawsuitDetails?.caseNumber ?? null : null,
      court_id: isLawsuit ? lawsuitDetails?.courtId ?? null : null,
      circuit: isLawsuit ? lawsuitDetails?.circuit ?? null : null,
      department: isLawsuit ? lawsuitDetails?.department ?? null : null,
      claim_type: isLawsuit ? lawsuitDetails?.claimType ?? null : null,
      authority: isLawsuit ? null : complaintDetails?.authority ?? null,
      report_number: isLawsuit ? null : complaintDetails?.reportNumber ?? null,
      submission_date: isLawsuit ? null : complaintDetails?.submissionDate ?? null,
      complainant: isLawsuit ? null : complaintDetails?.complainant ?? null,
      respondent: isLawsuit ? null : complaintDetails?.respondent ?? null,
      prosecutor_name: isLawsuit ? null : complaintDetails?.prosecutorName ?? null,
      police_station: isLawsuit ? null : complaintDetails?.policeStation ?? null,
      metadata: { source: "matter_intake_mvp" },
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select("id, action_type, stage, status, case_number, authority, report_number")
    .single();

  if (error) {
    if (isMissingRelationError(error, "matter_proceedings") || isUndefinedColumnError(error)) {
      input.fallbackSteps.push("initial_action_saved_in_metadata");
      return { id: null, persisted: false };
    }

    throw error;
  }

  const row = data as CreatedProceedingRow | null;
  if (!row || typeof row.id !== "string") {
    return { id: null, persisted: false };
  }

  return {
    id: row.id,
    persisted: true,
  };
}
