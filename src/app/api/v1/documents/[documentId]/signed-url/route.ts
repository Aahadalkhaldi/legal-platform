import { assertCaseAccess } from "@/lib/api/case-access";
import { getAuthContext } from "@/lib/api/context";
import { assertConfidentialDocumentReadable, assertDocumentSignedUrlAllowedForClient } from "@/lib/api/document-upload-security";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { normalizePlatformRole, type MatterAccessAssignmentInput } from "@/lib/access-control";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request, contextParams: { params: Promise<{ documentId: string }> }) {
  const reqId = requestId(request);
  let context: Awaited<ReturnType<typeof getAuthContext>> | null = null;
  let documentIdForAudit: string | null = null;

  try {
    context = await getAuthContext(request);
    const authContext = context;
    const { documentId } = await contextParams.params;
    documentIdForAudit = documentId;
    const supabase = createSupabaseAdmin();

    const { data: documentRow, error: docError } = await supabase
      .from("documents")
      .select("id, account_id, case_id, matter_proceeding_id, classification, visible_to_client, current_version:document_versions(storage_path, sha256_verification_status)")
      .eq("id", documentId)
      .eq("account_id", context.accountId)
      .single();

    if (docError || !documentRow) throw new ApiError("NOT_FOUND", "Document was not found.");
    const proceedingJoin = documentRow.matter_proceeding_id
      ? await loadProceedingShareContext(supabase, context.accountId, documentRow.matter_proceeding_id)
      : null;
    const explicitClientGrant = await hasExplicitClientDocumentGrant(supabase, context.accountId, documentId, context.userId);

    await assertDocumentSignedUrlAllowedForClient({
      context: authContext,
      document: documentRow,
      isExplicitlySharedWithClient:
        (proceedingJoin ? proceedingJoin.client_visible : true)
        && (Boolean(documentRow.visible_to_client) || explicitClientGrant),
      assertCaseAccess: (caseId) => assertCaseAccess(authContext, caseId),
    });
    const matterAccess = proceedingJoin?.legal_matter_id
      ? await loadMatterAccessForDocument(supabase, authContext.accountId, proceedingJoin.legal_matter_id, authContext.userId)
      : null;
    assertConfidentialDocumentReadable({
      context: authContext,
      classification: documentRow.classification,
      matterAccess,
    });

    const currentVersion = currentVersionFromJoin(documentRow.current_version);
    const storagePath = currentVersion?.storage_path ?? null;

    if (!storagePath) throw new ApiError("CONFLICT", "Document has no current version.");
    if (currentVersion?.sha256_verification_status === "verification_failed") {
      throw new ApiError("CONFLICT", "Document version failed server-side SHA-256 verification and requires review.");
    }

    const { data, error } = await supabase.storage.from("legal-documents").createSignedUrl(storagePath, 120);
    if (error) throw error;

    await writeAuditEvent({
      context: authContext,
      action: normalizePlatformRole(authContext.role) === "client_portal"
        ? "DOCUMENT_SIGNED_URL_CREATED_CLIENT_PORTAL"
        : "DOCUMENT_SIGNED_URL_CREATED",
      targetType: "document",
      targetId: documentId,
      requestId: reqId,
      request,
    });

    return ok({ data: { signedUrl: data.signedUrl, expiresInSeconds: 120 }, requestId: reqId });
  } catch (error) {
    if (context && documentIdForAudit && error instanceof ApiError && error.code === "FORBIDDEN") {
      await writeAuditEvent({
        context,
        action: "DOCUMENT_SENSITIVE_ACCESS_DENIED",
        targetType: "document",
        targetId: documentIdForAudit,
        requestId: reqId,
        request,
        after: {
          reason: error.message,
        },
      });
    }

    return fail(error, reqId);
  }
}

function currentVersionFromJoin(currentVersion: unknown) {
  if (Array.isArray(currentVersion)) {
    return currentVersion[0] as { storage_path?: string; sha256_verification_status?: string } | undefined;
  }

  if (currentVersion && typeof currentVersion === "object") {
    return currentVersion as { storage_path?: string; sha256_verification_status?: string };
  }

  return null;
}

async function loadProceedingShareContext(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  matterProceedingId: string,
) {
  const { data, error } = await supabase
    .from("matter_proceedings")
    .select("legal_matter_id, client_visible")
    .eq("id", matterProceedingId)
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function hasExplicitClientDocumentGrant(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  documentId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("document_access_grants")
    .select("id, can_view, expires_at")
    .eq("account_id", accountId)
    .eq("document_id", documentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    const code = typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "";
    if (code === "42P01") {
      return false;
    }

    throw error;
  }

  if (!data || !data.can_view) {
    return false;
  }

  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    return false;
  }

  return true;
}

async function loadMatterAccessForDocument(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  legalMatterId: string,
  userId: string,
): Promise<MatterAccessAssignmentInput | null> {
  const { data, error } = await supabase
    .from("matter_access_entries")
    .select("access_role, allowed_actions, can_view_confidential_documents, billing_scope_only")
    .eq("account_id", accountId)
    .eq("legal_matter_id", legalMatterId)
    .eq("user_id", userId)
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

  return {
    accessRole: data.access_role,
    allowedActions: data.allowed_actions ?? [],
    canViewConfidentialDocuments: data.can_view_confidential_documents,
    billingScopeOnly: data.billing_scope_only,
  };
}
