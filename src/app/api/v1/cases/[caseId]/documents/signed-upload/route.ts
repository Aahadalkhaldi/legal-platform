import { assertCaseAccess } from "@/lib/api/case-access";
import {
  buildClientUploadStoragePath,
  LEGAL_DOCUMENT_BUCKET,
} from "@/lib/api/document-upload-security";
import { getAuthContext } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { fail, ok, requestId } from "@/lib/api/errors";
import { clientDocumentUploadSchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request, contextParams: { params: Promise<{ caseId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { caseId } = await contextParams.params;
    await assertCaseAccess(context, caseId);

    const payload = clientDocumentUploadSchema.parse(await request.json());
    const storagePath = buildClientUploadStoragePath(context, { ...payload, caseId });
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase.storage
      .from(LEGAL_DOCUMENT_BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: "DOCUMENT_UPLOAD_URL_CREATED",
      targetType: "case",
      targetId: caseId,
      requestId: reqId,
      request,
      after: {
        uploadId: payload.uploadId,
        storagePath,
        mimeType: payload.mimeType,
        sizeBytes: payload.sizeBytes,
      },
    });

    return ok({
      data: {
        bucket: LEGAL_DOCUMENT_BUCKET,
        storagePath,
        signedUrl: data.signedUrl,
        token: data.token,
        expiresInSeconds: 7200,
      },
      requestId: reqId,
    });
  } catch (error) {
    return fail(error, reqId);
  }
}
