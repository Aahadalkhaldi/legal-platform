do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'matter_status'
  ) then
    create type public.matter_status as enum ('open', 'on_hold', 'closed', 'archived');
  end if;
end
$$;

alter type public.matter_status add value if not exists 'open';
alter type public.matter_status add value if not exists 'on_hold';
alter type public.matter_status add value if not exists 'closed';
alter type public.matter_status add value if not exists 'archived';

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'proceeding_stage'
  ) then
    create type public.proceeding_stage as enum (
      'first_instance',
      'appeal',
      'cassation',
      'execution',
      'urgent_request',
      'related_case'
    );
  end if;
end
$$;

alter type public.proceeding_stage add value if not exists 'first_instance';
alter type public.proceeding_stage add value if not exists 'appeal';
alter type public.proceeding_stage add value if not exists 'cassation';
alter type public.proceeding_stage add value if not exists 'execution';
alter type public.proceeding_stage add value if not exists 'urgent_request';
alter type public.proceeding_stage add value if not exists 'related_case';

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'proceeding_status'
  ) then
    create type public.proceeding_status as enum ('open', 'pending', 'on_hold', 'closed', 'archived');
  end if;
end
$$;

alter type public.proceeding_status add value if not exists 'open';
alter type public.proceeding_status add value if not exists 'pending';
alter type public.proceeding_status add value if not exists 'on_hold';
alter type public.proceeding_status add value if not exists 'closed';
alter type public.proceeding_status add value if not exists 'archived';

create table if not exists public.legal_matters (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_id uuid references public.clients(id) on delete set null,
  lead_lawyer_user_id uuid references public.users(id) on delete set null,
  matter_number text,
  title text not null,
  description text,
  status public.matter_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz,
  unique (account_id, matter_number)
);

create table if not exists public.matter_proceedings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  legal_matter_id uuid not null references public.legal_matters(id) on delete cascade,
  parent_proceeding_id uuid references public.matter_proceedings(id) on delete set null,
  linked_case_id uuid references public.cases(id) on delete set null,
  stage public.proceeding_stage not null,
  status public.proceeding_status not null default 'open',
  case_number text,
  court_id uuid references public.courts(id) on delete set null,
  department text,
  filing_date timestamptz,
  closed_at timestamptz,
  next_deadline_at timestamptz,
  fees_amount numeric(12,2) not null default 0,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

create index if not exists legal_matters_account_status_idx
  on public.legal_matters(account_id, status, updated_at desc);
create index if not exists legal_matters_client_idx
  on public.legal_matters(account_id, client_id, updated_at desc);
create index if not exists matter_proceedings_matter_stage_idx
  on public.matter_proceedings(legal_matter_id, stage, created_at desc);
create index if not exists matter_proceedings_account_status_idx
  on public.matter_proceedings(account_id, status, updated_at desc);
create index if not exists matter_proceedings_parent_idx
  on public.matter_proceedings(parent_proceeding_id);
create unique index if not exists matter_proceedings_parent_stage_unique_idx
  on public.matter_proceedings(account_id, parent_proceeding_id, stage)
  where parent_proceeding_id is not null and deleted_at is null;

alter table public.hearings add column if not exists matter_proceeding_id uuid references public.matter_proceedings(id) on delete set null;
alter table public.documents add column if not exists matter_proceeding_id uuid references public.matter_proceedings(id) on delete set null;
alter table public.tasks add column if not exists matter_proceeding_id uuid references public.matter_proceedings(id) on delete set null;
alter table public.client_updates add column if not exists matter_proceeding_id uuid references public.matter_proceedings(id) on delete set null;
alter table public.case_participants add column if not exists matter_proceeding_id uuid references public.matter_proceedings(id) on delete set null;
alter table public.invoices add column if not exists matter_proceeding_id uuid references public.matter_proceedings(id) on delete set null;
alter table public.appointments add column if not exists matter_proceeding_id uuid references public.matter_proceedings(id) on delete set null;
alter table public.case_timeline_events add column if not exists matter_proceeding_id uuid references public.matter_proceedings(id) on delete set null;

create index if not exists hearings_proceeding_idx on public.hearings(matter_proceeding_id, hearing_at desc);
create index if not exists documents_proceeding_idx on public.documents(matter_proceeding_id, updated_at desc);
create index if not exists tasks_proceeding_idx on public.tasks(matter_proceeding_id, due_at);
create index if not exists client_updates_proceeding_idx on public.client_updates(matter_proceeding_id, created_at desc);
create index if not exists case_participants_proceeding_idx on public.case_participants(matter_proceeding_id, created_at desc);
create index if not exists invoices_proceeding_idx on public.invoices(matter_proceeding_id, issued_at desc);
create index if not exists appointments_proceeding_idx on public.appointments(matter_proceeding_id, starts_at desc);
create index if not exists case_timeline_events_proceeding_idx on public.case_timeline_events(matter_proceeding_id, created_at desc);

alter table public.legal_matters enable row level security;
alter table public.matter_proceedings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'legal_matters'
      and policyname = 'tenant_read_legal_matters'
  ) then
    create policy tenant_read_legal_matters on public.legal_matters
    for select using (
      account_id in (select public.current_account_ids())
      and (
        public.current_role_for_account(account_id) <> 'client'
        or exists (
          select 1
          from public.clients c
          where c.id = legal_matters.client_id
            and c.user_id = auth.uid()
            and c.account_id = legal_matters.account_id
            and c.deleted_at is null
        )
      )
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'legal_matters'
      and policyname = 'tenant_write_legal_matters'
  ) then
    create policy tenant_write_legal_matters on public.legal_matters
    for all using (
      account_id in (select public.current_account_ids())
      and public.current_role_for_account(account_id) in ('owner', 'admin', 'lawyer', 'staff', 'system')
    )
    with check (
      account_id in (select public.current_account_ids())
      and public.current_role_for_account(account_id) in ('owner', 'admin', 'lawyer', 'staff', 'system')
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'matter_proceedings'
      and policyname = 'tenant_read_matter_proceedings'
  ) then
    create policy tenant_read_matter_proceedings on public.matter_proceedings
    for select using (
      account_id in (select public.current_account_ids())
      and (
        public.current_role_for_account(account_id) <> 'client'
        or exists (
          select 1
          from public.legal_matters lm
          join public.clients c on c.id = lm.client_id
          where lm.id = matter_proceedings.legal_matter_id
            and lm.account_id = matter_proceedings.account_id
            and c.user_id = auth.uid()
            and c.deleted_at is null
        )
      )
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'matter_proceedings'
      and policyname = 'tenant_write_matter_proceedings'
  ) then
    create policy tenant_write_matter_proceedings on public.matter_proceedings
    for all using (
      account_id in (select public.current_account_ids())
      and public.current_role_for_account(account_id) in ('owner', 'admin', 'lawyer', 'staff', 'system')
    )
    with check (
      account_id in (select public.current_account_ids())
      and public.current_role_for_account(account_id) in ('owner', 'admin', 'lawyer', 'staff', 'system')
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'legal_matters_set_updated_at'
      and tgrelid = 'public.legal_matters'::regclass
  ) then
    create trigger legal_matters_set_updated_at
    before update on public.legal_matters
    for each row execute function public.set_updated_at();
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'matter_proceedings_set_updated_at'
      and tgrelid = 'public.matter_proceedings'::regclass
  ) then
    create trigger matter_proceedings_set_updated_at
    before update on public.matter_proceedings
    for each row execute function public.set_updated_at();
  end if;
end
$$;
