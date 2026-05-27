alter type public.member_role add value if not exists 'super_admin';
alter type public.member_role add value if not exists 'office_owner';
alter type public.member_role add value if not exists 'trainee';
alter type public.member_role add value if not exists 'finance';
alter type public.member_role add value if not exists 'secretary';
alter type public.member_role add value if not exists 'client_portal';
alter type public.member_role add value if not exists 'external_collaborator';

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'matter_access_role'
  ) then
    create type public.matter_access_role as enum (
      'lead_counsel',
      'assigned_lawyer',
      'reviewer',
      'finance_access',
      'read_only',
      'restricted',
      'client_access'
    );
  end if;
end
$$;

alter type public.matter_access_role add value if not exists 'lead_counsel';
alter type public.matter_access_role add value if not exists 'assigned_lawyer';
alter type public.matter_access_role add value if not exists 'reviewer';
alter type public.matter_access_role add value if not exists 'finance_access';
alter type public.matter_access_role add value if not exists 'read_only';
alter type public.matter_access_role add value if not exists 'restricted';
alter type public.matter_access_role add value if not exists 'client_access';

create table if not exists public.matter_access_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  legal_matter_id uuid not null references public.legal_matters(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  access_role public.matter_access_role not null,
  allowed_actions text[] not null default '{}',
  can_view_confidential_documents boolean not null default true,
  billing_scope_only boolean not null default false,
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

create index if not exists matter_access_entries_user_idx
  on public.matter_access_entries(account_id, user_id, status, created_at desc);

create index if not exists matter_access_entries_matter_idx
  on public.matter_access_entries(account_id, legal_matter_id, status, created_at desc);

create unique index if not exists matter_access_entries_unique_active_idx
  on public.matter_access_entries(account_id, legal_matter_id, user_id)
  where deleted_at is null and status = 'active';

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'matter_access_entries_set_updated_at'
      and tgrelid = 'public.matter_access_entries'::regclass
  ) then
    create trigger matter_access_entries_set_updated_at
    before update on public.matter_access_entries
    for each row execute function public.set_updated_at();
  end if;
end
$$;

alter table public.matter_access_entries enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'matter_access_entries'
      and policyname = 'tenant_read_matter_access_entries'
  ) then
    create policy tenant_read_matter_access_entries on public.matter_access_entries
    for select using (
      account_id in (select public.current_account_ids())
      and (
        user_id = auth.uid()
        or public.current_role_for_account(account_id)::text in ('super_admin', 'office_owner', 'owner', 'admin', 'system')
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
      and tablename = 'matter_access_entries'
      and policyname = 'tenant_write_matter_access_entries'
  ) then
    create policy tenant_write_matter_access_entries on public.matter_access_entries
    for all using (
      account_id in (select public.current_account_ids())
      and public.current_role_for_account(account_id)::text in ('super_admin', 'office_owner', 'owner', 'admin', 'system')
    )
    with check (
      account_id in (select public.current_account_ids())
      and public.current_role_for_account(account_id)::text in ('super_admin', 'office_owner', 'owner', 'admin', 'system')
    );
  end if;
end
$$;

alter table public.matter_proceedings
  add column if not exists client_visible boolean;

update public.matter_proceedings
set client_visible = coalesce(client_visible, false)
where client_visible is null;

alter table public.matter_proceedings
  alter column client_visible set default false;

do $$
begin
  if not exists (select 1 from public.matter_proceedings where client_visible is null) then
    alter table public.matter_proceedings
      alter column client_visible set not null;
  end if;
end
$$;

create index if not exists matter_proceedings_client_visible_idx
  on public.matter_proceedings(account_id, legal_matter_id, client_visible, created_at desc);
