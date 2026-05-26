create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

create type public.member_role as enum ('owner', 'admin', 'lawyer', 'staff', 'client', 'system');
create type public.member_status as enum ('invited', 'active', 'suspended', 'disabled');
create type public.case_stage as enum ('complaint', 'case', 'execution');
create type public.case_status as enum ('open', 'pending', 'closed', 'archived');
create type public.participant_type as enum ('client', 'opponent', 'lawyer', 'witness', 'expert', 'other');
create type public.document_classification as enum ('public', 'client_visible', 'confidential', 'privileged');
create type public.ai_job_status as enum ('queued', 'processing', 'completed', 'failed');
create type public.notification_channel as enum ('in_app', 'email', 'whatsapp', 'apns');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  default_locale text not null default 'ar-QA',
  default_currency char(3) not null default 'QAR',
  phone_country_code text not null default '+974',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  deleted_at timestamptz
);

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null,
  phone text,
  preferred_locale text not null default 'ar-QA',
  avatar_url text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.roles (
  name public.member_role primary key,
  description text not null
);

create table public.permissions (
  name text primary key,
  description text not null
);

create table public.role_permissions (
  role public.member_role not null references public.roles(name) on delete cascade,
  permission text not null references public.permissions(name) on delete cascade,
  primary key (role, permission)
);

create table public.account_memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role public.member_role not null,
  status public.member_status not null default 'invited',
  permissions text[] not null default '{}',
  invited_by uuid references public.users(id),
  invited_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz,
  unique (account_id, user_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid references public.users(id),
  full_name text not null,
  national_id text,
  email text,
  phone text,
  address text,
  client_number text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz,
  unique (account_id, client_number)
);

create table public.opponents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  full_name text not null,
  identity_number text,
  phone text,
  email text,
  notes text,
  conflict_key text generated always as (lower(coalesce(identity_number, '') || ':' || full_name)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

create table public.courts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  jurisdiction text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.prosecution_entities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_id uuid references public.clients(id),
  court_id uuid references public.courts(id),
  prosecution_entity_id uuid references public.prosecution_entities(id),
  case_number text,
  title text not null,
  description text,
  stage public.case_stage not null default 'complaint',
  status public.case_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  next_hearing_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz,
  unique (account_id, case_number)
);

create table public.case_participants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid references public.users(id),
  client_id uuid references public.clients(id),
  opponent_id uuid references public.opponents(id),
  participant_type public.participant_type not null,
  display_name text not null,
  role_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

create table public.case_timeline_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text,
  visible_to_client boolean not null default false,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

create table public.hearings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  court_id uuid references public.courts(id),
  hearing_at timestamptz not null,
  chamber text,
  agenda text,
  outcome text,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  title text not null,
  appointment_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  google_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  title text not null,
  description text,
  assignee_user_id uuid references public.users(id),
  priority text not null default 'medium',
  status text not null default 'open',
  due_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  title text not null,
  document_type text not null default 'general',
  classification public.document_classification not null default 'confidential',
  visible_to_client boolean not null default false,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null,
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256_hash text not null,
  extracted_text text,
  uploaded_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (document_id, version_number),
  unique (account_id, storage_path)
);

alter table public.documents
  add constraint documents_current_version_fk
  foreign key (current_version_id) references public.document_versions(id);

create table public.document_access_grants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  can_view boolean not null default true,
  can_download boolean not null default false,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  unique (document_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  sender_user_id uuid not null references public.users(id),
  body text not null,
  visible_to_client boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.client_updates (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  title text not null,
  body text not null,
  visible_to_client boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  case_id uuid references public.cases(id),
  invoice_number text,
  currency char(3) not null default 'QAR',
  total_amount numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  status text not null default 'draft',
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz,
  unique (account_id, invoice_number)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null,
  currency char(3) not null default 'QAR',
  paid_at timestamptz not null default now(),
  method text,
  reference text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  user_id uuid not null references public.users(id),
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_minutes integer,
  description text,
  billable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  channel public.notification_channel not null default 'in_app',
  title text not null,
  body text not null,
  target_type text,
  target_id uuid,
  read_at timestamptz,
  sent_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  platform text not null,
  token text not null,
  device_id text not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, user_id, device_id)
);

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_version_id uuid references public.document_versions(id) on delete cascade,
  job_type text not null,
  status public.ai_job_status not null default 'queued',
  requested_by uuid references public.users(id),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  created_at timestamptz not null default now(),
  unique (document_version_id, chunk_index)
);

create table public.document_embeddings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_chunk_id uuid not null references public.document_chunks(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  embedding vector(1536) not null,
  model text not null,
  created_at timestamptz not null default now()
);

create table public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  entity_type text not null,
  value text not null,
  confidence numeric(5,4),
  source_excerpt text,
  created_at timestamptz not null default now()
);

create table public.legal_articles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  law_name text,
  article_number text,
  source_excerpt text,
  confidence numeric(5,4),
  created_at timestamptz not null default now()
);

