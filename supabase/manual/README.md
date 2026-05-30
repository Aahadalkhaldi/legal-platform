# Enterprise Access Control Manual SQL

This folder is the single source of truth for manual Supabase SQL Editor execution of enterprise access control.

## Why two files

PostgreSQL enum values added by `ALTER TYPE ... ADD VALUE` cannot be safely used in the same migration transaction.
To avoid `ERROR 55P04 unsafe use of new value ...`, execution is intentionally split into two SQL Editor runs.

## Exact run order

1. `01_enterprise_access_control_enum_and_schema.sql`
2. `02_enterprise_access_control_seed.sql`
3. `03_intake_parties_repair.sql` (run when intake fails on missing `public.opponents` or missing party columns)
4. `04_portal_mvp_schema_guard_repair.sql` (run when `/api/v1/matters` or portal pages fail due missing `clients`/`matter_access_entries`/`client_visible`)

Run each file separately and wait for success before starting the next file.

## Deprecated manual guidance

- Deprecated: old ad-hoc guidance to manually run mixed enum+seed SQL in one SQL Editor execution.
- Deprecated: past ambiguous instructions that referenced raw migration files without clear split execution.
