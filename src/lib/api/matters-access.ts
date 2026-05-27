import { ApiError } from "@/lib/api/errors";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/types";
import type { MatterProceedingRecord } from "@/lib/api/matter-proceedings";

type LegalMatterAccessRecord = {
  id: string;
  account_id: string;
  client_id: string | null;
  client: {
    id: string;
    user_id: string | null;
    full_name: string | null;
  } | Array<{
    id: string;
    user_id: string | null;
    full_name: string | null;
  }> | null;
};

export async function assertMatterAccess(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  context: CurrentUser,
  matterId: string,
) {
  const { data, error } = await supabase
    .from("legal_matters")
    .select("id, account_id, client_id, client:clients(id, user_id, full_name)")
    .eq("id", matterId)
    .eq("account_id", context.accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new ApiError("NOT_FOUND", "Legal matter was not found.");
  }

  if (context.role === "client") {
    const clientJoin = Array.isArray(data.client) ? data.client[0] : data.client;
    if (!clientJoin || clientJoin.user_id !== context.userId) {
      throw new ApiError("FORBIDDEN", "Clients can only access their own legal matters.");
    }
  }

  return data as LegalMatterAccessRecord;
}

export async function loadMatterProceeding(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  context: CurrentUser,
  matterId: string,
  proceedingId: string,
) {
  const { data, error } = await supabase
    .from("matter_proceedings")
    .select("id, account_id, legal_matter_id, action_type, stage, status, case_number, court_id, circuit, department, claim_type, judgment_summary, authority, report_number, submission_date, complainant, respondent, investigation_sessions, prosecutor_name, police_station, related_lawsuit_proceeding_id, filing_date, next_deadline_at, fees_amount, metadata")
    .eq("id", proceedingId)
    .eq("account_id", context.accountId)
    .eq("legal_matter_id", matterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new ApiError("NOT_FOUND", "Matter proceeding was not found.");
  }

  return data as MatterProceedingRecord;
}

export async function assertLinkedCaseInAccount(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  context: CurrentUser,
  linkedCaseId: string,
) {
  const { data, error } = await supabase
    .from("cases")
    .select("id")
    .eq("id", linkedCaseId)
    .eq("account_id", context.accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new ApiError("FORBIDDEN", "Linked case must belong to the same account.");
  }
}
