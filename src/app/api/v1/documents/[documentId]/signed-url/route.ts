import { assertCaseAccess } from "@/lib/api/case-access";
import { getAuthContext } from "@/lib/api/context";
import { assertDocumentSignedUrlAllowedForClient } from "@/lib/api/document-upload-security";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request, contextParams: { params: Promise<{ documentId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { documentId } = await contextParams.params;
    const supabase = createSupabaseAdmin();

    const { data: documentRow, error: docError } = await supabase
      .from("documents")
      .select("id, account_id, case_id, visible_to_client, current_version:document_versions(storage_path, sha256_verification_status)")
      .eq("id", documentId)
      .eq("account_id", context.accountId)
      .single();

    if (docError || !documentRow) throw new ApiError("NOT_FOUND", "Document was not found.");
    await assertDocumentSignedUrlAllowedForClient({
      context,
      document: documentRow,
      assertCaseAccess: (caseId) => assertCaseAccess(context, caseId),
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
      context,
      action: "DOCUMENT_SIGNED_URL_CREATED",
      targetType: "document",
      targetId: documentId,
      requestId: reqId,
      request,
    });

    return ok({ data: { signedUrl: data.signedUrl, expiresInSeconds: 120 }, requestId: reqId });
  } catch (error) {
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
