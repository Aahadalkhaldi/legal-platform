import { createHash, randomUUID } from "node:crypto";
import { assertClientUploadPathBelongsToDocument, LEGAL_DOCUMENT_BUCKET, MAX_CLIENT_UPLOAD_BYTES } from "@/lib/api/document-upload-security";
import { isElevatedPlatformRole } from "@/lib/access-control";
import { ApiError } from "@/lib/api/errors";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/types";

export type PendingDocumentVersion = {
  id: string;
  account_id: string;
  document_id: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256_hash: string | null;
  uploaded_by: string | null;
  document: {
    id: string;
    account_id: string;
    case_id: string | null;
    current_version_id: string | null;
  } | Array<{
    id: string;
    account_id: string;
    case_id: string | null;
    current_version_id: string | null;
  }> | null;
};

export type DownloadedStorageObject = {
  bytes: ArrayBuffer;
  sizeBytes: number;
  mimeType: string;
};

export type VerificationDecision =
  | { status: "verified"; serverSha256Hash: string }
  | { status: "verification_failed"; serverSha256Hash?: string; failureReason: string };

export type VerificationWorkerResult = {
  processed: number;
  verified: number;
  failed: number;
  failures: Array<{ documentVersionId: string; reason: string }>;
};

export type VerificationWorkerDependencies = {
  listPending: (limit: number) => Promise<PendingDocumentVersion[]>;
  downloadObject: (storagePath: string) => Promise<DownloadedStorageObject | null>;
  markVerified: (version: PendingDocumentVersion, serverSha256Hash: string, verifiedAt: string) => Promise<void>;
  markFailed: (
    version: PendingDocumentVersion,
    failureReason: string,
    verifiedAt: string,
    serverSha256Hash?: string
  ) => Promise<void>;
  writeAudit: (version: PendingDocumentVersion, action: "DOCUMENT_UPLOAD_VERIFIED" | "DOCUMENT_UPLOAD_VERIFICATION_FAILED", metadata: unknown) => Promise<void>;
};

export function assertManualDocumentVerificationAllowed(context: CurrentUser) {
  if (!isElevatedPlatformRole(context.role)) {
    throw new ApiError("FORBIDDEN", "Only internal administrators can run document verification.");
  }
}

export async function runDocumentVerificationWorker(input: {
  limit: number;
  dependencies: VerificationWorkerDependencies;
}): Promise<VerificationWorkerResult> {
  const versions = await input.dependencies.listPending(input.limit);
  const result: VerificationWorkerResult = {
    processed: 0,
    verified: 0,
    failed: 0,
    failures: [],
  };

  for (const version of versions) {
    result.processed += 1;
    const verifiedAt = new Date().toISOString();
    const decision = await verifyOneDocumentVersion(version, input.dependencies.downloadObject);

    if (decision.status === "verified") {
      await input.dependencies.markVerified(version, decision.serverSha256Hash, verifiedAt);
      await input.dependencies.writeAudit(version, "DOCUMENT_UPLOAD_VERIFIED", { serverSha256Hash: decision.serverSha256Hash });
      result.verified += 1;
    } else {
      await input.dependencies.markFailed(version, decision.failureReason, verifiedAt, decision.serverSha256Hash);
      await input.dependencies.writeAudit(version, "DOCUMENT_UPLOAD_VERIFICATION_FAILED", {
        serverSha256Hash: decision.serverSha256Hash ?? null,
        failureReason: decision.failureReason,
      });
      result.failed += 1;
      result.failures.push({ documentVersionId: version.id, reason: decision.failureReason });
    }
  }

  return result;
}

export async function verifyOneDocumentVersion(
  version: PendingDocumentVersion,
  downloadObject: (storagePath: string) => Promise<DownloadedStorageObject | null>,
): Promise<VerificationDecision> {
  try {
    validatePendingVersionShape(version);
    const object = await downloadObject(version.storage_path);

    if (!object) {
      return { status: "verification_failed", failureReason: "Uploaded object is missing from Supabase Storage." };
    }

    const metadataError = validateStorageObjectMetadata(version, object);
    if (metadataError) {
      return { status: "verification_failed", failureReason: metadataError };
    }

    const serverSha256Hash = sha256Hex(object.bytes);
    if (version.sha256_hash && serverSha256Hash !== version.sha256_hash.toLowerCase()) {
      return {
        status: "verification_failed",
        serverSha256Hash,
        failureReason: "Server-computed SHA-256 does not match the client-provided hash.",
      };
    }

    return { status: "verified", serverSha256Hash };
  } catch (error) {
    return {
      status: "verification_failed",
      failureReason: error instanceof Error ? error.message : "Document verification failed.",
    };
  }
}