create table public.risk_findings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  document_version_id uuid references public.document_versions(id) on delete cascade,
  severity text not null,
  title text not null,
  description text not null,
  source_excerpt text,
  recommendation text,
  confidence numeric(5,4),
  created_at timestamptz not null default now()
);

create table public.ai_outputs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  document_version_id uuid references public.document_versions(id) on delete cascade,
  output_type text not null,
  prompt text,
  output jsonb not null,
  model text not null,
  latency_ms integer,
  cost_cents numeric(10,4),
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  actor_user_id uuid references public.users(id),
  actor_role public.member_role,
  action text not null,
  target_type text not null,
  target_id uuid,
  request_id text,
  ip_address inet,
  user_agent text,
  before_snapshot jsonb,
  after_snapshot jsonb,
  occurred_at timestamptz not null default now()
);

create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete cascade,
  status text not null,
  backup_path text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  retention_until timestamptz not null default (now() + interval '30 days'),
  metadata jsonb not null default '{}'
);

create or replace function public.current_account_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select account_id
  from public.account_memberships
  where user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
$$;

create or replace function public.current_role_for_account(target_account_id uuid)
returns public.member_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.account_memberships
  where user_id = auth.uid()
    and account_id = target_account_id
    and status = 'active'
    and deleted_at is null
  limit 1
$$;

create or replace function public.can_access_case(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cases c
    join public.account_memberships m on m.account_id = c.account_id
    where c.id = target_case_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.deleted_at is null
      and (
        m.role in ('owner', 'admin', 'lawyer', 'staff', 'system')
        or exists (
          select 1
          from public.case_participants cp
          where cp.case_id = c.id
            and cp.user_id = auth.uid()
            and cp.participant_type = 'client'
            and cp.deleted_at is null
        )
      )
  )
$$;

create or replace function public.prevent_last_owner_change()
returns trigger
language plpgsql
as $$
declare
  remaining_owners integer;
begin
  if old.role = 'owner' and (new.role <> 'owner' or new.status <> 'active' or new.deleted_at is not null) then
    select count(*) into remaining_owners
    from public.account_memberships
    where account_id = old.account_id
      and id <> old.id
      and role = 'owner'
      and status = 'active'
      and deleted_at is null;

    if remaining_owners = 0 then
      raise exception 'SOLE_ADMIN_LOCKDOWN: account must keep at least one active owner';
    end if;
  end if;

  if old.role = 'owner' and new.role = 'client' then
    raise exception 'SOLE_ADMIN_LOCKDOWN: owner cannot be converted to client';
  end if;

  return new;
end;
$$;

create trigger account_memberships_owner_lockdown
before update on public.account_memberships
for each row execute function public.prevent_last_owner_change();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts','users','account_memberships','clients','opponents','cases','case_participants',
    'case_timeline_events','hearings','appointments','tasks','documents','document_versions',
    'document_access_grants','messages','client_updates','invoices','invoice_items','payments',
    'time_entries','notifications','device_tokens','ai_jobs','document_chunks','document_embeddings',
    'legal_entities','legal_articles','risk_findings','ai_outputs','audit_logs','backup_runs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create policy users_self_or_same_account on public.users
for select using (
  id = auth.uid()
  or exists (
    select 1 from public.account_memberships m1
    join public.account_memberships m2 on m2.account_id = m1.account_id
    where m1.user_id = auth.uid()
      and m2.user_id = users.id
      and m1.status = 'active'
      and m2.status = 'active'
  )
);

create policy memberships_same_account on public.account_memberships
for select using (account_id in (select public.current_account_ids()));

create policy accounts_member_read on public.accounts
for select using (id in (select public.current_account_ids()));

create policy tenant_read_clients on public.clients
for select using (
  account_id in (select public.current_account_ids())
  and (public.current_role_for_account(account_id) <> 'client' or user_id = auth.uid())
);

create policy tenant_read_cases on public.cases
for select using (
  account_id in (select public.current_account_ids())
  and (public.current_role_for_account(account_id) <> 'client' or public.can_access_case(id))
);

create policy tenant_read_documents on public.documents
for select using (
  account_id in (select public.current_account_ids())
  and (
    public.current_role_for_account(account_id) <> 'client'
    or visible_to_client = true
    or exists (
      select 1 from public.document_access_grants g
      where g.document_id = documents.id
        and g.user_id = auth.uid()
        and g.can_view = true
        and (g.expires_at is null or g.expires_at > now())
    )
  )
);

create policy tenant_read_document_versions on public.document_versions
for select using (
  account_id in (select public.current_account_ids())
  and exists (select 1 from public.documents d where d.id = document_versions.document_id)
);

create policy tenant_read_timeline on public.case_timeline_events
for select using (
  account_id in (select public.current_account_ids())
  and (
    public.current_role_for_account(account_id) <> 'client'
    or (visible_to_client = true and public.can_access_case(case_id))
  )
);

create policy tenant_read_client_updates on public.client_updates
for select using (
  account_id in (select public.current_account_ids())
  and (
    public.current_role_for_account(account_id) <> 'client'
    or (visible_to_client = true and public.can_access_case(case_id))
  )
);

