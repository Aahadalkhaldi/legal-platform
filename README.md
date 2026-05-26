# Qatar Legal Platform

Production foundation for a Qatar-focused legal practice management platform.

## Stack

- Next.js App Router + TypeScript
- Supabase Auth, PostgreSQL, Storage, Realtime, Edge Functions
- pgvector for legal document retrieval
- SwiftUI native iOS integration contracts

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Supabase:

```bash
supabase start
supabase db reset
supabase functions serve
```

## Key Paths

- `supabase/migrations/202605090001_initial_legal_platform.sql`: schema, RLS, indexes, storage bucket.
- `supabase/seed.sql`: roles, permissions, Qatar courts, prosecution entities.
- `src/app/api/v1`: REST API foundation.
- `supabase/functions`: Edge Functions for sensitive operations.
- `mobile/ios/AletefaqLegalPlatform`: SwiftUI/native integration stubs.
- `docs`: API, security, and iOS integration notes.

## Security Defaults

- Tenant-owned records are scoped by `account_id`.
- Client portal reads are limited by `case_participants`, visibility flags, and document grants.
- Documents are immutable by version.
- Sensitive reads and writes create audit events.
