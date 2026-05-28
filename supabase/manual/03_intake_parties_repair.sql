-- Intake MVP parties repair (idempotent)
-- Purpose:
-- 1) Ensure public.opponents exists for the current intake API.
-- 2) Add structured party columns required by intake (party_type, legal_capacity, legal_matter_id, etc.).
-- 3) Keep account-scoped multi-tenant behavior and avoid destructive changes.

create extension if not exists pgcrypto;

create table if not exists public.opponents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  legal_matter_id uuid references public.legal_matters(id) on delete set null,
  full_name text not null,
  party_name text,
  party_type text not null default 'other',
  legal_capacity text not null default 'related_party',
  identity_number text,
  registration_number text,
  contact_person text,
  phone text,
  email text,
  address text,
  notes text,
  conflict_key text generated always as (
    lower(coalesce(identity_number, registration_number, '') || ':' || coalesce(party_name, full_name, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

alter table public.opponents add column if not exists legal_matter_id uuid;
alter table public.opponents add column if not exists party_name text;
alter table public.opponents add column if not exists party_type text;
alter table public.opponents add column if not exists legal_capacity text;
alter table public.opponents add column if not exists registration_number text;
alter table public.opponents add column if not exists contact_person text;
alter table public.opponents add column if not exists address text;
alter table public.opponents add column if not exists created_at timestamptz;
alter table public.opponents add column if not exists updated_at timestamptz;
alter table public.opponents add column if not exists created_by uuid;
alter table public.opponents add column if not exists updated_by uuid;
alter table public.opponents add column if not exists deleted_at timestamptz;

update public.opponents
set
  party_name = coalesce(nullif(party_name, ''), full_name),
  party_type = coalesce(nullif(party_type, ''), 'other'),
  legal_capacity = coalesce(nullif(legal_capacity, ''), 'related_party'),
  created_at = coalesce(created_at, now()),
  updated_at = coalesce(updated_at, now())
where true;

alter table public.opponents alter column party_type set default 'other';
alter table public.opponents alter column legal_capacity set default 'related_party';
alter table public.opponents alter column created_at set default now();
alter table public.opponents alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.opponents'::regclass
      and conname = 'opponents_legal_matter_id_fkey'
  ) then
    alter table public.opponents
      add constraint opponents_legal_matter_id_fkey
      foreign key (legal_matter_id) references public.legal_matters(id) on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.opponents'::regclass
      and conname = 'opponents_party_type_check'
  ) then
    alter table public.opponents
      add constraint opponents_party_type_check
      check (
        party_type in (
          'natural_person',
          'company',
          'establishment',
          'government_entity',
          'ministry',
          'public_authority',
          'public_prosecution',
          'police',
          'prosecution_authority',
          'bank',
          'insurance_company',
          'association',
          'heirs',
          'other'
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
    where conrelid = 'public.opponents'::regclass
      and conname = 'opponents_legal_capacity_check'
  ) then
    alter table public.opponents
      add constraint opponents_legal_capacity_check
      check (
        legal_capacity in (
          'claimant',
          'defendant',
          'complainant',
          'accused',
          'respondent',
          'beneficiary',
          'guarantor',
          'witness',
          'related_party',
          'prosecution_authority'
        )
      );
  end if;
end
$$;

create index if not exists opponents_account_legal_matter_idx
  on public.opponents(account_id, legal_matter_id, created_at desc);
create index if not exists opponents_account_party_type_idx
  on public.opponents(account_id, party_type);
create index if not exists opponents_account_legal_capacity_idx
  on public.opponents(account_id, legal_capacity);
create index if not exists opponents_conflict_idx
  on public.opponents(account_id, conflict_key);

alter table public.opponents enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'opponents'
      and policyname = 'tenant_read_opponents'
  ) then
    create policy tenant_read_opponents on public.opponents
    for select using (
      account_id in (select public.current_account_ids())
      and public.current_role_for_account(account_id) <> 'client'
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
      and tablename = 'opponents'
      and policyname = 'tenant_write_opponents'
  ) then
    create policy tenant_write_opponents on public.opponents
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
  if exists (
    select 1 from pg_proc where proname = 'set_updated_at'
  ) and not exists (
    select 1 from pg_trigger
    where tgname = 'opponents_set_updated_at'
      and tgrelid = 'public.opponents'::regclass
  ) then
    create trigger opponents_set_updated_at
    before update on public.opponents
    for each row execute function public.set_updated_at();
  end if;
end
$$;
