# Security Model

## Tenant Isolation

- Every tenant-owned table has `account_id`.
- RLS is enabled on tenant tables.
- Client reads are restricted through `case_participants`, `visible_to_client`, and `document_access_grants`.
- Server route handlers still apply explicit `account_id` filters even when using the service role.

## RBAC

Roles are `owner`, `admin`, `lawyer`, `staff`, `client`, and `system`.

The `account_memberships_owner_lockdown` trigger prevents:

- converting an owner to `client`;
- suspending, deleting, or changing the last active owner;
- leaving an account without an active owner.

## Legal Matters

- `legal_matters` and `matter_proceedings` are tenant-scoped by `account_id` with RLS enabled.
- Proceeding lifecycle actions (`convert-to-appeal`, `convert-to-cassation`, `open-execution`, `convert-to-lawsuit`, `convert-to-prosecution-case`) require `cases:update`.
- Complaint/report actions and court actions remain under the same `legal_matter_id`; conversions create new rows and keep prior rows immutable for legal traceability.
- Duplicate child conversions are constrained by `(account_id, parent_proceeding_id, action_type)` for active rows.

## Documents

- Storage bucket `legal-documents` is private.
- `documents` is the logical record.
- `document_versions` stores immutable versions with `sha256_hash`, `storage_path`, `mime_type`, and `size_bytes`.
- `document_versions.sha256_hash` is the client-provided hash. New uploaded versions are marked `sha256_verification_status = 'pending'` until a backend verification worker recomputes the hash from Supabase Storage.
- `document_versions.server_verified_sha256_hash` is reserved for the backend-computed hash. A mismatch must set `sha256_verification_status = 'verification_failed'` and `sha256_verification_error`.
- Documents whose current version is `verification_failed` are blocked from signed download URLs until reviewed.
- Client signed download URLs require both `visible_to_client = true` and case access through `case_participants`; guessing a `documentId` is not sufficient.
- The manual verification runner `POST /api/v1/internal/document-verification/run` is restricted to `owner`, `admin`, and `system` roles and is never callable by client portal users.
- Signed URLs expire after 120 seconds.
- Client uploads use server-issued signed upload URLs only after account, role, case access, MIME type, and size validation.
- Client upload paths are deterministic and tenant-scoped: `accounts/{accountId}/cases/{caseId}/client-uploads/{userId}/{uploadId}/{fileName}`.
- Upload completion rejects paths that do not match the authenticated `accountId`, `caseId`, `userId`, and `uploadId`.
- Upload completion rejects reused `uploadId` values by checking for any existing `document_versions.storage_path` under the same authenticated upload folder.
- Uploaded client files are recorded as immutable document version `1`; the original object is not overwritten.
- Client portal users cannot call the internal `POST /api/v1/documents/{documentId}/versions` workflow; that endpoint is restricted to non-client office roles with `documents:version:create`.

## Server SHA-256 Verification Worker

- The verification worker reads `pending` document versions and their parent documents with the service role.
- It only processes Storage paths shaped as `accounts/{accountId}/cases/{caseId}/client-uploads/{userId}/{uploadId}/{fileName}` and verifies those IDs match the document version tenant, parent case, and uploader.
- It downloads the private object from Supabase Storage, recomputes SHA-256, validates object size and MIME metadata against `document_versions`, and compares the server hash to the client-provided `sha256_hash` when present.
- On success, it marks the version `verified`, stores `server_verified_sha256_hash`, sets `sha256_verified_at`, clears previous failure text, marks the parent document `verified` only if this version is still current, and writes `DOCUMENT_UPLOAD_VERIFIED`.
- On failure, it marks the version `verification_failed`, stores `sha256_verified_at` (verification attempt time), stores the failure reason, marks the parent document `verification_failed` when this version is current, and writes `DOCUMENT_UPLOAD_VERIFICATION_FAILED`.
- Office UI should treat `pending` and `verification_failed` documents as not relied upon until verification or review is complete.

## Audit

Sensitive actions write to `audit_logs`, including:

- case view/update;
- client update publish/hide;
- document record/version creation;
- signed URL generation;
- signed upload URL generation;
- client upload completion;
- document upload verification success/failure;
- AI job/chat actions;
- device registration.
- service request create/view/update/assignment.

## First Office Admin Bootstrap

- Script: `scripts/bootstrap-first-office-admin.mjs`
- Purpose: idempotently bootstrap the first office account and owner membership for:
  - `law@aletefaq.com`
- Uses Supabase service role only (`SUPABASE_SERVICE_ROLE_KEY`) and never logs secrets.

Required environment variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Usage:

```bash
npm run bootstrap:first-office-admin -- --dry-run
npm run bootstrap:first-office-admin
```

Behavior:

- Resolves the target auth user dynamically from Supabase Auth by email (`law@aletefaq.com`) and uses the returned `user.id`.
- Seeds/updates `roles`, `permissions`, and `role_permissions` for `owner` and `admin` with the required office permission set.
- Ensures `public.users` row exists (with `full_name` and `email`) for the target auth user.
- Ensures account `Aletefaq Law Firm` exists with slug `aletefaq-law-firm`.
- Ensures target user has an active `owner` membership in that account with non-empty `account_memberships.permissions`.
- Re-running is safe; existing rows are updated only when required.

## Client Service Requests

- Clients can submit only their own `service_requests` rows within their active account.
- Clients can link a request to a case only when `case_participants` grants them access to that case.
- Staff-side updates require `service_requests:update`; assignment is limited to active members in the same account.

## iOS

- Access and refresh tokens must live in Keychain only.
- Sensitive caches must be encrypted and partitioned by `accountId:userId`.
- Logout or membership change must purge local documents, cached timelines, AI history, and notification state.
