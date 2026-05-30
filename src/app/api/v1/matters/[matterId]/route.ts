import { getAuthContext } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { normalizePlatformRole } from "@/lib/access-control";
import { assertMatterAccess } from "@/lib/api/matters-access";
import { readWorkflowStatusFromMatter } from "@/lib/api/matter-intake";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  isMissingRelationError,
  isSchemaDriftError,
  normalizeMatterApiError,
} from "@/lib/api/matter-api-errors";

type ProceedingRow = {
  id: string;
  parent_proceeding_id: string | null;
  linked_case_id: string | null;
  action_type: string | null;
  stage: string | null;
  status: string | null;
  case_number: string | null;
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
  client_visible: boolean | null;
  filing_date: string | null;
  next_deadline_at: string | null;
  fees_amount: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  court?: unknown;
  linked_case?: unknown;
};

export async function GET(request: Request, contextParams: { params: Promise<{ matterId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { matterId } = await contextParams.params;
    const supabase = createSupabaseAdmin();
    const normalizedRole = normalizePlatformRole(context.role);

    await assertMatterAccess(supabase, context, matterId);
    const matter = await loadMatterForContext(supabase, context, matterId);
    const proceedings = await loadProceedings(supabase, context.accountId, matterId, normalizedRole);
    const proceedingIds = proceedings.map((row) => row.id);

    const [
      hearings,
      documents,
      tasks,
      updates,
      parties,
      fees,
      deadlines,
    ] = await Promise.all([
      loadProceedingRows(supabase, context.accountId, "hearings", proceedingIds, "id, matter_proceeding_id, hearing_at, status, agenda, outcome"),
      loadProceedingRows(supabase, context.accountId, "documents", proceedingIds, "id, matter_proceeding_id, title, document_type, classification, visible_to_client, updated_at"),
      loadProceedingRows(supabase, context.accountId, "tasks", proceedingIds, "id, matter_proceeding_id, title, status, priority, due_at"),
      loadProceedingRows(supabase, context.accountId, "client_updates", proceedingIds, "id, matter_proceeding_id, title, visible_to_client, created_at"),
      loadProceedingRows(supabase, context.accountId, "case_participants", proceedingIds, "id, matter_proceeding_id, participant_type, display_name, role_notes"),
      loadProceedingRows(supabase, context.accountId, "invoices", proceedingIds, "id, matter_proceeding_id, invoice_number, status, total_amount, balance_due, due_at"),
      loadProceedingRows(supabase, context.accountId, "appointments", proceedingIds, "id, matter_proceeding_id, title, appointment_type, starts_at, ends_at"),
    ]);

    const scopedDocuments = normalizedRole === "client_portal"
      ? documents.filter((row) => row.visible_to_client === true)
      : documents;
    const scopedUpdates = normalizedRole === "client_portal"
      ? updates.filter((row) => row.visible_to_client === true)
      : updates;

    const matterNumber = readMatterString(matter, ["matter_number", "matterNumber"], null);
    const matterTitle = readMatterString(matter, ["title", "matter_title", "name"], null);
    const matterStatus = readMatterString(matter, ["status", "matter_status"], null);
    const matterIntakeType = readMatterString(matter, ["intake_type", "intakeType"], null);

    const hearingsMap = groupByProceedingId(hearings);
    const documentsMap = groupByProceedingId(scopedDocuments);
    const tasksMap = groupByProceedingId(tasks);
    const updatesMap = groupByProceedingId(scopedUpdates);
    const partiesMap = groupByProceedingId(parties);
    const feesMap = groupByProceedingId(fees);
    const deadlinesMap = groupByProceedingId(deadlines);

    await writeAuditEvent({
      context,
      action: "LEGAL_MATTER_VIEWED",
      targetType: "legal_matter",
      targetId: matterId,
      requestId: reqId,
      request,
    });

    return ok({
      data: {
        id: matter.id,
        matterNumber,
        title: matterTitle,
        description: matter.description ?? null,
        status: matterStatus,
        intakeType: matterIntakeType,
        intakeWorkflowStatus: readWorkflowStatusFromMatter(matter.metadata, matterStatus),
        openedAt: matter.opened_at ?? null,
        closedAt: matter.closed_at ?? null,
        updatedAt: matter.updated_at ?? null,
        client: extractClient(matter.client),
        proceedings: proceedings.map((row) => ({
          id: row.id,
          parentProceedingId: row.parent_proceeding_id ?? null,
          linkedCaseId: row.linked_case_id ?? null,
          linkedCase: extractLinkedCase(row.linked_case),
          actionType: row.action_type ?? "lawsuit",
          stage: row.stage ?? "first_instance",
          status: row.status ?? "open",
          caseNumber: row.case_number ?? null,
          court: extractCourt(row.court),
          circuit: row.circuit ?? null,
          department: row.department ?? null,
          claimType: row.claim_type ?? null,
          judgmentSummary: row.judgment_summary ?? null,
          authority: row.authority ?? null,
          reportNumber: row.report_number ?? null,
          submissionDate: row.submission_date ?? null,
          complainant: row.complainant ?? null,
          respondent: row.respondent ?? null,
          investigationSessions: row.investigation_sessions ?? [],
          prosecutorName: row.prosecutor_name ?? null,
          policeStation: row.police_station ?? null,
          relatedLawsuitProceedingId: row.related_lawsuit_proceeding_id ?? null,
          clientVisible: row.client_visible ?? false,
          filingDate: row.filing_date ?? null,
          nextDeadlineAt: row.next_deadline_at ?? null,
          feesAmountQar: row.fees_amount ?? null,
          metadata: row.metadata ?? {},
          createdAt: row.created_at ?? null,
          updatedAt: row.updated_at ?? null,
          hearings: hearingsMap.get(row.id) ?? [],
          documents: documentsMap.get(row.id) ?? [],
          tasks: tasksMap.get(row.id) ?? [],
          updates: updatesMap.get(row.id) ?? [],
          parties: partiesMap.get(row.id) ?? [],
          fees: feesMap.get(row.id) ?? [],
          deadlines: deadlinesMap.get(row.id) ?? [],
        })),
      },
      requestId: reqId,
    });
  } catch (error) {
    return fail(normalizeMatterApiError(error, {
      endpoint: "/api/v1/matters/{matterId}",
      operation: "load matter detail",
      fallbackMessage: "Failed to load matter detail.",
    }), reqId);
  }
}

async function loadMatterForContext(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  context: Awaited<ReturnType<typeof getAuthContext>>,
  matterId: string,
) {
  const withClientJoin = await supabase
    .from("legal_matters")
    .select("*, client:clients(id, user_id, full_name)")
    .eq("id", matterId)
    .eq("account_id", context.accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!withClientJoin.error && withClientJoin.data) {
    enforceClientPortalScope(context.role, context.userId, withClientJoin.data.client);
    return withClientJoin.data;
  }

  if (withClientJoin.error && isMissingRelationError(withClientJoin.error, "clients")) {
    const withoutClientJoin = await supabase
      .from("legal_matters")
      .select("*")
      .eq("id", matterId)
      .eq("account_id", context.accountId)
      .is("deleted_at", null)
      .maybeSingle();

    if (withoutClientJoin.error) {
      throw withoutClientJoin.error;
    }

    if (!withoutClientJoin.data) {
      throw new ApiError("NOT_FOUND", "Legal matter was not found.");
    }

    if (normalizePlatformRole(context.role) === "client_portal") {
      throw new ApiError("FORBIDDEN", "Client linkage data is missing for this legal matter.");
    }

    return {
      ...withoutClientJoin.data,
      client: null,
    };
  }

  if (withClientJoin.error) {
    throw withClientJoin.error;
  }

  throw new ApiError("NOT_FOUND", "Legal matter was not found.");
}

async function loadProceedings(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  matterId: string,
  normalizedRole: string,
): Promise<ProceedingRow[]> {
  const joinedQuery = supabase
    .from("matter_proceedings")
    .select("id, parent_proceeding_id, linked_case_id, action_type, stage, status, case_number, circuit, department, claim_type, judgment_summary, authority, report_number, submission_date, complainant, respondent, investigation_sessions, prosecutor_name, police_station, related_lawsuit_proceeding_id, client_visible, filing_date, next_deadline_at, fees_amount, metadata, created_at, updated_at, court:courts(id, name_ar), linked_case:cases(id, case_number, title, status, stage)")
    .eq("account_id", accountId)
    .eq("legal_matter_id", matterId)
    .is("deleted_at", null);

  if (normalizedRole === "client_portal") {
    joinedQuery.eq("client_visible", true);
  }

  const joinedResult = await joinedQuery.order("created_at", { ascending: true });
  if (!joinedResult.error) {
    return (joinedResult.data ?? []) as ProceedingRow[];
  }

  if (isMissingRelationError(joinedResult.error, "matter_proceedings")) {
    return [];
  }

  if (!isSchemaDriftError(joinedResult.error)) {
    throw joinedResult.error;
  }

  const plainQuery = supabase
    .from("matter_proceedings")
    .select("id, parent_proceeding_id, linked_case_id, action_type, stage, status, case_number, circuit, department, claim_type, judgment_summary, authority, report_number, submission_date, complainant, respondent, investigation_sessions, prosecutor_name, police_station, related_lawsuit_proceeding_id, client_visible, filing_date, next_deadline_at, fees_amount, metadata, created_at, updated_at")
    .eq("account_id", accountId)
    .eq("legal_matter_id", matterId)
    .is("deleted_at", null);

  if (normalizedRole === "client_portal") {
    plainQuery.eq("client_visible", true);
  }
  const plainResult = await plainQuery.order("created_at", { ascending: true });
  if (!plainResult.error) {
    return ((plainResult.data ?? []) as ProceedingRow[]).map((row) => ({
      ...row,
      court: null,
      linked_case: null,
    }));
  }

  if (isMissingRelationError(plainResult.error, "matter_proceedings")) {
    return [];
  }

  if (!isSchemaDriftError(plainResult.error)) {
    throw plainResult.error;
  }

  const minimalQuery = supabase
    .from("matter_proceedings")
    .select("id, action_type, stage, status, case_number, report_number, authority, client_visible, filing_date, next_deadline_at, metadata, created_at, updated_at")
    .eq("account_id", accountId)
    .eq("legal_matter_id", matterId)
    .is("deleted_at", null);

  if (normalizedRole === "client_portal") {
    minimalQuery.eq("client_visible", true);
  }
  const minimalResult = await minimalQuery.order("created_at", { ascending: true });
  if (minimalResult.error) {
    if (isMissingRelationError(minimalResult.error, "matter_proceedings")) {
      return [];
    }
    throw minimalResult.error;
  }

  return ((minimalResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: typeof row.id === "string" ? row.id : crypto.randomUUID(),
    parent_proceeding_id: null,
    linked_case_id: null,
    action_type: typeof row.action_type === "string" ? row.action_type : "lawsuit",
    stage: typeof row.stage === "string" ? row.stage : "first_instance",
    status: typeof row.status === "string" ? row.status : "open",
    case_number: typeof row.case_number === "string" ? row.case_number : null,
    circuit: null,
    department: null,
    claim_type: null,
    judgment_summary: null,
    authority: typeof row.authority === "string" ? row.authority : null,
    report_number: typeof row.report_number === "string" ? row.report_number : null,
    submission_date: null,
    complainant: null,
    respondent: null,
    investigation_sessions: [],
    prosecutor_name: null,
    police_station: null,
    related_lawsuit_proceeding_id: null,
    client_visible: typeof row.client_visible === "boolean" ? row.client_visible : false,
    filing_date: typeof row.filing_date === "string" ? row.filing_date : null,
    next_deadline_at: typeof row.next_deadline_at === "string" ? row.next_deadline_at : null,
    fees_amount: null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? {},
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    court: null,
    linked_case: null,
  }));
}

