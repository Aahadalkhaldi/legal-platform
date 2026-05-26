import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  assertClientCanUploadDocument,
  assertClientUploadStoragePath,
  assertDocumentSignedUrlAllowedForClient,
  assertInternalDocumentVersionCreateAllowed,
  assertUploadedObjectMatchesMetadata,
  buildClientUploadStoragePath,
  clientUploadFolder,
  clientUploadStoragePathPattern,
  MAX_CLIENT_UPLOAD_BYTES,
} from "@/lib/api/document-upload-security";
import type { CurrentUser } from "@/lib/types";

const clientContext: CurrentUser = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "client@example.com",
  accountId: "22222222-2222-4222-8222-222222222222",
  role: "client",
  permissions: [],
};

const baseMetadata = {
  caseId: "33333333-3333-4333-8333-333333333333",
  uploadId: "44444444-4444-4444-8444-444444444444",
  originalFileName: "defense memo.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
};

describe("document upload security", () => {
  it("builds a tenant-scoped client upload path", () => {
    expect(buildClientUploadStoragePath(clientContext, baseMetadata)).toBe(
      [
        "accounts",
        clientContext.accountId,
        "cases",
        baseMetadata.caseId,
        "client-uploads",
        clientContext.userId,
        baseMetadata.uploadId,
        baseMetadata.originalFileName,
      ].join("/"),
    );
  });

  it("rejects cross-tenant storage paths at completion time", () => {
    const storagePath = buildClientUploadStoragePath(
      { ...clientContext, accountId: "99999999-9999-4999-8999-999999999999" },
      baseMetadata,
    );

    expect(() => assertClientUploadStoragePath(clientContext, { ...baseMetadata, storagePath })).toThrow(ApiError);
  });

  it("rejects cross-case storage paths at completion time", () => {
    const storagePath = buildClientUploadStoragePath(clientContext, {
      ...baseMetadata,
      caseId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(() => assertClientUploadStoragePath(clientContext, { ...baseMetadata, storagePath })).toThrow(ApiError);
  });

  it("rejects cross-user storage paths at completion time", () => {
    const storagePath = buildClientUploadStoragePath(
      { ...clientContext, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
      baseMetadata,
    );

    expect(() => assertClientUploadStoragePath(clientContext, { ...baseMetadata, storagePath })).toThrow(ApiError);
  });

  it("rejects path traversal in completed storage paths", () => {
    const storagePath = [
      "accounts",
      clientContext.accountId,
      "cases",
      baseMetadata.caseId,
      "client-uploads",
      clientContext.userId,
      baseMetadata.uploadId,
      "../defense memo.pdf",
    ].join("/");

    expect(() => assertClientUploadStoragePath(clientContext, { ...baseMetadata, storagePath })).toThrow(ApiError);
  });

  it("rejects unsupported file types and oversized files before issuing signed URLs", () => {
    expect(() =>
      assertClientCanUploadDocument(clientContext, { ...baseMetadata, mimeType: "application/zip" }),
    ).toThrow(ApiError);

    expect(() =>
      assertClientCanUploadDocument(clientContext, { ...baseMetadata, sizeBytes: MAX_CLIENT_UPLOAD_BYTES + 1 }),
    ).toThrow(ApiError);
  });

  it("rejects uploaded objects whose storage metadata does not match the signed upload metadata", () => {
    expect(() =>
      assertUploadedObjectMatchesMetadata(
        { name: "defense memo.pdf", metadata: { size: MAX_CLIENT_UPLOAD_BYTES + 1, mimetype: "application/pdf" } },
        baseMetadata,
      ),
    ).toThrow(ApiError);

    expect(() =>
      assertUploadedObjectMatchesMetadata(
        { name: "defense memo.pdf", metadata: { size: baseMetadata.sizeBytes, mimetype: "application/zip" } },
        baseMetadata,
      ),
    ).toThrow(ApiError);
  });

  it("rejects non-client roles from client upload URLs", () => {
    expect(() =>
      assertClientCanUploadDocument({ ...clientContext, role: "lawyer" }, baseMetadata),
    ).toThrow(ApiError);
  });

  it("rejects direct client access to the internal document version workflow", () => {
    expect(() =>
      assertInternalDocumentVersionCreateAllowed({
        ...clientContext,
        permissions: ["documents:version:create"],
      }),
    ).toThrow(ApiError);
    expect(() => assertInternalDocumentVersionCreateAllowed({ ...clientContext, role: "lawyer" })).not.toThrow();
  });

  it("scopes reused upload-id detection to the authenticated upload folder", () => {
    expect(clientUploadFolder(clientContext, baseMetadata.caseId, baseMetadata.uploadId)).toBe(
      [
        "accounts",
        clientContext.accountId,
        "cases",
        baseMetadata.caseId,
        "client-uploads",
        clientContext.userId,
        baseMetadata.uploadId,
      ].join("/"),
    );

    expect(clientUploadStoragePathPattern(clientContext, baseMetadata.caseId, baseMetadata.uploadId)).toBe(
      `${clientUploadFolder(clientContext, baseMetadata.caseId, baseMetadata.uploadId)}/%`,
    );
  });

  it("rejects signed-url access for client users who are not linked to the document case", async () => {
    await expect(
      assertDocumentSignedUrlAllowedForClient({
        context: clientContext,
        document: { account_id: clientContext.accountId, case_id: baseMetadata.caseId, visible_to_client: true },
        assertCaseAccess: async () => {
          throw new ApiError("FORBIDDEN", "Clients can only access their own cases.");
        },
      }),
    ).rejects.toThrow(ApiError);
  });

  it("rejects signed-url access for client users across tenants", async () => {
    await expect(
      assertDocumentSignedUrlAllowedForClient({
        context: clientContext,
        document: {
          account_id: "99999999-9999-4999-8999-999999999999",
          case_id: baseMetadata.caseId,
          visible_to_client: true,
        },
        assertCaseAccess: async () => {},
      }),
    ).rejects.toThrow(ApiError);
  });
});