create policy tenant_read_notifications on public.notifications
for select using (account_id in (select public.current_account_ids()) and user_id = auth.uid());

create policy tenant_read_case_children on public.case_participants
for select using (account_id in (select public.current_account_ids()) and public.can_access_case(case_id));

create policy tenant_read_all_staff_tables on public.opponents
for select using (account_id in (select public.current_account_ids()) and public.current_role_for_account(account_id) <> 'client');
create policy tenant_read_hearings on public.hearings
for select using (account_id in (select public.current_account_ids()) and public.can_access_case(case_id));
create policy tenant_read_appointments on public.appointments
for select using (account_id in (select public.current_account_ids()) and (case_id is null or public.can_access_case(case_id)));
create policy tenant_read_tasks on public.tasks
for select using (account_id in (select public.current_account_ids()) and (public.current_role_for_account(account_id) <> 'client' or assignee_user_id = auth.uid()));
create policy tenant_read_messages on public.messages
for select using (account_id in (select public.current_account_ids()) and (case_id is null or public.can_access_case(case_id)));
create policy tenant_read_invoices on public.invoices
for select using (account_id in (select public.current_account_ids()) and public.current_role_for_account(account_id) <> 'client');
create policy tenant_read_invoice_items on public.invoice_items
for select using (account_id in (select public.current_account_ids()) and public.current_role_for_account(account_id) <> 'client');
create policy tenant_read_payments on public.payments
for select using (account_id in (select public.current_account_ids()) and public.current_role_for_account(account_id) <> 'client');
create policy tenant_read_time_entries on public.time_entries
for select using (account_id in (select public.current_account_ids()) and public.current_role_for_account(account_id) <> 'client');
create policy tenant_read_ai on public.ai_outputs
for select using (account_id in (select public.current_account_ids()) and public.current_role_for_account(account_id) <> 'client');

create policy service_insert_audit on public.audit_logs for insert with check (true);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts','account_memberships','clients','opponents','cases','case_participants',
    'case_timeline_events','hearings','appointments','tasks','documents','document_versions',
    'document_access_grants','messages','client_updates','invoices','invoice_items','payments',
    'time_entries','notifications','device_tokens','ai_jobs','document_chunks','document_embeddings',
    'legal_entities','legal_articles','risk_findings','ai_outputs','backup_runs'
  ]
  loop
    execute format(
      'create policy tenant_write_%I on public.%I for all using (account_id in (select public.current_account_ids()) and public.current_role_for_account(account_id) in (''owner'', ''admin'', ''lawyer'', ''staff'', ''system'')) with check (account_id in (select public.current_account_ids()) and public.current_role_for_account(account_id) in (''owner'', ''admin'', ''lawyer'', ''staff'', ''system''))',
      table_name,
      table_name
    );
  end loop;
end $$;

create index accounts_slug_idx on public.accounts(slug);
create index account_memberships_user_idx on public.account_memberships(user_id, status);
create index account_memberships_account_role_idx on public.account_memberships(account_id, role, status);
create index clients_account_created_idx on public.clients(account_id, created_at desc);
create index opponents_conflict_idx on public.opponents(account_id, conflict_key);
create index cases_account_status_idx on public.cases(account_id, status, updated_at desc);
create index cases_account_stage_idx on public.cases(account_id, stage, updated_at desc);
create index cases_client_idx on public.cases(account_id, client_id);
create index case_participants_case_idx on public.case_participants(account_id, case_id);
create index case_participants_user_idx on public.case_participants(account_id, user_id);
create index timeline_case_created_idx on public.case_timeline_events(account_id, case_id, created_at desc);
create index hearings_case_time_idx on public.hearings(account_id, case_id, hearing_at desc);
create index appointments_account_time_idx on public.appointments(account_id, starts_at desc);
create index tasks_account_status_idx on public.tasks(account_id, status, due_at);
create index documents_case_idx on public.documents(account_id, case_id, updated_at desc);
create index document_versions_document_idx on public.document_versions(document_id, version_number desc);
create index messages_case_created_idx on public.messages(account_id, case_id, created_at desc);
create index client_updates_case_idx on public.client_updates(account_id, case_id, created_at desc);
create index invoices_account_status_idx on public.invoices(account_id, status, issued_at desc);
create index notifications_user_created_idx on public.notifications(account_id, user_id, created_at desc);
create index audit_target_idx on public.audit_logs(account_id, target_type, target_id, occurred_at desc);
create index audit_actor_idx on public.audit_logs(account_id, actor_user_id, occurred_at desc);
create index document_chunks_text_idx on public.document_chunks using gin (to_tsvector('simple', content));
create index document_embeddings_account_idx on public.document_embeddings(account_id, document_version_id);
create index document_embeddings_vector_idx on public.document_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts','users','account_memberships','clients','opponents','courts','prosecution_entities','cases',
    'case_participants','hearings','appointments','tasks','documents','client_updates','invoices',
    'time_entries','device_tokens','ai_jobs'
  ]
  loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', table_name, table_name);
  end loop;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'legal-documents',
  'legal-documents',
  false,
  52428800,
  array['application/pdf','image/png','image/jpeg','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;
