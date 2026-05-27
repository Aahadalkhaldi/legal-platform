# API Contracts v1

All endpoints require `Authorization: Bearer <supabase-access-token>` unless noted otherwise.
All errors use:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have access to this resource.",
    "requestId": "req_..."
  }
}
```

## Identity

`GET /api/v1/me`

Returns the active account membership, role, and permissions used by web and iOS clients.

Success response for users with an active membership:

```json
{
  "data": {
    "userId": "uuid",
    "email": "user@example.com",
    "accountId": "uuid",
    "role": "client",
    "permissions": []
  },
  "requestId": "req_..."
}
```

Bootstrap response for authenticated users missing membership/account linkage:

```json
{
  "data": {
    "onboardingRequired": true,
    "code": "MEMBERSHIP_NOT_FOUND",
    "userId": "uuid",
    "email": "user@example.com",
    "debugStage": "membershipLookupRlsFailed",
    "stageMarkers": {
      "authUserLoaded": true,
      "membershipLookupStarted": true,
      "membershipLookupRlsFailed": true,
      "membershipLookupServiceRoleFallbackStarted": true,
      "membershipLookupServiceRoleFallbackSucceeded": false,
      "onboardingFallbackReturned": true
    }
  },
  "requestId": "req_..."
}
```

`code` values for onboarding bootstrap:

- `MEMBERSHIP_NOT_FOUND`: Auth user exists but has no active `account_memberships` row.
- `ACCOUNT_NOT_FOUND`: Membership exists but target account is missing or inactive.

Notes:

- For authenticated bootstrap users, `GET /api/v1/me` returns `200` onboarding payload (never a membership/account `INTERNAL_ERROR` response).
- Other APIs remain strict and reject requests until an active membership and account are present.

## Cases

`GET /api/v1/cases?cursor=&limit=25&updated_after=`

Returns mobile-friendly case summaries. Clients only receive cases where they are a `case_participants` row.

`POST /api/v1/cases`

```json
{
  "title": "مطالبة تجارية",
  "caseNumber": "2026/123",
  "stage": "complaint",
  "status": "open",
  "clientId": "uuid",
  "courtId": "uuid",
  "description": "..."
}
```

Required permission: `cases:create`.

`GET /api/v1/cases/{caseId}`

Writes `CASE_VIEWED` to `audit_logs`.

`PATCH /api/v1/cases/{caseId}`

Required permission: `cases:update`. Writes before/after snapshots to audit.

## Timeline and Client Updates

`GET /api/v1/cases/{caseId}/timeline`

Clients only receive rows with `visible_to_client = true`.

`POST /api/v1/cases/{caseId}/timeline`

Required permission: `timeline:create`.

`POST /api/v1/cases/{caseId}/client-updates`

Required permission: `client_updates:create`.

`PATCH /api/v1/client-updates/{id}/visibility`

Required permission: `client_updates:publish`.

```json
{ "visibleToClient": true }
```

## Documents

`GET /api/v1/cases/{caseId}/documents`

Clients only receive documents explicitly shared with them.

`POST /api/v1/cases/{caseId}/documents`

Creates the logical document record. Required permission: `documents:create`.

`POST /api/v1/cases/{caseId}/documents/signed-upload`

Client portal only. Verifies the authenticated client can access the case, validates file type and size, creates a tenant-scoped signed Supabase Storage upload URL, and writes `DOCUMENT_UPLOAD_URL_CREATED`.

Allowed MIME types:

- `application/pdf`
- `image/png`
- `image/jpeg`
- `application/msword`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

Maximum size: `52428800` bytes.

```json
{
  "uploadId": "uuid",
  "originalFileName": "defense-memo.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1048576
}
```

Response:

```json
{
  "data": {
    "bucket": "legal-documents",
    "storagePath": "accounts/{accountId}/cases/{caseId}/client-uploads/{userId}/{uploadId}/defense-memo.pdf",
    "signedUrl": "https://...",
    "token": "signed-upload-token",
    "expiresInSeconds": 7200
  },
  "requestId": "req_..."
}
```

`POST /api/v1/cases/{caseId}/documents/complete-upload`

Client portal only. Verifies the same tenant-scoped path, confirms the uploaded object exists, creates `documents` and immutable `document_versions` metadata, marks the document as `client_visible`, and writes `CLIENT_DOCUMENT_UPLOAD_COMPLETED`.

```json
{
  "uploadId": "uuid",
  "storagePath": "accounts/{accountId}/cases/{caseId}/client-uploads/{userId}/{uploadId}/defense-memo.pdf",
  "originalFileName": "defense-memo.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 1048576,
  "sha256Hash": "64-character-hex",
  "title": "defense-memo.pdf",
  "documentType": "client_upload"
}
```

`POST /api/v1/documents/{documentId}/versions`

Creates an immutable version record after upload to private storage. Required permission: `documents:version:create`.

`GET /api/v1/documents/{documentId}/signed-url`

Returns a 120-second signed URL and writes `DOCUMENT_SIGNED_URL_CREATED`.

Client portal users must satisfy all of the following:

- `documents.account_id` equals the authenticated account (tenant isolation).
- Linked to the document's case through `case_participants`.
- `visible_to_client = true`.

## Internal Verification

`POST /api/v1/internal/document-verification/run`

Runs the server-side SHA-256 verification worker for pending client uploads. Restricted to `owner`, `admin`, and `system` roles; client portal users are always rejected.

```json
{
  "limit": 25
}
```

For each pending client-upload version, the worker downloads the object from private Supabase Storage with the service role, recomputes SHA-256, validates object size and MIME metadata, updates `document_versions` (`server_verified_sha256_hash`, status, and `sha256_verified_at`), updates the parent `documents` verification state only when the processed version is the current version, and writes either `DOCUMENT_UPLOAD_VERIFIED` or `DOCUMENT_UPLOAD_VERIFICATION_FAILED`.

## Workflows

`GET/POST /api/v1/tasks`

`GET/POST /api/v1/appointments`

`GET /api/v1/service-requests?cursor=&limit=25&status=`

Clients receive only requests they submitted. Staff, lawyers, admins, and owners receive account-scoped requests.

`POST /api/v1/service-requests`

Client portal only.

```json
{
  "caseId": "uuid-or-null",
  "serviceType": "consultation",
  "title": "مراجعة عقد",
  "description": "أحتاج مراجعة عقد جديد قبل التوقيع.",
  "preferredContactMethod": "app",
  "preferredAt": "2026-05-25T10:00:00.000Z"
}
```

`GET /api/v1/service-requests/{id}`

Writes `SERVICE_REQUEST_VIEWED` to `audit_logs`.

`PATCH /api/v1/service-requests/{id}`

Required permission: `service_requests:update`.

```json
{
  "status": "assigned",
  "priority": "high",
  "assignedUserId": "uuid",
  "resolvedAt": null
}
```

`GET/POST /api/v1/invoices`

Invoices default to `QAR` and persist itemized totals.

## Mobile Notifications

`GET /api/v1/notifications?cursor=&limit=25`

Returns the signed-in user's notification inbox.

`POST /api/v1/notifications/register-device`

```json
{
  "platform": "ios",
  "token": "apns-token",
  "deviceId": "stable-device-id"
}
```

## AI

`POST /api/v1/ai/document-ingest`

Queues an AI job linked to `document_version_id`.

`POST /api/v1/ai/legal-assistant/chat`

Persists the prompt/output with tenant scope. The foundation includes provenance hooks; provider/RAG integration is intentionally not hardcoded into the client.
