-- Corrective migration for environments where public.clients is missing
-- or partially defined. Run before legal matter lifecycle migration.
-- This migration is intentionally idempotent.

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid references public.users(id),
  full_name text not null default 'Unknown Client',
  display_name text,
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

alter table public.clients add column if not exists account_id uuid;
alter table public.clients add column if not exists user_id uuid;
alter table public.clients add column if not exists full_name text;
alter table public.clients add column if not exists display_name text;
alter table public.clients add column if not exists national_id text;
alter table public.clients add column if not exists email text;
alter table public.clients add column if not exists phone text;
alter table public.clients add column if not exists address text;
alter table public.clients add column if not exists client_number text;
alter table public.clients add column if not exists status text;
alter table public.clients add column if not exists created_at timestamptz;
alter table public.clients add column if not exists updated_at timestamptz;
alter table public.clients add column if not exists created_by uuid;
alter table public.clients add column if not exists updated_by uuid;
alter table public.clients add column if not exists deleted_at timestamptz;

update public.clients
set full_name = coalesce(full_name, display_name, 'Unknown Client')
where full_name is null;

update public.clients
set display_name = coalesce(display_name, full_name)
where display_name is null;

update public.clients
set status = coalesce(status, 'active')
where status is null;

update public.clients
set created_at = coalesce(created_at, now())
where created_at is null;

update public.clients
set updated_at = coalesce(updated_at, now())
where updated_at is null;

alter table public.clients alter column id set default gen_random_uuid();
alter table public.clients alter column full_name set default 'Unknown Client';
alter table public.clients alter column status set default 'active';
alter table public.clients alter column created_at set default now();
alter table public.clients alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.clients'::regclass
      and contype = 'f'
      and confrelid = 'public.accounts'::regclass
  ) then
    alter table public.clients
      add constraint clients_account_id_fkey
      foreign key (account_id) references public.accounts(id) on delete cascade;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.clients'::regclass
      and contype = 'f'
      and conname = 'clients_user_id_fkey'
  ) then
    alter table public.clients
      add constraint clients_user_id_fkey
      foreign key (user_id) references public.users(id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.clients'::regclass
      and contype = 'f'
      and conname = 'clients_created_by_fkey'
  ) then
    alter table public.clients
      add constraint clients_created_by_fkey
      foreign key (created_by) references public.users(id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.clients'::regclass
      and contype = 'f'
      and conname = 'clients_updated_by_fkey'
  ) then
    alter table public.clients
      add constraint clients_updated_by_fkey
      foreign key (updated_by) references public.users(id);
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from public.clients where account_id is null) then
    alter table public.clients alter column account_id set not null;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from public.clients where full_name is null) then
    alter table public.clients alter column full_name set not null;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from public.clients where status is null) then
    alter table public.clients alter column status set not null;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from public.clients where created_at is null) then
    alter table public.clients alter column created_at set not null;
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from public.clients where updated_at is null) then
    alter table public.clients alter column updated_at set not null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'clients'
      and indexname = 'clients_account_created_idx'
  ) then
    create index clients_account_created_idx on public.clients(account_id, created_at desc);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'clients'
      and indexname = 'clients_account_user_idx'
  ) then
    create index clients_account_user_idx on public.clients(account_id, user_id);
  end if;
end
$$;

alter table public.clients enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'clients'
      and policyname = 'tenant_read_clients'
  ) then
    create policy tenant_read_clients on public.clients
    for select using (
      account_id in (select public.current_account_ids())
      and (
        public.current_role_for_account(account_id) <> 'client'
        or user_id = auth.uid()
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
      and tablename = 'clients'
      and policyname = 'tenant_write_clients'
  ) then
    create policy tenant_write_clients on public.clients
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
    where tgname = 'clients_set_updated_at'
      and tgrelid = 'public.clients'::regclass
  ) then
    create trigger clients_set_updated_at
    before update on public.clients
    for each row execute function public.set_updated_at();
  end if;
end
$$;
