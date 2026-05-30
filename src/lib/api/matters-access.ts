import { ApiError } from "@/lib/api/errors";
import {
  canViewMatter,
  hasMatterAction,
  normalizePlatformRole,
  type MatterAccessAssignmentInput,
  type MatterActionPermission,
} from "@/lib/access-control";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/types";
import type { MatterProceedingRecord } from "@/lib/api/matter-proceedings";
import { isMissingRelationError } from "@/lib/api/matter-api-errors";

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

type MatterAccessEntryRecord = {
  access_role: MatterAccessAssignmentInput["accessRole"];
  allowed_actions: string[] | null;
  can_view_confidential_documents: boolean | null;
  billing_scope_only: boolean | null;
};

type MatterAccessResolution = {
  matter: LegalMatterAccessRecord;
  assignment: MatterAccessAssignmentInput | null;
};

export async function assertMatterAccess(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  context: CurrentUser,
  matterId: string,
) {
  const resolved = await resolveMatterAccess(supabase, context, matterId);
  return resolved.matter;
}

export async function assertMatterActionAccess(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  context: CurrentUser,
  matterId: string,
  action: MatterActionPermission,
) {
  const resolved = await resolveMatterAccess(supabase, context, matterId);

  if (!hasMatterAction({
    role: context.role,
    action,
    directPermissions: context.permissions,
    inheritedPermissions: context.inheritedPermissions,
    matterAccess: resolved.assignment,
  })) {
    await writeMatterAccessDeniedAudit(supabase, context, matterId, `Missing action permission: ${action}.`);
    throw new ApiError("FORBIDDEN", `Missing action permission: ${action}.`);
  }

  const normalizedRole = normalizePlatformRole(context.role);
  if (normalizedRole === "finance" && action !== "manage_billing" && action !== "export_case") {
    await writeMatterAccessDeniedAudit(supabase, context, matterId, "Finance role attempted non-billing action.");
    throw new ApiError("FORBIDDEN", "Finance role is restricted to billing and export actions.");
  }

  return resolved;
}

async function resolveMatterAccess(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  context: CurrentUser,
  matterId: string,
): Promise<MatterAccessResolution> {
  const primary = await supabase
    .from("legal_matters")
    .select("id, account_id, client_id, client:clients(id, user_id, full_name)")
    .eq("id", matterId)
    .eq("account_id", context.accountId)
    .is("deleted_at", null)
    .maybeSingle();

  let data: LegalMatterAccessRecord | null = primary.data
    ? (primary.data as unknown as LegalMatterAccessRecord)
    : null;
  if (primary.error && isMissingRelationError(primary.error, "clients")) {
    const fallback = await supabase
      .from("legal_matters")
      .select("id, account_id, client_id")
      .eq("id", matterId)
      .eq("account_id", context.accountId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fallback.error) throw fallback.error;
    if (fallback.data) {
      data = {
        id: fallback.data.id,
        account_id: fallback.data.account_id,
        client_id: fallback.data.client_id,
        client: null,
      };
    } else {
      data = null;
    }
  } else if (primary.error) {
    throw primary.error;
  }

  if (!data) {
    throw new ApiError("NOT_FOUND", "Legal matter was not found.");
  }

  const assignment = await loadMatterAccessAssignment(supabase, context, matterId);
  const clientJoin = Array.isArray(data.client) ? data.client[0] : data.client;

  if (!canViewMatter({ role: context.role, matterAccess: assignment })) {
    const legacyOfficeFallback = ["owner", "admin", "lawyer", "staff", "system"].includes(context.role);
    if (!legacyOfficeFallback) {
      await writeMatterAccessDeniedAudit(supabase, context, matterId, "Matter visibility denied.");
      throw new ApiError("FORBIDDEN", "You do not have access to this legal matter.");
    }
  }

  if (normalizePlatformRole(context.role) === "client_portal") {
    const hasSharedMatterAccess = assignment?.accessRole === "client_access";
    if (!hasSharedMatterAccess && (!clientJoin || clientJoin.user_id !== context.userId)) {
      await writeMatterAccessDeniedAudit(supabase, context, matterId, "Client portal user is not linked to the matter client.");
      throw new ApiError("FORBIDDEN", "Client portal users can only access their linked legal matters.");
    }
  }

  return {
    matter: data as LegalMatterAccessRecord,
    assignment,
  };
}

async function loadMatterAccessAssignment(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  context: CurrentUser,
  matterId: string,
): Promise<MatterAccessAssignmentInput | null> {
  const { data, error } = await supabase
    .from("matter_access_entries")
    .select("access_role, allowed_actions, can_view_confidential_documents, billing_scope_only")
    .eq("account_id", context.accountId)
    .eq("legal_matter_id", matterId)
    .eq("user_id", context.userId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "";
    if (code === "42P01") {
      return null;
    }

    throw error;
  }

  if (!data) {
    return null;
  }

  const typed = data as MatterAccessEntryRecord;
  return {
    accessRole: typed.access_role,
    allowedActions: typed.allowed_actions ?? [],
    canViewConfidentialDocuments: typed.can_view_confidential_documents,
    billingScopeOnly: typed.billing_scope_only,
  };
}

export async function loadMatterProceeding(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  context: CurrentUser,
  matterId: string,
  proceedingId: string,
) {
  const { data, error } = await supabase
    .from("matter_proceedings")
    .select("id, account_id, legal_matter_id, action_type, stage, status, case_number, court_id, circuit, department, claim_type, judgment_summary, authority, report_number, submission_date, complainant, respondent, investigation_sessions, prosecutor_name, police_station, related_lawsuit_proceeding_id, client_visible, filing_date, next_deadline_at, fees_amount, metadata")
    .eq("id", proceedingId)
    .eq("account_id", context.accountId)
    .eq("legal_matter_id", matterId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new ApiError("NOT_FOUND", "Matter proceeding was not found.");
  }

  const normalizedRole = normalizePlatformRole(context.role);
  if (normalizedRole === "client_portal" && !data.client_visible) {
    await writeMatterAccessDeniedAudit(supabase, context, matterId, "Proceeding is not shared with client portal.");
    throw new ApiError("FORBIDDEN", "Proceeding is not shared with the client portal.");
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

async function writeMatterAccessDeniedAudit(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  context: CurrentUser,
  matterId: string,
  reason: string,
) {
  try {
    await supabase.from("audit_logs").insert({
      account_id: context.accountId,
      actor_user_id: context.userId,
      actor_role: context.role,
      action: "MATTER_ACCESS_DENIED",
      target_type: "legal_matter",
      target_id: matterId,
      request_id: `authz-${Date.now()}`,
      after_snapshot: { reason },
    });
  } catch {
    // Never block access-control decisions because audit insertion failed.
  }
}
