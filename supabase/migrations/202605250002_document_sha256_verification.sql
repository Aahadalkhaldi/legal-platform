alter table public.document_versions
  add column server_verified_sha256_hash text,
  add column sha256_verification_status text not null default 'pending',
  add column sha256_verified_at timestamptz,
  add column sha256_verification_error text,
  add column sha256_verification_requested_at timestamptz not null default now(),
  add constraint document_versions_sha256_verification_status_chk
    check (sha256_verification_status in ('pending', 'verified', 'verification_failed', 'reviewed_not_verified')),
  add constraint document_versions_server_verified_sha256_hash_chk
    check (server_verified_sha256_hash is null or server_verified_sha256_hash ~* '^[a-f0-9]{64}$');

create table public.document_version_verification_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  storage_path text not null,
  client_sha256_hash text not null check (client_sha256_hash ~* '^[a-f0-9]{64}$'),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_version_id)
);

alter table public.document_version_verification_jobs enable row level security;

create policy tenant_read_document_version_verification_jobs
on public.document_version_verification_jobs
for select using (
  account_id in (select public.current_account_ids())
  and public.current_role_for_account(account_id) in ('owner', 'admin', 'lawyer', 'staff', 'system')
);

create policy service_write_document_version_verification_jobs
on public.document_version_verification_jobs
for all using (
  account_id in (select public.current_account_ids())
  and public.current_role_for_account(account_id) in ('owner', 'admin', 'lawyer', 'staff', 'system')
) with check (
  account_id in (select public.current_account_ids())
  and public.current_role_for_account(account_id) in ('owner', 'admin', 'lawyer', 'staff', 'system')
);

create index document_versions_sha256_verification_idx
on public.document_versions(account_id, sha256_verification_status, created_at desc);

create index document_version_verification_jobs_status_idx
on public.document_version_verification_jobs(account_id, status, created_at);

create trigger document_version_verification_jobs_set_updated_at
before update on public.document_version_verification_jobs
for each row execute function public.set_updated_at();