async function loadProceedingRows(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  table:
    | "hearings"
    | "documents"
    | "tasks"
    | "client_updates"
    | "case_participants"
    | "invoices"
    | "appointments",
  proceedingIds: string[],
  columns: string,
): Promise<Array<Record<string, unknown>>> {
  if (proceedingIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .eq("account_id", accountId)
    .in("matter_proceeding_id", proceedingIds)
    .is("deleted_at", null);

  if (!error) {
    return (data ?? []) as unknown as Array<Record<string, unknown>>;
  }

  if (isSchemaDriftError(error)) {
    return [];
  }

  throw error;
}

function enforceClientPortalScope(role: string, userId: string, clientJoin: unknown) {
  if (normalizePlatformRole(role) !== "client_portal") {
    return;
  }

  const client = extractClient(clientJoin);
  if (!client || client.userId !== userId) {
    throw new ApiError("FORBIDDEN", "Clients can only access their own legal matters.");
  }
}

function groupByProceedingId(rows: Array<Record<string, unknown>>) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const proceedingId = typeof row.matter_proceeding_id === "string" ? row.matter_proceeding_id : null;
    if (!proceedingId) continue;

    const current = grouped.get(proceedingId) ?? [];
    current.push(row);
    grouped.set(proceedingId, current);
  }

  return grouped;
}

