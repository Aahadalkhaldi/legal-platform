import { getAuthContext, requirePermission } from "@/lib/api/context";
import { resolveStageForActionType } from "@/lib/api/matter-proceedings";
import {
  buildMatterIntakeMetadata,
  evaluateRepresentationReadiness,
  isMissingRelationError,
  isUndefinedColumnError,
  listRepresentationReadinessMessages,
  mapWorkflowStatusToMatterStatus,
  normalizeMatterIntakeError,
  resolveMatterIntakeWorkflowStatus,
  type MatterIntakeSaveMode,
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

type PersistedRelatedParties = {
  ids: string[];
  persistedCount: number;
  mode: "structured" | "legacy" | "metadata";
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
    const representationReadiness = evaluateRepresentationReadiness(payload);
    const workflowStatus = resolveMatterIntakeWorkflowStatus({
      saveMode: payload.saveMode as MatterIntakeSaveMode,
      representationReadiness,
    });
    const matterStatus = mapWorkflowStatusToMatterStatus(workflowStatus);

    const client = await insertClientOrFallback({
      supabase,
      accountId: context.accountId,
      userId: context.userId,
      fallbackSteps,
      payload: payload.client,
    });

    const desiredIntakeType = payload.initialAction === "lawsuit" ? "lawsuit" : "complaint_report";
    const metadataDraft = buildMatterIntakeMetadata({
      context,
      payload,
      clientId: client.id,
      relatedParties: {
        persistedIds: [],
        persistedCount: 0,
      },
      proceedingId: null,
      fallbackSteps,
      workflowStatus,
      representationReadiness,
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
        status: matterStatus,
        openedAt: payload.matter.openedAt,
        desiredIntakeType,
        metadata: metadataDraft,
      },
    });

    const relatedParties = await insertRelatedPartiesOrFallback({
      supabase,
      accountId: context.accountId,
      userId: context.userId,
      matterId: matterInsertResult.row.id,
      payload,
      fallbackSteps,
    });

    const proceedingResult = workflowStatus === "active"
      ? await insertInitialProceedingOrFallback({
          supabase,
          accountId: context.accountId,
          userId: context.userId,
          fallbackSteps,
          matterId: matterInsertResult.row.id,
          payload,
        })
      : { id: null, persisted: false };

    const metadataFinal = buildMatterIntakeMetadata({
      context,
      payload,
      clientId: client.id,
      relatedParties: {
        persistedIds: relatedParties.ids,
        persistedCount: relatedParties.persistedCount,
      },
      proceedingId: proceedingResult.id,
      fallbackSteps,
      workflowStatus,
      representationReadiness,
    });

    const { error: metadataError } = await supabase
      .from("legal_matters")
      .update({
        metadata: metadataFinal,
        status: matterStatus,
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
        relatedPartyIds: relatedParties.ids,
        proceedingId: proceedingResult.id,
        workflowStatus,
        fallbackSteps,
      },
    });

    return ok({
      data: {
        matter: {
          id: matterInsertResult.row.id,
          matterNumber: matterInsertResult.row.matter_number,
          title: matterInsertResult.row.title,
          status: matterStatus,
          intakeType: matterInsertResult.row.intake_type ?? desiredIntakeType,
          intakeWorkflowStatus: workflowStatus,
          clientId: matterInsertResult.row.client_id ?? client.id,
          openedAt: matterInsertResult.row.opened_at,
          updatedAt: matterInsertResult.row.updated_at,
        },
        client: {
          id: client.id,
          persisted: client.persisted,
        },
        relatedParties: {
          ids: relatedParties.ids,
          persistedCount: relatedParties.persistedCount,
          persisted: relatedParties.persistedCount > 0,
          persistenceMode: relatedParties.mode,
        },
        conflictCheckStatus: payload.conflictCheckStatus,
        engagementAgreementStatus: payload.engagementAgreementStatus,
        poaStatus: payload.poaStatus,
        initialAction: {
          type: payload.initialAction,
          proceedingId: proceedingResult.id,
          proceedingPersisted: proceedingResult.persisted,
        },
        representationReadiness: {
          readyForActivation: representationReadiness.readyForActivation,
          issues: representationReadiness.issues,
          messages: listRepresentationReadinessMessages(representationReadiness.issues),
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
  payload: CreateMatterIntakePayload["client"];
  fallbackSteps: MatterIntakeFallbackStep[];
}): Promise<PersistedEntity> {
  const resolvedClient = resolveClientColumns(input.payload);
  const { data, error } = await input.supabase
    .from("clients")
    .insert({
      account_id: input.accountId,
      full_name: resolvedClient.fullName,
      display_name: resolvedClient.displayName,
      national_id: resolvedClient.nationalId,
      email: resolvedClient.email,
      phone: resolvedClient.phone,
      address: resolvedClient.address,
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

async function insertRelatedPartiesOrFallback(input: {
  supabase: ReturnType<typeof createSupabaseAdmin>;
  accountId: string;
  userId: string;
  matterId: string;
  payload: CreateMatterIntakePayload;
  fallbackSteps: MatterIntakeFallbackStep[];
}): Promise<PersistedRelatedParties> {
  const structuredRows = input.payload.relatedParties.map((party) => ({
    account_id: input.accountId,
    legal_matter_id: input.matterId,
    party_name: party.partyName,
    full_name: party.partyName,
    party_type: party.partyType,
    legal_capacity: party.legalCapacity,
    identity_number: party.identificationNumber ?? null,
    registration_number: party.registrationNumber ?? null,
    contact_person: party.contactPerson ?? null,
    phone: party.phone ?? null,
    email: party.email ?? null,
    address: party.address ?? null,
    notes: party.notes ?? null,
    created_by: input.userId,
    updated_by: input.userId,
  }));

  const structuredResult = await input.supabase
    .from("opponents")
    .insert(structuredRows)
    .select("id");

  if (!structuredResult.error) {
    return {
      ids: (structuredResult.data ?? []).map((row) => row.id),
      persistedCount: (structuredResult.data ?? []).length,
      mode: "structured",
    };
  }

  if (isMissingRelationError(structuredResult.error, "opponents")) {
    input.fallbackSteps.push("related_parties_saved_in_metadata");
    return { ids: [], persistedCount: 0, mode: "metadata" };
  }

  if (!isUndefinedColumnError(structuredResult.error)) {
    throw structuredResult.error;
  }

  const legacyRows = input.payload.relatedParties.map((party) => ({
    account_id: input.accountId,
    full_name: party.partyName,
    identity_number: party.identificationNumber ?? party.registrationNumber ?? null,
    phone: party.phone ?? null,
    email: party.email ?? null,
    notes: party.notes ?? null,
    created_by: input.userId,
    updated_by: input.userId,
  }));
  const legacyResult = await input.supabase
    .from("opponents")
    .insert(legacyRows)
    .select("id");

  if (!legacyResult.error) {
    return {
      ids: (legacyResult.data ?? []).map((row) => row.id),
      persistedCount: (legacyResult.data ?? []).length,
      mode: "legacy",
    };
  }

  if (isMissingRelationError(legacyResult.error, "opponents") || isUndefinedColumnError(legacyResult.error)) {
    input.fallbackSteps.push("related_parties_saved_in_metadata");
    return { ids: [], persistedCount: 0, mode: "metadata" };
  }

  throw legacyResult.error;
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
  const complaintAuthority = pickComplaintAuthority(complaintDetails);

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
      authority: isLawsuit ? null : complaintAuthority,
      report_number: isLawsuit ? null : complaintDetails?.reportNumber ?? null,
      submission_date: isLawsuit ? null : complaintDetails?.submissionDate ?? null,
      complainant: isLawsuit ? null : complaintDetails?.complainant ?? null,
      respondent: isLawsuit ? null : complaintDetails?.accusedRespondent ?? null,
      prosecutor_name: isLawsuit ? null : complaintDetails?.publicProsecution ?? null,
      police_station: isLawsuit ? null : complaintDetails?.policeStation ?? null,
      metadata: {
        source: "matter_intake_mvp",
        complaintAuthorities: isLawsuit ? null : {
          publicProsecution: complaintDetails?.publicProsecution ?? null,
          policeStation: complaintDetails?.policeStation ?? null,
          cybercrimeDepartment: complaintDetails?.cybercrimeDepartment ?? null,
          administrativeAuthority: complaintDetails?.administrativeAuthority ?? null,
          laborAuthority: complaintDetails?.laborAuthority ?? null,
          regulatoryAuthority: complaintDetails?.regulatoryAuthority ?? null,
          notes: complaintDetails?.notes ?? null,
        },
      },
      created_by: input.userId,
      updated_by: input.userId,
    })
    .select("id")
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

function resolveClientColumns(payload: CreateMatterIntakePayload["client"]) {
  if (payload.partyType === "natural_person" && payload.naturalPerson) {
    return {
      fullName: payload.naturalPerson.fullName,
      displayName: payload.naturalPerson.fullName,
      nationalId: payload.naturalPerson.qidOrPassport ?? null,
      email: payload.naturalPerson.email ?? null,
      phone: payload.naturalPerson.phone ?? null,
      address: payload.naturalPerson.address ?? null,
    };
  }

  if (payload.organization) {
    return {
      fullName: payload.organization.tradeName,
      displayName: payload.organization.tradeName,
      nationalId: payload.organization.commercialRegistrationNumber ?? null,
      email: payload.organization.email ?? null,
      phone: payload.organization.phone ?? null,
      address: payload.organization.address ?? null,
    };
  }

  if (payload.governmentEntity) {
    return {
      fullName: payload.governmentEntity.entityName,
      displayName: payload.governmentEntity.entityName,
      nationalId: null,
      email: payload.governmentEntity.officialEmail ?? null,
      phone: payload.governmentEntity.officialPhone ?? null,
      address: payload.governmentEntity.address ?? null,
    };
  }

  const fallbackName = payload.genericName ?? "Unknown Client";
  return {
    fullName: fallbackName,
    displayName: fallbackName,
    nationalId: null,
    email: null,
    phone: null,
    address: null,
  };
}

function pickComplaintAuthority(complaint: CreateMatterIntakePayload["complaint"]) {
  if (!complaint) return null;

  const ordered = [
    complaint.publicProsecution,
    complaint.policeStation,
    complaint.cybercrimeDepartment,
    complaint.administrativeAuthority,
    complaint.laborAuthority,
    complaint.regulatoryAuthority,
  ];

  const value = ordered.find((entry) => typeof entry === "string" && entry.trim().length > 0);
  return value ?? null;
}
