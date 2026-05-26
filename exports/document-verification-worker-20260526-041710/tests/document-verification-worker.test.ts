import { describe, expect, it } from "vitest";
import {
  assertManualDocumentVerificationAllowed,
  runDocumentVerificationWorker,
  verifyOneDocumentVersion,
  type DownloadedStorageObject,
  type PendingDocumentVersion,
  type VerificationWorkerDependencies,
} from "@/lib/api/document-verification-worker";
import { ApiError } from "@/lib/api/errors";
import { MAX_CLIENT_UPLOAD_BYTES } from "@/lib/api/document-upload-security";
import type { CurrentUser } from "@/lib/types";

const accountId = "22222222-2222-4222-8222-222222222222";
const caseId = "33333333-3333-4333-8333-333333333333";
const userId = "11111111-1111-4111-8111-111111111111";
const uploadId = "44444444-4444-4444-8444-444444444444";
const versionId = "55555555-5555-4555-8555-555555555555";
const documentId = "66666666-6666-4666-8666-666666666666";
const bytes = new TextEncoder().encode("verified legal document").buffer;
const expectedHash = "282a835b9b36200d8710e1a179675fc1e36ba03f7cb77c7dc757cd3a6fc76c85";

const baseVersion: PendingDocumentVersion = {
  id: versionId,
  account_id: accountId,
  document_id: documentId,
  storage_path: `accounts/${accountId}/cases/${caseId}/client-uploads/${userId}/${uploadId}/defense.pdf`,
  original_file_name: "defense.pdf",
  mime_type: "application/pdf",
  size_bytes: bytes.byteLength,
  sha256_hash: expectedHash,
  uploaded_by: userId,
  document: {
    id: documentId,
    account_id: accountId,
    case_id: caseId,
    current_version_id: versionId,
  },
};

const validObject: DownloadedStorageObject = {
  bytes,
  sizeBytes: bytes.byteLength,
  mimeType: "application/pdf",
};

describe("document verification worker", () => {
  it("marks a pending upload verified when bytes, hash, size, MIME, tenant, and latest version match", async () => {
    const calls: string[] = [];
    const deps = dependencies({
      listPending: async () => [baseVersion],
      downloadObject: async () => validObject,
      markVerified: async () => { calls.push("verified"); },
      writeAudit: async (_version, action) => { calls.push(action); },
    });

    const result = await runDocumentVerificationWorker({ limit: 25, dependencies: deps });

    expect(result).toMatchObject({ processed: 1, verified: 1, failed: 0 });
    expect(calls).toEqual(["verified", "DOCUMENT_UPLOAD_VERIFIED"]);
  });

  it("fails verification on hash mismatch", async () => {
    let recordedFailureTimestamp: string | null = null;
    const decision = await verifyOneDocumentVersion(
      { ...baseVersion, sha256_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      async () => validObject,
    );

    expect(decision).toMatchObject({
      status: "verification_failed",
      failureReason: "Server-computed SHA-256 does not match the client-provided hash.",
    });

    const deps = dependencies({
      listPending: async () => [{ ...baseVersion, sha256_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
      downloadObject: async () => validObject,
      markFailed: async (_version, _reason, verifiedAt) => { recordedFailureTimestamp = verifiedAt; },
    });
    const result = await runDocumentVerificationWorker({ limit: 25, dependencies: deps });
    expect(result.failed).toBe(1);
    expect(recordedFailureTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("fails verification when the object is missing", async () => {
    const decision = await verifyOneDocumentVersion(baseVersion, async () => null);

    expect(decision).toMatchObject({
      status: "verification_failed",
      failureReason: "Uploaded object is missing from Supabase Storage.",
    });
  });

  it("fails verification for forged storagePath traversal", async () => {
    const decision = await verifyOneDocumentVersion(
      { ...baseVersion, storage_path: `accounts/${accountId}/cases/${caseId}/client-uploads/${userId}/${uploadId}/../defense.pdf` },
      async () => validObject,
    );

    expect(decision.status).toBe("verification_failed");
  });

  it("fails verification for wrong tenant path", async () => {
    const decision = await verifyOneDocumentVersion(
      { ...baseVersion, storage_path: baseVersion.storage_path.replace(accountId, "99999999-9999-4999-8999-999999999999") },
      async () => validObject,
    );

    expect(decision.status).toBe("verification_failed");
  });

  it("fails verification for invalid MIME metadata", async () => {
    const decision = await verifyOneDocumentVersion(baseVersion, async () => ({
      ...validObject,
      mimeType: "application/zip",
    }));

    expect(decision).toMatchObject({
      status: "verification_failed",
      failureReason: "Uploaded object MIME type does not match document version metadata.",
    });
  });

  it("fails verification for oversized object metadata", async () => {
    const decision = await verifyOneDocumentVersion(baseVersion, async () => ({
      ...validObject,
      sizeBytes: MAX_CLIENT_UPLOAD_BYTES + 1,
    }));

    expect(decision).toMatchObject({
      status: "verification_failed",
      failureReason: "Uploaded object size is outside the allowed range.",
    });
  });

  it("rejects client users attempting to run manual verification", () => {
    const context: CurrentUser = {
      userId,
      email: "client@example.com",
      accountId,
      role: "client",
      permissions: [],
    };

    expect(() => assertManualDocumentVerificationAllowed(context)).toThrow(ApiError);
    expect(() => assertManualDocumentVerificationAllowed({ ...context, role: "admin" })).not.toThrow();
  });
});

function dependencies(overrides: Partial<VerificationWorkerDependencies>): VerificationWorkerDependencies {
  return {
    listPending: async () => [],
    downloadObject: async () => null,
    markVerified: async () => {},
    markFailed: async () => {},
    writeAudit: async () => {},
    ...overrides,
  };
}
