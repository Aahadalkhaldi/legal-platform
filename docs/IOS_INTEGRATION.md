# iOS Integration Notes

The official mobile client is SwiftUI native. Flutter remains a transitional UI/reference path until Android scope is confirmed.

## Modules

- `AppCore`: lifecycle, dependency container, routing.
- `AuthFeature`: Supabase login, MFA, token refresh, logout.
- `CasesFeature`: case list, case detail, timeline, client updates.
- `DocumentsFeature`: metadata, upload, signed URL fetch, preview, version history.
- `TasksFeature`: task lists and status changes.
- `AppointmentsFeature`: hearings, meetings, calendar sync.
- `AssistantFeature`: legal assistant chat with citations.
- `NotificationsFeature`: APNS registration, notification inbox, deep links.
- `SharedKit`: API client, DTOs, Keychain, encrypted cache, design tokens.

## Client Portal App

The native client portal scaffold lives at `mobile/ios/AletefaqClientPortal`.

Generate the Xcode project on macOS with:

```bash
cd mobile/ios/AletefaqClientPortal
xcodegen generate
open AletefaqClientPortal.xcodeproj
```

Set these Info.plist build settings per environment:

```text
API_BASE_URL=https://app.example.com
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
```

The app stores Supabase sessions in Keychain and clears sensitive session state on logout. Feature modules call the REST contracts under `/api/v1`, including cases, client updates, service requests, appointments, notifications, document signed URLs, and legal assistant chat.

## Client Document Uploads

The iOS case detail screen supports secure client uploads:

1. User picks a PDF, PNG, JPG, DOC, or DOCX file with `fileImporter`.
2. App computes SHA-256 locally and sends metadata to `POST /api/v1/cases/{caseId}/documents/signed-upload`.
3. Backend returns a short-lived signed Supabase Storage upload URL for a tenant-scoped path.
4. App uploads the file directly to Storage with `PUT` and no service-role credentials.
5. App calls `POST /api/v1/cases/{caseId}/documents/complete-upload`.
6. Backend verifies path ownership, confirms the object exists, creates `documents` + `document_versions`, audits completion, and the app refreshes the document list.

The app must not construct custom storage paths. It must use only the `storagePath` returned by the backend.

## Required Headers

Every API call must include:

```text
Authorization: Bearer <access-token>
X-Request-ID: <uuid>
Content-Type: application/json
```

## Push Routing

Notification payloads should include:

```json
{
  "targetType": "case",
  "targetId": "uuid",
  "accountId": "uuid"
}
```

On tap, refresh only the affected case/task/document scope.
