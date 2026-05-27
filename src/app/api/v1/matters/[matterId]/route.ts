import { getAuthContext } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request, contextParams: { params: Promise<{ matterId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { matterId } = await contextParams.params;
    const supabase = createSupabaseAdmin();

    const matter = await loadMatterForContext(supabase, context, matterId);
    const proceedings = await loadProceedings(supabase, context.accountId, matterId);
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

    const hearingsMap = groupByProceedingId(hearings);
    const documentsMap = groupByProceedingId(documents);
    const tasksMap = groupByProceedingId(tasks);
    const updatesMap = groupByProceedingId(updates);
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
        matterNumber: matter.matter_number,
        title: matter.title,
        description: matter.description,
        status: matter.status,
        openedAt: matter.opened_at,
        closedAt: matter.closed_at,
        updatedAt: matter.updated_at,
        client: extractClient(matter.client),
        proceedings: proceedings.map((row) => ({
          id: row.id,
          parentProceedingId: row.parent_proceeding_id,
          linkedCaseId: row.linked_case_id,
          linkedCase: extractLinkedCase(row.linked_case),
          stage: row.stage,
          status: row.status,
          caseNumber: row.case_number,
          court: extractCourt(row.court),
          department: row.department,
          filingDate: row.filing_date,
          nextDeadlineAt: row.next_deadline_at,
          feesAmountQar: row.fees_amount,
          metadata: row.metadata,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
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
    return fail(error, reqId);
  }
}

async function loadMatterForContext(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  context: Awaited<ReturnType<typeof getAuthContext>>,
  matterId: string,
) {
  const { data, error } = await supabase
    .from("legal_matters")
    .select("*, client:clients(id, user_id, full_name)")
    .eq("id", matterId)
    .eq("account_id", context.accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new ApiError("NOT_FOUND", "Legal matter was not found.");
  }

  if (context.role === "client") {
    const clientJoin = extractClient(data.client);
    if (!clientJoin || clientJoin.userId !== context.userId) {
      throw new ApiError("FORBIDDEN", "Clients can only access their own legal matters.");
    }
  }

  return data;
}

async function loadProceedings(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  matterId: string,
) {
  const { data, error } = await supabase
    .from("matter_proceedings")
    .select("id, parent_proceeding_id, linked_case_id, stage, status, case_number, department, filing_date, next_deadline_at, fees_amount, metadata, created_at, updated_at, court:courts(id, name_ar), linked_case:cases(id, case_number, title, status, stage)")
    .eq("account_id", accountId)
    .eq("legal_matter_id", matterId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
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

  if (error) throw error;
  return (data ?? []) as unknown as Array<Record<string, unknown>>;
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
