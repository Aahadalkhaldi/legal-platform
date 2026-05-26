create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_user_id uuid not null references public.users(id),
  case_id uuid references public.cases(id) on delete set null,
  assigned_user_id uuid references public.users(id),
  service_type text not null,
  status text not null default 'submitted',
  priority text not null default 'normal',
  title text not null,
  description text not null,
  preferred_contact_method text,
  preferred_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  check (service_type in ('consultation', 'document_review', 'new_claim', 'follow_up', 'other')),
  check (status in ('submitted', 'in_review', 'assigned', 'in_progress', 'waiting_on_client', 'resolved', 'cancelled')),
  check (priority in ('low', 'normal', 'high', 'urgent')),
  check (char_length(trim(title)) > 0),
  check (char_length(trim(description)) > 0)
);

alter table public.service_requests enable row level security;

create policy tenant_read_service_requests on public.service_requests
for select using (
  account_id in (select public.current_account_ids())
  and (
    public.current_role_for_account(account_id) in ('owner', 'admin', 'lawyer', 'staff', 'system')
    or client_user_id = auth.uid()
  )
);

create policy client_create_service_requests on public.service_requests
for insert with check (
  account_id in (select public.current_account_ids())
  and client_user_id = auth.uid()
  and public.current_role_for_account(account_id) = 'client'
  and (case_id is null or public.can_access_case(case_id))
);

create policy staff_write_service_requests on public.service_requests
for all using (
  account_id in (select public.current_account_ids())
  and public.current_role_for_account(account_id) in ('owner', 'admin', 'lawyer', 'staff', 'system')
) with check (
  account_id in (select public.current_account_ids())
  and public.current_role_for_account(account_id) in ('owner', 'admin', 'lawyer', 'staff', 'system')
);

create index service_requests_client_created_idx on public.service_requests(account_id, client_user_id, created_at desc);
create index service_requests_case_created_idx on public.service_requests(account_id, case_id, created_at desc);
create index service_requests_status_created_idx on public.service_requests(account_id, status, created_at desc);
create index service_requests_assignee_status_idx on public.service_requests(account_id, assigned_user_id, status);

create trigger service_requests_set_updated_at
before update on public.service_requests
for each row execute function public.set_updated_at();
