-- Corrective baseline migration for environments where migration history exists
-- but core account/auth tables are missing on the remote schema.
-- This migration is intentionally idempotent.

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'member_role'
  ) then
    create type public.member_role as enum ('owner', 'admin', 'lawyer', 'staff', 'client', 'system');
  end if;
end
$$;

alter type public.member_role add value if not exists 'owner';
alter type public.member_role add value if not exists 'admin';
alter type public.member_role add value if not exists 'lawyer';
alter type public.member_role add value if not exists 'staff';
alter type public.member_role add value if not exists 'client';
alter type public.member_role add value if not exists 'system';

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'member_status'
  ) then
    create type public.member_status as enum ('invited', 'active', 'suspended', 'disabled');
  end if;
end
$$;

alter type public.member_status add value if not exists 'invited';
alter type public.member_status add value if not exists 'active';
alter type public.member_status add value if not exists 'suspended';
alter type public.member_status add value if not exists 'disabled';

create table if not exists public.accounts (
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

create table if not exists public.users (
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

create table if not exists public.roles (
  name public.member_role primary key,
  description text not null
);

create table if not exists public.permissions (
  name text primary key,
  description text not null
);

create table if not exists public.role_permissions (
  role public.member_role not null references public.roles(name) on delete cascade,
  permission text not null references public.permissions(name) on delete cascade,
  primary key (role, permission)
);

create table if not exists public.account_memberships (
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

create index if not exists accounts_slug_idx on public.accounts(slug);
create index if not exists account_memberships_user_idx on public.account_memberships(user_id, status);
create index if not exists account_memberships_account_role_idx on public.account_memberships(account_id, role, status);

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

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'account_memberships_owner_lockdown'
      and tgrelid = 'public.account_memberships'::regclass
  ) then
    create trigger account_memberships_owner_lockdown
    before update on public.account_memberships
    for each row execute function public.prevent_last_owner_change();
  end if;
end
$$;

alter table public.users enable row level security;
alter table public.account_memberships enable row level security;
alter table public.accounts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'users' and policyname = 'users_self_or_same_account'
  ) then
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
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'account_memberships' and policyname = 'memberships_same_account'
  ) then
    create policy memberships_same_account on public.account_memberships
    for select using (account_id in (select public.current_account_ids()));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'accounts' and policyname = 'accounts_member_read'
  ) then
    create policy accounts_member_read on public.accounts
    for select using (id in (select public.current_account_ids()));
  end if;
end
$$;