function extractCourt(courtJoin: unknown) {
  if (Array.isArray(courtJoin)) {
    const first = courtJoin[0] as { id?: string; name_ar?: string } | undefined;
    if (!first) return null;
    return { id: first.id ?? null, nameAr: first.name_ar ?? null };
  }

  if (courtJoin && typeof courtJoin === "object") {
    const typed = courtJoin as { id?: string; name_ar?: string };
    return { id: typed.id ?? null, nameAr: typed.name_ar ?? null };
  }

  return null;
}

function extractLinkedCase(caseJoin: unknown) {
  if (Array.isArray(caseJoin)) {
    const first = caseJoin[0] as Record<string, unknown> | undefined;
    return first ?? null;
  }

  if (caseJoin && typeof caseJoin === "object") {
    return caseJoin;
  }

  return null;
}

function extractClient(clientJoin: unknown) {
  const joined = Array.isArray(clientJoin) ? clientJoin[0] : clientJoin;
  if (!joined || typeof joined !== "object") {
    return null;
  }

  const typed = joined as { id?: string; user_id?: string; full_name?: string };
  return {
    id: typed.id ?? null,
    userId: typed.user_id ?? null,
    fullName: typed.full_name ?? null,
  };
}

function readMatterString(
  matter: Record<string, unknown>,
  keys: string[],
  fallback: string | null,
) {
  for (const key of keys) {
    const value = matter[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  const metadata = matter.metadata;
  if (metadata && typeof metadata === "object") {
    const typedMetadata = metadata as Record<string, unknown>;
    for (const key of keys) {
      const value = typedMetadata[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value;
      }
    }
  }

  return fallback;
}
