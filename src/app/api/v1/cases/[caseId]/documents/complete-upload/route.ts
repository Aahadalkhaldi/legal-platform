import { assertCaseAccess } from "@/lib/api/case-access";
import {
  assertClientUploadStoragePath,
  assertUploadedObjectMatchesMetadata,
  clientUploadFolder,
  clientUploadStoragePathPattern,
  LEGAL_DOCUMENT_BUCKET,
} from "@/lib/api/document-upload-security";
import { getAuthContext } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { completeClientDocumentUploadSchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request, contextParams: { params: Promise<{ caseId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { caseId } = await contextParams.params;
    await assertCaseAccess(context, caseId);

    const payload = completeClientDocumentUploadSchema.parse(await request.json());
    assertClientUploadStoragePath(context, { ...payload, caseId });

    const supabase = createSupabaseAdmin();
    const fileName = payload.storagePath.split("/").at(-1);
    const { data: objects, error: listError } = await supabase.storage
      .from(LEGAL_DOCUMENT_BUCKET)
      .list(clientUploadFolder(context, caseId, payload.uploadId), {
        limit: 1,
        search: fileName,
      });

    if (listError) throw listError;
    const uploadedObject = objects?.find((object) => object.name === fileName);
    if (!uploadedObject) {
      throw new ApiError("CONFLICT", "Uploaded object was not found in tenant-scoped storage.");
    }
    assertUploadedObjectMatchesMetadata(uploadedObject, { ...payload, caseId });

    const { data: existingVersion, error: existingVersionError } = await supabase
      .from("document_versions")
      .select("id")
      .eq("account_id", context.accountId)
      .like("storage_path", clientUploadStoragePathPattern(context, caseId, payload.uploadId))
      .limit(1)
      .maybeSingle();

    if (existingVersionError) throw existingVersionError;
    if (existingVersion) {
      throw new ApiError("CONFLICT", "This upload id has already been completed.");
    }

    const { data: documentRow, error: documentError } = await supabase
      .from("documents")
      .insert({
        account_id: context.accountId,
        case_id: caseId,
        title: payload.title,
        document_type: payload.documentType,
        classification: "client_visible",
        visible_to_client: true,
        document_verification_status: "pending",
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (documentError) throw documentError;

    const { data: versionRow, error: versionError } = await supabase
      .from("document_versions")
      .insert({
        account_id: context.accountId,
        document_id: documentRow.id,
        version_number: 1,
        storage_path: payload.storagePath,
        original_file_name: payload.originalFileName,
        mime_type: payload.mimeType,
        size_bytes: payload.sizeBytes,
        sha256_hash: payload.sha256Hash.toLowerCase(),
        sha256_verification_status: "pending",
        sha256_verification_requested_at: new Date().toISOString(),
        uploaded_by: context.userId,
      })
      .select("*")
      .single();

    if (versionError) throw versionError;

    const { error: verificationJobError } = await supabase
      .from("document_version_verification_jobs")
      .insert({
        account_id: context.accountId,
        document_version_id: versionRow.id,
        storage_path: payload.storagePath,
        client_sha256_hash: payload.sha256Hash.toLowerCase(),
        status: "queued",
      });

    if (verificationJobError) throw verificationJobError;

    const { data: updatedDocument, error: updateError } = await supabase
      .from("documents")
      .update({ current_version_id: versionRow.id, updated_by: context.userId })
      .eq("id", documentRow.id)
      .eq("account_id", context.accountId)
      .select("*")
      .single();

    if (updateError) throw updateError;

    await writeAuditEvent({
      context,
      action: "CLIENT_DOCUMENT_UPLOAD_COMPLETED",
      targetType: "document",
      targetId: documentRow.id,
      requestId: reqId,
      request,
      after: {
        document: updatedDocument,
        version: versionRow,
        verificationStatus: "pending",
      },
    });

    return ok({ data: updatedDocument, requestId: reqId }, { status: 201 });
  } catch (error) {
    return fail(error, reqId);
  }
}
