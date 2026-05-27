import { ApiError } from "@/lib/api/errors";
import { canViewConfidentialDocuments, isClientPortalRole, normalizePlatformRole, type MatterAccessAssignmentInput } from "@/lib/access-control";
import type { CurrentUser } from "@/lib/types";

export const LEGAL_DOCUMENT_BUCKET = "legal-documents";
export const MAX_CLIENT_UPLOAD_BYTES = 50 * 1024 * 1024;

export const ALLOWED_CLIENT_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

const EXTENSION_BY_MIME_TYPE: Record<(typeof ALLOWED_CLIENT_UPLOAD_MIME_TYPES)[number], string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export type ClientUploadMetadata = {
  caseId: string;
  uploadId: string;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
};

export type UploadedObjectMetadata = {
  name: string;
  metadata: {
    size?: unknown;
    contentLength?: unknown;
    mimetype?: unknown;
  } | null;
};

export function assertClientCanUploadDocument(context: CurrentUser, metadata: ClientUploadMetadata) {
  if (!isClientPortalRole(context.role)) {
    throw new ApiError("FORBIDDEN", "Only client portal users can use client upload URLs.");
  }

  if (!isAllowedClientUploadMimeType(metadata.mimeType)) {
    throw new ApiError("VALIDATION_ERROR", "Unsupported file type.");
  }

  if (!Number.isInteger(metadata.sizeBytes) || metadata.sizeBytes <= 0 || metadata.sizeBytes > MAX_CLIENT_UPLOAD_BYTES) {
    throw new ApiError("VALIDATION_ERROR", "File size is outside the allowed range.");
  }

  if (!isSafeUploadId(metadata.uploadId)) {
    throw new ApiError("VALIDATION_ERROR", "Invalid upload id.");
  }
}

export function assertInternalDocumentVersionCreateAllowed(context: CurrentUser) {
  if (isClientPortalRole(context.role)) {
    throw new ApiError("FORBIDDEN", "Client portal users must use the client upload workflow.");
  }
}

export async function assertDocumentSignedUrlAllowedForClient(input: {
  context: CurrentUser;
  document: { account_id?: string | null; case_id?: string | null; visible_to_client?: boolean | null };
  isExplicitlySharedWithClient?: boolean;
  assertCaseAccess: (caseId: string) => Promise<void>;
}) {
  if (!isClientPortalRole(input.context.role)) {
    return;
  }

  if (input.document.account_id !== input.context.accountId) {
    throw new ApiError("FORBIDDEN", "Client portal users cannot access documents outside their tenant.");
  }

  if (!input.document.case_id) {
    throw new ApiError("FORBIDDEN", "Client portal documents must be linked to a case.");
  }

  await input.assertCaseAccess(input.document.case_id);

  if (!input.document.visible_to_client || input.isExplicitlySharedWithClient === false) {
    throw new ApiError("FORBIDDEN", "Document is not shared with the client portal.");
  }
}

export function assertConfidentialDocumentReadable(input: {
  context: CurrentUser;
  classification?: string | null;
  matterAccess?: MatterAccessAssignmentInput | null;
}) {
  if (input.classification !== "confidential") {
    return;
  }

  if (normalizePlatformRole(input.context.role) !== "trainee") {
    return;
  }

  if (!canViewConfidentialDocuments({ role: input.context.role, matterAccess: input.matterAccess })) {
    throw new ApiError("FORBIDDEN", "Trainee role cannot access confidential documents for this matter.");
  }
}

export function buildClientUploadStoragePath(context: CurrentUser, metadata: ClientUploadMetadata) {
  assertClientCanUploadDocument(context, metadata);
  const extension = EXTENSION_BY_MIME_TYPE[metadata.mimeType as (typeof ALLOWED_CLIENT_UPLOAD_MIME_TYPES)[number]];
  const fileName = sanitizeFileName(metadata.originalFileName, extension);

  return [
    "accounts",
    context.accountId,
    "cases",
    metadata.caseId,
    "client-uploads",
    context.userId,
    metadata.uploadId,
    fileName,
  ].join("/");
}

