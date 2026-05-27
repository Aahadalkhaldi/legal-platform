alter type public.member_role add value if not exists 'super_admin';
alter type public.member_role add value if not exists 'office_owner';
alter type public.member_role add value if not exists 'trainee';
alter type public.member_role add value if not exists 'finance';
alter type public.member_role add value if not exists 'secretary';
alter type public.member_role add value if not exists 'client_portal';
alter type public.member_role add value if not exists 'external_collaborator';

insert into public.roles (name, description) values
  ('super_admin', 'Platform-level super administrator across offices.'),
  ('office_owner', 'Office owner with full governance controls.'),
  ('admin', 'Administrative manager for legal office operations.'),
  ('lawyer', 'Lawyer role with full legal workflow actions.'),
  ('trainee', 'Trainee role with supervised and non-confidential scope.'),
  ('finance', 'Finance role restricted to billing operations.'),
  ('secretary', 'Secretary role for scheduling, notifications, and support actions.'),
  ('client_portal', 'Client portal role with explicit-share access only.'),
  ('external_collaborator', 'External collaborator role with limited case visibility.'),
  ('owner', 'Legacy owner role mapped to office owner behavior.'),
  ('staff', 'Legacy staff role mapped to secretary behavior.'),
  ('client', 'Legacy client role mapped to client portal behavior.'),
  ('system', 'Service/system role for automation and background workflows.')
on conflict (name) do update set description = excluded.description;

insert into public.permissions (name, description) values
  ('create_proceeding', 'Create proceedings under a legal matter.'),
  ('create_appeal', 'Create appeal proceeding from first instance.'),
  ('create_cassation', 'Create cassation proceeding from appeal.'),
  ('open_execution', 'Open execution proceeding.'),
  ('upload_document', 'Upload or add document records and versions.'),
  ('approve_document', 'Approve/review legal documents.'),
  ('assign_users', 'Assign users to legal matters and workflows.'),
  ('close_matter', 'Close a legal matter.'),
  ('manage_billing', 'Manage invoices and billing operations.'),
  ('export_case', 'Export legal case/matter data.'),
  ('manage_clients', 'Manage clients and matter intake assignment.'),
  ('run_conflict_check', 'Run legal conflict checks.'),
  ('manage_hearings', 'Manage hearings and scheduling.'),
  ('manage_notifications', 'Manage timeline/client notifications.'),
  ('manage_users', 'Manage office users and role assignments.'),
  ('ai_privileged_actions', 'Run privileged AI legal analysis actions.')
on conflict (name) do update set description = excluded.description;

