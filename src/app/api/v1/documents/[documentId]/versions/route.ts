import { getAuthContext, requirePermission } from "@/lib/api/context";
import { assertInternalDocumentVersionCreateAllowed } from "@/lib/api/document-upload-security";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request, contextParams: { params: Promise<{ documentId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    assertInternalDocumentVersionCreateAllowed(context);
    requirePermission(context, "documents:version:create");
    const { documentId } = await contextParams.params;
    const body = await request.json();
    const supabase = createSupabaseAdmin();

    const { data: documentRow } = await supabase
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .eq("account_id", context.accountId)
      .single();

    if (!documentRow) throw new ApiError("NOT_FOUND", "Document was not found.");

    const { data, error } = await supabase
      .from("document_versions")
      .insert({
        account_id: context.accountId,
        document_id: documentId,
        version_number: Number(body.versionNumber ?? 1),
        storage_path: String(body.storagePath),
        original_file_name: String(body.originalFileName),
        mime_type: String(body.mimeType),
        size_bytes: Number(body.sizeBytes),
        sha256_hash: String(body.sha256Hash),
        uploaded_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;

    await supabase.from("documents").update({ current_version_id: data.id, updated_by: context.userId }).eq("id", documentId);
    await writeAuditEvent({
      context,
      action: "DOCUMENT_VERSION_CREATED",
      targetType: "document_version",
      targetId: data.id,
      requestId: reqId,
      request,
      after: data,
    });

    return ok({ data, requestId: reqId }, { status: 201 });
  } catch (error) {
    return fail(error, reqId);
  }
}
