-- Portal MVP schema guard repair (idempotent)
-- Run this manually in Supabase SQL Editor only if portal APIs fail on missing schema.

create extension if not exists pgcrypto;

alter table public.legal_matters
  add column if not exists client_id uuid;

create index if not exists legal_matters_account_client_updated_idx
  on public.legal_matters(account_id, client_id, updated_at desc);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid,
  full_name text not null,
  email text,
  phone text,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.clients add column if not exists account_id uuid;
alter table public.clients add column if not exists user_id uuid;
alter table public.clients add column if not exists full_name text;
alter table public.clients add column if not exists email text;
alter table public.clients add column if not exists phone text;
alter table public.clients add column if not exists status text;
alter table public.clients add column if not exists metadata jsonb;
alter table public.clients add column if not exists created_at timestamptz;
alter table public.clients add column if not exists updated_at timestamptz;
alter table public.clients add column if not exists deleted_at timestamptz;

update public.clients
set
  status = coalesce(nullif(status, ''), 'active'),
  metadata = coalesce(metadata, '{}'::jsonb),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

alter table public.clients alter column status set default 'active';
alter table public.clients alter column metadata set default '{}'::jsonb;
alter table public.clients alter column created_at set default now();
alter table public.clients alter column updated_at set default now();

create index if not exists clients_account_user_idx
  on public.clients(account_id, user_id)
  where deleted_at is null;
create index if not exists clients_account_status_idx
  on public.clients(account_id, status, updated_at desc)
  where deleted_at is null;

create table if not exists public.matter_access_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  legal_matter_id uuid not null references public.legal_matters(id) on delete cascade,
  user_id uuid not null,
  access_role text not null default 'assigned_lawyer',
  allowed_actions text[] not null default '{}'::text[],
  can_view_confidential_documents boolean not null default false,
  billing_scope_only boolean not null default false,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (account_id, legal_matter_id, user_id)
);

alter table public.matter_access_entries add column if not exists account_id uuid;
alter table public.matter_access_entries add column if not exists legal_matter_id uuid;
alter table public.matter_access_entries add column if not exists user_id uuid;
alter table public.matter_access_entries add column if not exists access_role text;
alter table public.matter_access_entries add column if not exists allowed_actions text[];
alter table public.matter_access_entries add column if not exists can_view_confidential_documents boolean;
alter table public.matter_access_entries add column if not exists billing_scope_only boolean;
alter table public.matter_access_entries add column if not exists status text;
alter table public.matter_access_entries add column if not exists created_at timestamptz;
alter table public.matter_access_entries add column if not exists updated_at timestamptz;
alter table public.matter_access_entries add column if not exists deleted_at timestamptz;

update public.matter_access_entries
set
  access_role = coalesce(nullif(access_role, ''), 'assigned_lawyer'),
  allowed_actions = coalesce(allowed_actions, '{}'::text[]),
  can_view_confidential_documents = coalesce(can_view_confidential_documents, false),
  billing_scope_only = coalesce(billing_scope_only, false),
  status = coalesce(nullif(status, ''), 'active'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

alter table public.matter_access_entries alter column access_role set default 'assigned_lawyer';
alter table public.matter_access_entries alter column allowed_actions set default '{}'::text[];
alter table public.matter_access_entries alter column can_view_confidential_documents set default false;
alter table public.matter_access_entries alter column billing_scope_only set default false;
alter table public.matter_access_entries alter column status set default 'active';
alter table public.matter_access_entries alter column created_at set default now();
alter table public.matter_access_entries alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.matter_access_entries'::regclass
      and conname = 'matter_access_entries_access_role_check'
  ) then
    alter table public.matter_access_entries
      add constraint matter_access_entries_access_role_check
      check (
        access_role in (
          'lead_counsel',
          'assigned_lawyer',
          'reviewer',
          'finance_access',
          'read_only',
          'restricted',
          'client_access'
        )
      );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.matter_access_entries'::regclass
      and conname = 'matter_access_entries_status_check'
  ) then
    alter table public.matter_access_entries
      add constraint matter_access_entries_status_check
      check (status in ('active', 'inactive', 'revoked'));
  end if;
end
$$;

create index if not exists matter_access_entries_lookup_idx
  on public.matter_access_entries(account_id, user_id, status, legal_matter_id)
  where deleted_at is null;
create index if not exists matter_access_entries_client_access_idx
  on public.matter_access_entries(account_id, user_id, access_role, legal_matter_id)
  where deleted_at is null;

alter table public.matter_proceedings add column if not exists client_visible boolean;
update public.matter_proceedings
set client_visible = coalesce(client_visible, false)
where client_visible is null;
alter table public.matter_proceedings alter column client_visible set default false;

create index if not exists matter_proceedings_client_visible_idx
  on public.matter_proceedings(account_id, legal_matter_id, client_visible, created_at desc)
  where deleted_at is null;

do $$
begin
  if exists (select 1 from pg_proc where proname = 'set_updated_at') then
    if not exists (
      select 1 from pg_trigger
      where tgname = 'clients_set_updated_at'
        and tgrelid = 'public.clients'::regclass
    ) then
      create trigger clients_set_updated_at
      before update on public.clients
      for each row execute function public.set_updated_at();
    end if;

    if not exists (
      select 1 from pg_trigger
      where tgname = 'matter_access_entries_set_updated_at'
        and tgrelid = 'public.matter_access_entries'::regclass
    ) then
      create trigger matter_access_entries_set_updated_at
      before update on public.matter_access_entries
      for each row execute function public.set_updated_at();
    end if;
  end if;
end
$$;