insert into public.role_permissions (role, permission)
select role_name::public.member_role, permission_name
from (
  values
    ('super_admin', 'create_proceeding'),
    ('super_admin', 'create_appeal'),
    ('super_admin', 'create_cassation'),
    ('super_admin', 'open_execution'),
    ('super_admin', 'upload_document'),
    ('super_admin', 'approve_document'),
    ('super_admin', 'assign_users'),
    ('super_admin', 'close_matter'),
    ('super_admin', 'manage_billing'),
    ('super_admin', 'export_case'),
    ('super_admin', 'manage_clients'),
    ('super_admin', 'run_conflict_check'),
    ('super_admin', 'manage_hearings'),
    ('super_admin', 'manage_notifications'),
    ('super_admin', 'manage_users'),
    ('super_admin', 'ai_privileged_actions'),

    ('office_owner', 'create_proceeding'),
    ('office_owner', 'create_appeal'),
    ('office_owner', 'create_cassation'),
    ('office_owner', 'open_execution'),
    ('office_owner', 'upload_document'),
    ('office_owner', 'approve_document'),
    ('office_owner', 'assign_users'),
    ('office_owner', 'close_matter'),
    ('office_owner', 'manage_billing'),
    ('office_owner', 'export_case'),
    ('office_owner', 'manage_clients'),
    ('office_owner', 'run_conflict_check'),
    ('office_owner', 'manage_hearings'),
    ('office_owner', 'manage_notifications'),
    ('office_owner', 'manage_users'),
    ('office_owner', 'ai_privileged_actions'),

    ('admin', 'create_proceeding'),
    ('admin', 'create_appeal'),
    ('admin', 'create_cassation'),
    ('admin', 'open_execution'),
    ('admin', 'upload_document'),
    ('admin', 'approve_document'),
    ('admin', 'assign_users'),
    ('admin', 'close_matter'),
    ('admin', 'manage_billing'),
    ('admin', 'export_case'),
    ('admin', 'manage_clients'),
    ('admin', 'run_conflict_check'),
    ('admin', 'manage_hearings'),
    ('admin', 'manage_notifications'),
    ('admin', 'manage_users'),
    ('admin', 'ai_privileged_actions'),

    ('lawyer', 'create_proceeding'),
    ('lawyer', 'create_appeal'),
    ('lawyer', 'create_cassation'),
    ('lawyer', 'open_execution'),
    ('lawyer', 'upload_document'),
    ('lawyer', 'approve_document'),
    ('lawyer', 'assign_users'),
    ('lawyer', 'close_matter'),
    ('lawyer', 'export_case'),
    ('lawyer', 'manage_clients'),
    ('lawyer', 'run_conflict_check'),
    ('lawyer', 'manage_hearings'),
    ('lawyer', 'manage_notifications'),
    ('lawyer', 'ai_privileged_actions'),

    ('trainee', 'create_proceeding'),
    ('trainee', 'upload_document'),
    ('trainee', 'export_case'),
    ('trainee', 'run_conflict_check'),
    ('trainee', 'manage_hearings'),
    ('trainee', 'manage_notifications'),

    ('finance', 'manage_billing'),
    ('finance', 'export_case'),

    ('secretary', 'create_proceeding'),
    ('secretary', 'upload_document'),
    ('secretary', 'manage_hearings'),
    ('secretary', 'manage_notifications'),
    ('secretary', 'export_case'),

    ('client_portal', 'upload_document'),

    ('external_collaborator', 'export_case'),
    ('external_collaborator', 'run_conflict_check'),

    ('system', 'create_proceeding'),
    ('system', 'create_appeal'),
    ('system', 'create_cassation'),
    ('system', 'open_execution'),
    ('system', 'upload_document'),
    ('system', 'approve_document'),
    ('system', 'assign_users'),
    ('system', 'close_matter'),
    ('system', 'manage_billing'),
    ('system', 'export_case'),
    ('system', 'manage_clients'),
    ('system', 'run_conflict_check'),
    ('system', 'manage_hearings'),
    ('system', 'manage_notifications'),
    ('system', 'manage_users'),
    ('system', 'ai_privileged_actions'),

    ('owner', 'create_proceeding'),
    ('owner', 'create_appeal'),
    ('owner', 'create_cassation'),
    ('owner', 'open_execution'),
    ('owner', 'upload_document'),
    ('owner', 'approve_document'),
    ('owner', 'assign_users'),
    ('owner', 'close_matter'),
    ('owner', 'manage_billing'),
    ('owner', 'export_case'),
    ('owner', 'manage_clients'),
    ('owner', 'run_conflict_check'),
    ('owner', 'manage_hearings'),
    ('owner', 'manage_notifications'),
    ('owner', 'manage_users'),
    ('owner', 'ai_privileged_actions'),

    ('staff', 'create_proceeding'),
    ('staff', 'upload_document'),
    ('staff', 'manage_hearings'),
    ('staff', 'manage_notifications'),
    ('staff', 'export_case'),

    ('client', 'upload_document')
) as grants(role_name, permission_name)
on conflict do nothing;

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
        or public.current_role_for_account(account_id) in ('super_admin', 'office_owner', 'owner', 'admin', 'system')
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
      and public.current_role_for_account(account_id) in ('super_admin', 'office_owner', 'owner', 'admin', 'system')
    )
    with check (
      account_id in (select public.current_account_ids())
      and public.current_role_for_account(account_id) in ('super_admin', 'office_owner', 'owner', 'admin', 'system')
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