export function validatePendingVersionShape(version: PendingDocumentVersion) {
  const document = parentDocument(version);
  if (!document) {
    throw new ApiError("CONFLICT", "Document version has no parent document.");
  }

  if (document.account_id !== version.account_id) {
    throw new ApiError("FORBIDDEN", "Document version account does not match parent document account.");
  }

  if (document.current_version_id !== version.id) {
    throw new ApiError("CONFLICT", "Document version is not the current version for its parent document.");
  }

  if (!document.case_id || !version.uploaded_by) {
    throw new ApiError("CONFLICT", "Client upload verification requires case and uploader metadata.");
  }

  assertClientUploadPathBelongsToDocument({
    storagePath: version.storage_path,
    accountId: version.account_id,
    caseId: document.case_id,
    uploadedBy: version.uploaded_by,
  });
}

export function validateStorageObjectMetadata(version: PendingDocumentVersion, object: DownloadedStorageObject) {
  if (!Number.isInteger(object.sizeBytes) || object.sizeBytes <= 0 || object.sizeBytes > MAX_CLIENT_UPLOAD_BYTES) {
    return "Uploaded object size is outside the allowed range.";
  }

  if (object.sizeBytes !== version.size_bytes) {
    return "Uploaded object size does not match document version metadata.";
  }

  const objectMimeType = object.mimeType.split(";")[0].trim().toLowerCase();
  if (objectMimeType !== version.mime_type.toLowerCase()) {
    return "Uploaded object MIME type does not match document version metadata.";
  }

  return null;
}

export function sha256Hex(bytes: ArrayBuffer) {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

export function createSupabaseDocumentVerificationDependencies(request: Request): VerificationWorkerDependencies {
  const supabase = createSupabaseAdmin();

  return {
    async listPending(limit) {
      const { data, error } = await supabase
        .from("document_versions")
        .select("id, account_id, document_id, storage_path, original_file_name, mime_type, size_bytes, sha256_hash, uploaded_by, document:documents(id, account_id, case_id, current_version_id)")
        .eq("sha256_verification_status", "pending")
        .like("storage_path", "accounts/%/cases/%/client-uploads/%")
        .not("uploaded_by", "is", null)
        .order("created_at", { ascending: true })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as PendingDocumentVersion[];
    },

    async downloadObject(storagePath) {
      const { data, error } = await supabase.storage.from(LEGAL_DOCUMENT_BUCKET).download(storagePath);
      if (error || !data) {
        return null;
      }

      return {
        bytes: await data.arrayBuffer(),
        sizeBytes: data.size,
        mimeType: data.type,
      };
    },

    async markVerified(version, serverSha256Hash, verifiedAt) {
      const document = parentDocument(version);
      const { error: versionError } = await supabase
        .from("document_versions")
        .update({
          server_verified_sha256_hash: serverSha256Hash,
          sha256_verification_status: "verified",
          sha256_verified_at: verifiedAt,
          sha256_verification_error: null,
        })
        .eq("id", version.id)
        .eq("account_id", version.account_id);

      if (versionError) throw versionError;

      if (document?.current_version_id === version.id) {
        const { error: documentError } = await supabase
          .from("documents")
          .update({
            document_verification_status: "verified",
            verified_current_version_id: version.id,
            verified_at: verifiedAt,
            verification_failed_at: null,
            verification_failure_reason: null,
          })
          .eq("id", version.document_id)
          .eq("account_id", version.account_id);

        if (documentError) throw documentError;
      }

      const { error: jobError } = await supabase
        .from("document_version_verification_jobs")
        .update({ status: "completed", error_message: null })
        .eq("document_version_id", version.id)
        .eq("account_id", version.account_id);

      if (jobError) throw jobError;
    },

    async markFailed(version, failureReason, verifiedAt, serverSha256Hash) {
      const { error: versionError } = await supabase
        .from("document_versions")
        .update({
          server_verified_sha256_hash: serverSha256Hash ?? null,
          sha256_verification_status: "verification_failed",
          sha256_verified_at: verifiedAt,
          sha256_verification_error: failureReason,
        })
        .eq("id", version.id)
        .eq("account_id", version.account_id);

      if (versionError) throw versionError;

      const { error: documentError } = await supabase
        .from("documents")
        .update({
          document_verification_status: "verification_failed",
          verification_failed_at: new Date().toISOString(),
          verification_failure_reason: failureReason,
        })
        .eq("current_version_id", version.id)
        .eq("account_id", version.account_id);

      if (documentError) throw documentError;

      const { error: jobError } = await supabase
        .from("document_version_verification_jobs")
        .update({ status: "failed", error_message: failureReason })
        .eq("document_version_id", version.id)
        .eq("account_id", version.account_id);

      if (jobError) throw jobError;
    },

    async writeAudit(version, action, metadata) {
      await supabase.from("audit_logs").insert({
        account_id: version.account_id,
        actor_user_id: null,
        actor_role: "system",
        action,
        target_type: "document_version",
        target_id: version.id,
        request_id: request.headers.get("x-request-id") ?? randomUUID(),
        ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        user_agent: request.headers.get("user-agent"),
        after_snapshot: metadata,
      });
    },
  };
}

export function parentDocument(version: PendingDocumentVersion) {
  if (Array.isArray(version.document)) {
    return version.document[0] ?? null;
  }

  return version.document;
}