export function assertClientUploadStoragePath(context: CurrentUser, metadata: ClientUploadMetadata & { storagePath: string }) {
  const expected = buildClientUploadStoragePath(context, metadata);
  if (metadata.storagePath !== expected) {
    throw new ApiError("FORBIDDEN", "Upload path does not match the authenticated client, account, and case.");
  }
}

export function assertUploadedObjectMatchesMetadata(object: UploadedObjectMetadata, metadata: ClientUploadMetadata) {
  if (!object.metadata) {
    throw new ApiError("CONFLICT", "Uploaded object metadata is missing.");
  }

  const objectSize = Number(object.metadata.size ?? object.metadata.contentLength);
  if (!Number.isInteger(objectSize) || objectSize !== metadata.sizeBytes) {
    throw new ApiError("CONFLICT", "Uploaded object size does not match the signed upload metadata.");
  }

  const objectMimeType = String(object.metadata.mimetype ?? "").split(";")[0].trim().toLowerCase();
  if (objectMimeType !== metadata.mimeType.toLowerCase()) {
    throw new ApiError("CONFLICT", "Uploaded object MIME type does not match the signed upload metadata.");
  }
}

export function clientUploadFolder(context: CurrentUser, caseId: string, uploadId: string) {
  if (!isSafeUploadId(uploadId)) {
    throw new ApiError("VALIDATION_ERROR", "Invalid upload id.");
  }

  return ["accounts", context.accountId, "cases", caseId, "client-uploads", context.userId, uploadId].join("/");
}

export function clientUploadStoragePathPattern(context: CurrentUser, caseId: string, uploadId: string) {
  return `${clientUploadFolder(context, caseId, uploadId)}/%`;
}

export type ParsedClientUploadStoragePath = {
  accountId: string;
  caseId: string;
  userId: string;
  uploadId: string;
  fileName: string;
};

export function parseClientUploadStoragePath(storagePath: string): ParsedClientUploadStoragePath {
  const parts = storagePath.split("/");

  if (
    parts.length !== 8
    || parts[0] !== "accounts"
    || parts[2] !== "cases"
    || parts[4] !== "client-uploads"
  ) {
    throw new ApiError("FORBIDDEN", "Storage path is not a tenant-scoped client upload path.");
  }

  const [accountId, caseId, userId, uploadId, fileName] = [parts[1], parts[3], parts[5], parts[6], parts[7]];
  if (!isSafeUuid(accountId) || !isSafeUuid(caseId) || !isSafeUuid(userId) || !isSafeUploadId(uploadId)) {
    throw new ApiError("FORBIDDEN", "Storage path contains invalid tenant, case, user, or upload identifiers.");
  }

  if (!fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) {
    throw new ApiError("FORBIDDEN", "Storage path contains an unsafe file name.");
  }

  return { accountId, caseId, userId, uploadId, fileName };
}

export function assertClientUploadPathBelongsToDocument(input: {
  storagePath: string;
  accountId: string;
  caseId: string;
  uploadedBy: string;
}) {
  const parsed = parseClientUploadStoragePath(input.storagePath);

  if (parsed.accountId !== input.accountId || parsed.caseId !== input.caseId || parsed.userId !== input.uploadedBy) {
    throw new ApiError("FORBIDDEN", "Storage path does not belong to the document version tenant, case, and uploader.");
  }
}

export function sanitizeFileName(fileName: string, fallbackExtension: string) {
  const trimmed = fileName.trim().replace(/[/\\?%*:|"<>]/g, "-");
  const withoutControls = trimmed.replace(/[\u0000-\u001f\u007f]/g, "");
  const compact = withoutControls.replace(/\s+/g, " ").slice(0, 120);
  const safeName = compact.length > 0 ? compact : `document.${fallbackExtension}`;

  return /\.[A-Za-z0-9]{2,8}$/.test(safeName) ? safeName : `${safeName}.${fallbackExtension}`;
}

function isAllowedClientUploadMimeType(value: string): value is (typeof ALLOWED_CLIENT_UPLOAD_MIME_TYPES)[number] {
  return ALLOWED_CLIENT_UPLOAD_MIME_TYPES.includes(value as (typeof ALLOWED_CLIENT_UPLOAD_MIME_TYPES)[number]);
}

function isSafeUploadId(value: string) {
  return isSafeUuid(value);
}

function isSafeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
