alter table public.documents
  add column document_verification_status text not null default 'not_required',
  add column verified_current_version_id uuid references public.document_versions(id),
  add column verified_at timestamptz,
  add column verification_failed_at timestamptz,
  add column verification_failure_reason text,
  add constraint documents_verification_status_chk
    check (document_verification_status in ('not_required', 'pending', 'verified', 'verification_failed', 'reviewed_not_verified'));

create index documents_verification_status_idx
on public.documents(account_id, document_verification_status, updated_at desc);
