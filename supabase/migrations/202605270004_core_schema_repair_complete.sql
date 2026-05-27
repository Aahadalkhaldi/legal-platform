-- Comprehensive corrective migration for remote schema drift.
-- Purpose: ensure core tables/functions/policies exist before running
-- 202605270003_legal_matter_lifecycle_foundation.sql.
-- This migration is intentionally idempotent and does not drop data.

create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists "vector";

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

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'case_stage'
  ) then
    create type public.case_stage as enum ('complaint', 'case', 'execution');
  end if;
end
$$;

alter type public.case_stage add value if not exists 'complaint';
alter type public.case_stage add value if not exists 'case';
alter type public.case_stage add value if not exists 'execution';

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'case_status'
  ) then
    create type public.case_status as enum ('open', 'pending', 'closed', 'archived');
  end if;
end
$$;

alter type public.case_status add value if not exists 'open';
alter type public.case_status add value if not exists 'pending';
alter type public.case_status add value if not exists 'closed';
alter type public.case_status add value if not exists 'archived';

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'participant_type'
  ) then
    create type public.participant_type as enum ('client', 'opponent', 'lawyer', 'witness', 'expert', 'other');
  end if;
end
$$;

alter type public.participant_type add value if not exists 'client';
alter type public.participant_type add value if not exists 'opponent';
alter type public.participant_type add value if not exists 'lawyer';
alter type public.participant_type add value if not exists 'witness';
alter type public.participant_type add value if not exists 'expert';
alter type public.participant_type add value if not exists 'other';

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'document_classification'
  ) then
    create type public.document_classification as enum ('public', 'client_visible', 'confidential', 'privileged');
  end if;
end
$$;

alter type public.document_classification add value if not exists 'public';
alter type public.document_classification add value if not exists 'client_visible';
alter type public.document_classification add value if not exists 'confidential';
alter type public.document_classification add value if not exists 'privileged';

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'notification_channel'
  ) then
    create type public.notification_channel as enum ('in_app', 'email', 'whatsapp', 'apns');
  end if;
end
$$;

alter type public.notification_channel add value if not exists 'in_app';
alter type public.notification_channel add value if not exists 'email';
alter type public.notification_channel add value if not exists 'whatsapp';
alter type public.notification_channel add value if not exists 'apns';

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

alter table public.accounts add column if not exists name text;
alter table public.accounts add column if not exists slug text;
alter table public.accounts add column if not exists default_locale text;
alter table public.accounts add column if not exists default_currency char(3);
alter table public.accounts add column if not exists phone_country_code text;
alter table public.accounts add column if not exists status text;
alter table public.accounts add column if not exists created_at timestamptz;
alter table public.accounts add column if not exists updated_at timestamptz;
alter table public.accounts add column if not exists created_by uuid;
alter table public.accounts add column if not exists updated_by uuid;
alter table public.accounts add column if not exists deleted_at timestamptz;

update public.accounts set name = coalesce(name, 'Unknown Account') where name is null;
update public.accounts set slug = coalesce(slug, 'account-' || id::text) where slug is null;
update public.accounts set default_locale = coalesce(default_locale, 'ar-QA') where default_locale is null;
update public.accounts set default_currency = coalesce(default_currency, 'QAR') where default_currency is null;
update public.accounts set phone_country_code = coalesce(phone_country_code, '+974') where phone_country_code is null;
update public.accounts set status = coalesce(status, 'active') where status is null;
update public.accounts set created_at = coalesce(created_at, now()) where created_at is null;
update public.accounts set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.accounts alter column id set default gen_random_uuid();
alter table public.accounts alter column default_locale set default 'ar-QA';
alter table public.accounts alter column default_currency set default 'QAR';
alter table public.accounts alter column phone_country_code set default '+974';
alter table public.accounts alter column status set default 'active';
alter table public.accounts alter column created_at set default now();
alter table public.accounts alter column updated_at set default now();

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

alter table public.users add column if not exists email text;
alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists phone text;
alter table public.users add column if not exists preferred_locale text;
alter table public.users add column if not exists avatar_url text;
alter table public.users add column if not exists last_seen_at timestamptz;
alter table public.users add column if not exists created_at timestamptz;
alter table public.users add column if not exists updated_at timestamptz;

update public.users set full_name = coalesce(full_name, email, 'Unknown User') where full_name is null;
update public.users set preferred_locale = coalesce(preferred_locale, 'ar-QA') where preferred_locale is null;
update public.users set created_at = coalesce(created_at, now()) where created_at is null;
update public.users set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.users alter column preferred_locale set default 'ar-QA';
alter table public.users alter column created_at set default now();
alter table public.users alter column updated_at set default now();

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

alter table public.account_memberships add column if not exists account_id uuid;
alter table public.account_memberships add column if not exists user_id uuid;
alter table public.account_memberships add column if not exists role public.member_role;
alter table public.account_memberships add column if not exists status public.member_status;
alter table public.account_memberships add column if not exists permissions text[];
alter table public.account_memberships add column if not exists invited_by uuid;
alter table public.account_memberships add column if not exists invited_at timestamptz;
alter table public.account_memberships add column if not exists accepted_at timestamptz;
alter table public.account_memberships add column if not exists created_at timestamptz;
alter table public.account_memberships add column if not exists updated_at timestamptz;
alter table public.account_memberships add column if not exists created_by uuid;
alter table public.account_memberships add column if not exists updated_by uuid;
alter table public.account_memberships add column if not exists deleted_at timestamptz;

update public.account_memberships set status = coalesce(status, 'active') where status is null;
update public.account_memberships set permissions = coalesce(permissions, '{}') where permissions is null;
update public.account_memberships set created_at = coalesce(created_at, now()) where created_at is null;
update public.account_memberships set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.account_memberships alter column id set default gen_random_uuid();
alter table public.account_memberships alter column status set default 'invited';
alter table public.account_memberships alter column permissions set default '{}';
alter table public.account_memberships alter column created_at set default now();
alter table public.account_memberships alter column updated_at set default now();

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

create table if not exists public.courts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_ar text not null,
  name_en text not null,
  jurisdiction text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.courts add column if not exists code text;
alter table public.courts add column if not exists name_ar text;
alter table public.courts add column if not exists name_en text;
alter table public.courts add column if not exists jurisdiction text;
alter table public.courts add column if not exists active boolean;
alter table public.courts add column if not exists created_at timestamptz;
alter table public.courts add column if not exists updated_at timestamptz;

update public.courts set code = coalesce(code, 'COURT-' || id::text) where code is null;
update public.courts set name_ar = coalesce(name_ar, 'Court') where name_ar is null;
update public.courts set name_en = coalesce(name_en, 'Court') where name_en is null;
update public.courts set active = coalesce(active, true) where active is null;
update public.courts set created_at = coalesce(created_at, now()) where created_at is null;
update public.courts set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.courts alter column id set default gen_random_uuid();
alter table public.courts alter column active set default true;
alter table public.courts alter column created_at set default now();
alter table public.courts alter column updated_at set default now();

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

update public.clients set display_name = coalesce(display_name, full_name) where display_name is null;
update public.clients set status = coalesce(status, 'active') where status is null;
update public.clients set created_at = coalesce(created_at, now()) where created_at is null;
update public.clients set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.clients alter column id set default gen_random_uuid();
alter table public.clients alter column full_name set default 'Unknown Client';
alter table public.clients alter column status set default 'active';
alter table public.clients alter column created_at set default now();
alter table public.clients alter column updated_at set default now();

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  client_id uuid references public.clients(id),
  court_id uuid references public.courts(id),
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

alter table public.cases add column if not exists account_id uuid;
alter table public.cases add column if not exists client_id uuid;
alter table public.cases add column if not exists court_id uuid;
alter table public.cases add column if not exists case_number text;
alter table public.cases add column if not exists title text;
alter table public.cases add column if not exists description text;
alter table public.cases add column if not exists stage public.case_stage;
alter table public.cases add column if not exists status public.case_status;
alter table public.cases add column if not exists opened_at timestamptz;
alter table public.cases add column if not exists closed_at timestamptz;
alter table public.cases add column if not exists next_hearing_at timestamptz;
alter table public.cases add column if not exists created_at timestamptz;
alter table public.cases add column if not exists updated_at timestamptz;
alter table public.cases add column if not exists created_by uuid;
alter table public.cases add column if not exists updated_by uuid;
alter table public.cases add column if not exists deleted_at timestamptz;

update public.cases set title = coalesce(title, case_number, 'Untitled Case') where title is null;
update public.cases set stage = coalesce(stage, 'case') where stage is null;
update public.cases set status = coalesce(status, 'open') where status is null;
update public.cases set opened_at = coalesce(opened_at, now()) where opened_at is null;
update public.cases set created_at = coalesce(created_at, now()) where created_at is null;
update public.cases set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.cases alter column id set default gen_random_uuid();
alter table public.cases alter column stage set default 'complaint';
alter table public.cases alter column status set default 'open';
alter table public.cases alter column opened_at set default now();
alter table public.cases alter column created_at set default now();
alter table public.cases alter column updated_at set default now();

create table if not exists public.case_participants (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid not null references public.cases(id) on delete cascade,
  user_id uuid references public.users(id),
  client_id uuid references public.clients(id),
  participant_type public.participant_type not null,
  display_name text not null,
  role_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

alter table public.case_participants add column if not exists account_id uuid;
alter table public.case_participants add column if not exists case_id uuid;
alter table public.case_participants add column if not exists user_id uuid;
alter table public.case_participants add column if not exists client_id uuid;
alter table public.case_participants add column if not exists participant_type public.participant_type;
alter table public.case_participants add column if not exists display_name text;
alter table public.case_participants add column if not exists role_notes text;
alter table public.case_participants add column if not exists created_at timestamptz;
alter table public.case_participants add column if not exists updated_at timestamptz;
alter table public.case_participants add column if not exists created_by uuid;
alter table public.case_participants add column if not exists updated_by uuid;
alter table public.case_participants add column if not exists deleted_at timestamptz;

update public.case_participants set display_name = coalesce(display_name, 'Participant') where display_name is null;
update public.case_participants set participant_type = coalesce(participant_type, 'other') where participant_type is null;
update public.case_participants set created_at = coalesce(created_at, now()) where created_at is null;
update public.case_participants set updated_at = coalesce(updated_at, now()) where updated_at is null;

create table if not exists public.case_timeline_events (
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

alter table public.case_timeline_events add column if not exists account_id uuid;
alter table public.case_timeline_events add column if not exists case_id uuid;
alter table public.case_timeline_events add column if not exists event_type text;
alter table public.case_timeline_events add column if not exists title text;
alter table public.case_timeline_events add column if not exists body text;
alter table public.case_timeline_events add column if not exists visible_to_client boolean;
alter table public.case_timeline_events add column if not exists metadata jsonb;
alter table public.case_timeline_events add column if not exists created_at timestamptz;
alter table public.case_timeline_events add column if not exists created_by uuid;

update public.case_timeline_events set event_type = coalesce(event_type, 'note') where event_type is null;
update public.case_timeline_events set title = coalesce(title, 'Timeline Event') where title is null;
update public.case_timeline_events set visible_to_client = coalesce(visible_to_client, false) where visible_to_client is null;
update public.case_timeline_events set metadata = coalesce(metadata, '{}'::jsonb) where metadata is null;
update public.case_timeline_events set created_at = coalesce(created_at, now()) where created_at is null;

alter table public.case_timeline_events alter column visible_to_client set default false;
alter table public.case_timeline_events alter column metadata set default '{}';
alter table public.case_timeline_events alter column created_at set default now();

create table if not exists public.hearings (
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

alter table public.hearings add column if not exists account_id uuid;
alter table public.hearings add column if not exists case_id uuid;
alter table public.hearings add column if not exists court_id uuid;
alter table public.hearings add column if not exists hearing_at timestamptz;
alter table public.hearings add column if not exists chamber text;
alter table public.hearings add column if not exists agenda text;
alter table public.hearings add column if not exists outcome text;
alter table public.hearings add column if not exists status text;
alter table public.hearings add column if not exists created_at timestamptz;
alter table public.hearings add column if not exists updated_at timestamptz;
alter table public.hearings add column if not exists created_by uuid;
alter table public.hearings add column if not exists updated_by uuid;
alter table public.hearings add column if not exists deleted_at timestamptz;

update public.hearings set hearing_at = coalesce(hearing_at, now()) where hearing_at is null;
update public.hearings set status = coalesce(status, 'scheduled') where status is null;
update public.hearings set created_at = coalesce(created_at, now()) where created_at is null;
update public.hearings set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.hearings alter column status set default 'scheduled';
alter table public.hearings alter column created_at set default now();
alter table public.hearings alter column updated_at set default now();

create table if not exists public.appointments (
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

alter table public.appointments add column if not exists account_id uuid;
alter table public.appointments add column if not exists case_id uuid;
alter table public.appointments add column if not exists title text;
alter table public.appointments add column if not exists appointment_type text;
alter table public.appointments add column if not exists starts_at timestamptz;
alter table public.appointments add column if not exists ends_at timestamptz;
alter table public.appointments add column if not exists location text;
alter table public.appointments add column if not exists google_event_id text;
alter table public.appointments add column if not exists created_at timestamptz;
alter table public.appointments add column if not exists updated_at timestamptz;
alter table public.appointments add column if not exists created_by uuid;
alter table public.appointments add column if not exists updated_by uuid;
alter table public.appointments add column if not exists deleted_at timestamptz;

update public.appointments set title = coalesce(title, 'Appointment') where title is null;
update public.appointments set appointment_type = coalesce(appointment_type, 'client_meeting') where appointment_type is null;
update public.appointments set starts_at = coalesce(starts_at, now()) where starts_at is null;
update public.appointments set created_at = coalesce(created_at, now()) where created_at is null;
update public.appointments set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.appointments alter column created_at set default now();
alter table public.appointments alter column updated_at set default now();

create table if not exists public.tasks (
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

alter table public.tasks add column if not exists account_id uuid;
alter table public.tasks add column if not exists case_id uuid;
alter table public.tasks add column if not exists title text;
alter table public.tasks add column if not exists description text;
alter table public.tasks add column if not exists assignee_user_id uuid;
alter table public.tasks add column if not exists priority text;
alter table public.tasks add column if not exists status text;
alter table public.tasks add column if not exists due_at timestamptz;
alter table public.tasks add column if not exists completed_at timestamptz;
alter table public.tasks add column if not exists created_at timestamptz;
alter table public.tasks add column if not exists updated_at timestamptz;
alter table public.tasks add column if not exists created_by uuid;
alter table public.tasks add column if not exists updated_by uuid;
alter table public.tasks add column if not exists deleted_at timestamptz;

update public.tasks set title = coalesce(title, 'Task') where title is null;
update public.tasks set priority = coalesce(priority, 'medium') where priority is null;
update public.tasks set status = coalesce(status, 'open') where status is null;
update public.tasks set created_at = coalesce(created_at, now()) where created_at is null;
update public.tasks set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.tasks alter column priority set default 'medium';
alter table public.tasks alter column status set default 'open';
alter table public.tasks alter column created_at set default now();
alter table public.tasks alter column updated_at set default now();

create table if not exists public.client_updates (
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

alter table public.client_updates add column if not exists account_id uuid;
alter table public.client_updates add column if not exists case_id uuid;
alter table public.client_updates add column if not exists title text;
alter table public.client_updates add column if not exists body text;
alter table public.client_updates add column if not exists visible_to_client boolean;
alter table public.client_updates add column if not exists published_at timestamptz;
alter table public.client_updates add column if not exists created_at timestamptz;
alter table public.client_updates add column if not exists updated_at timestamptz;
alter table public.client_updates add column if not exists created_by uuid;
alter table public.client_updates add column if not exists updated_by uuid;
alter table public.client_updates add column if not exists deleted_at timestamptz;

update public.client_updates set title = coalesce(title, 'Client Update') where title is null;
update public.client_updates set body = coalesce(body, '') where body is null;
update public.client_updates set visible_to_client = coalesce(visible_to_client, false) where visible_to_client is null;
update public.client_updates set created_at = coalesce(created_at, now()) where created_at is null;
update public.client_updates set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.client_updates alter column visible_to_client set default false;
alter table public.client_updates alter column created_at set default now();
alter table public.client_updates alter column updated_at set default now();

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  title text not null,
  document_type text not null default 'general',
  classification public.document_classification not null default 'confidential',
  visible_to_client boolean not null default false,
  current_version_id uuid,
  document_verification_status text not null default 'not_required',
  verified_current_version_id uuid,
  verified_at timestamptz,
  verification_failed_at timestamptz,
  verification_failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  deleted_at timestamptz
);

alter table public.documents add column if not exists account_id uuid;
alter table public.documents add column if not exists case_id uuid;
alter table public.documents add column if not exists title text;
alter table public.documents add column if not exists document_type text;
alter table public.documents add column if not exists classification public.document_classification;
alter table public.documents add column if not exists visible_to_client boolean;
alter table public.documents add column if not exists current_version_id uuid;
alter table public.documents add column if not exists document_verification_status text;
alter table public.documents add column if not exists verified_current_version_id uuid;
alter table public.documents add column if not exists verified_at timestamptz;
alter table public.documents add column if not exists verification_failed_at timestamptz;
alter table public.documents add column if not exists verification_failure_reason text;
alter table public.documents add column if not exists created_at timestamptz;
alter table public.documents add column if not exists updated_at timestamptz;
alter table public.documents add column if not exists created_by uuid;
alter table public.documents add column if not exists updated_by uuid;
alter table public.documents add column if not exists deleted_at timestamptz;

update public.documents set title = coalesce(title, 'Document') where title is null;
update public.documents set document_type = coalesce(document_type, 'general') where document_type is null;
update public.documents set classification = coalesce(classification, 'confidential') where classification is null;
update public.documents set visible_to_client = coalesce(visible_to_client, false) where visible_to_client is null;
update public.documents set document_verification_status = coalesce(document_verification_status, 'not_required') where document_verification_status is null;
update public.documents set created_at = coalesce(created_at, now()) where created_at is null;
update public.documents set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.documents alter column document_type set default 'general';
alter table public.documents alter column classification set default 'confidential';
alter table public.documents alter column visible_to_client set default false;
alter table public.documents alter column document_verification_status set default 'not_required';
alter table public.documents alter column created_at set default now();
alter table public.documents alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_verification_status_chk'
  ) then
    alter table public.documents
      add constraint documents_verification_status_chk
      check (document_verification_status in ('not_required', 'pending', 'verified', 'verification_failed', 'reviewed_not_verified'));
  end if;
end
$$;

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null,
  storage_path text not null,
  original_file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  sha256_hash text not null,
  server_verified_sha256_hash text,
  sha256_verification_status text not null default 'pending',
  sha256_verified_at timestamptz,
  sha256_verification_error text,
  sha256_verification_requested_at timestamptz not null default now(),
  extracted_text text,
  uploaded_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (document_id, version_number),
  unique (account_id, storage_path)
);

alter table public.document_versions add column if not exists account_id uuid;
alter table public.document_versions add column if not exists document_id uuid;
alter table public.document_versions add column if not exists version_number integer;
alter table public.document_versions add column if not exists storage_path text;
alter table public.document_versions add column if not exists original_file_name text;
alter table public.document_versions add column if not exists mime_type text;
alter table public.document_versions add column if not exists size_bytes bigint;
alter table public.document_versions add column if not exists sha256_hash text;
alter table public.document_versions add column if not exists server_verified_sha256_hash text;
alter table public.document_versions add column if not exists sha256_verification_status text;
alter table public.document_versions add column if not exists sha256_verified_at timestamptz;
alter table public.document_versions add column if not exists sha256_verification_error text;
alter table public.document_versions add column if not exists sha256_verification_requested_at timestamptz;
alter table public.document_versions add column if not exists extracted_text text;
alter table public.document_versions add column if not exists uploaded_by uuid;
alter table public.document_versions add column if not exists created_at timestamptz;

update public.document_versions set version_number = coalesce(version_number, 1) where version_number is null;
update public.document_versions set storage_path = coalesce(storage_path, '') where storage_path is null;
update public.document_versions set original_file_name = coalesce(original_file_name, 'file') where original_file_name is null;
update public.document_versions set mime_type = coalesce(mime_type, 'application/octet-stream') where mime_type is null;
update public.document_versions set size_bytes = coalesce(size_bytes, 0) where size_bytes is null;
update public.document_versions set sha256_hash = coalesce(sha256_hash, repeat('0', 64)) where sha256_hash is null;
update public.document_versions set sha256_verification_status = coalesce(sha256_verification_status, 'pending') where sha256_verification_status is null;
update public.document_versions set sha256_verification_requested_at = coalesce(sha256_verification_requested_at, now()) where sha256_verification_requested_at is null;
update public.document_versions set created_at = coalesce(created_at, now()) where created_at is null;

alter table public.document_versions alter column sha256_verification_status set default 'pending';
alter table public.document_versions alter column sha256_verification_requested_at set default now();
alter table public.document_versions alter column created_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.document_versions'::regclass
      and conname = 'document_versions_sha256_verification_status_chk'
  ) then
    alter table public.document_versions
      add constraint document_versions_sha256_verification_status_chk
      check (sha256_verification_status in ('pending', 'verified', 'verification_failed', 'reviewed_not_verified'));
  end if;
end
$$;

create table if not exists public.document_version_verification_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_version_id uuid not null references public.document_versions(id) on delete cascade,
  storage_path text not null,
  client_sha256_hash text not null check (client_sha256_hash ~* '^[a-f0-9]{64}$'),
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_version_id)
);

alter table public.document_version_verification_jobs add column if not exists account_id uuid;
alter table public.document_version_verification_jobs add column if not exists document_version_id uuid;
alter table public.document_version_verification_jobs add column if not exists storage_path text;
alter table public.document_version_verification_jobs add column if not exists client_sha256_hash text;
alter table public.document_version_verification_jobs add column if not exists status text;
alter table public.document_version_verification_jobs add column if not exists attempts integer;
alter table public.document_version_verification_jobs add column if not exists error_message text;
alter table public.document_version_verification_jobs add column if not exists created_at timestamptz;
alter table public.document_version_verification_jobs add column if not exists updated_at timestamptz;

update public.document_version_verification_jobs set status = coalesce(status, 'queued') where status is null;
update public.document_version_verification_jobs set attempts = coalesce(attempts, 0) where attempts is null;
update public.document_version_verification_jobs set created_at = coalesce(created_at, now()) where created_at is null;
update public.document_version_verification_jobs set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.document_version_verification_jobs alter column status set default 'queued';
alter table public.document_version_verification_jobs alter column attempts set default 0;
alter table public.document_version_verification_jobs alter column created_at set default now();
alter table public.document_version_verification_jobs alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_current_version_fk'
  ) then
    alter table public.documents
      add constraint documents_current_version_fk
      foreign key (current_version_id) references public.document_versions(id);
  end if;
end
$$;

create table if not exists public.invoices (
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

alter table public.invoices add column if not exists account_id uuid;
alter table public.invoices add column if not exists client_id uuid;
alter table public.invoices add column if not exists case_id uuid;
alter table public.invoices add column if not exists invoice_number text;
alter table public.invoices add column if not exists currency char(3);
alter table public.invoices add column if not exists total_amount numeric(12,2);
alter table public.invoices add column if not exists balance_due numeric(12,2);
alter table public.invoices add column if not exists status text;
alter table public.invoices add column if not exists issued_at timestamptz;
alter table public.invoices add column if not exists due_at timestamptz;
alter table public.invoices add column if not exists created_at timestamptz;
alter table public.invoices add column if not exists updated_at timestamptz;
alter table public.invoices add column if not exists created_by uuid;
alter table public.invoices add column if not exists updated_by uuid;
alter table public.invoices add column if not exists deleted_at timestamptz;

update public.invoices set currency = coalesce(currency, 'QAR') where currency is null;
update public.invoices set total_amount = coalesce(total_amount, 0) where total_amount is null;
update public.invoices set balance_due = coalesce(balance_due, total_amount, 0) where balance_due is null;
update public.invoices set status = coalesce(status, 'draft') where status is null;
update public.invoices set issued_at = coalesce(issued_at, now()) where issued_at is null;
update public.invoices set created_at = coalesce(created_at, now()) where created_at is null;
update public.invoices set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.invoices alter column currency set default 'QAR';
alter table public.invoices alter column total_amount set default 0;
alter table public.invoices alter column balance_due set default 0;
alter table public.invoices alter column status set default 'draft';
alter table public.invoices alter column issued_at set default now();
alter table public.invoices alter column created_at set default now();
alter table public.invoices alter column updated_at set default now();

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  description text not null,
  quantity numeric(12,2) not null default 1,
  unit_amount numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.invoice_items add column if not exists account_id uuid;
alter table public.invoice_items add column if not exists invoice_id uuid;
alter table public.invoice_items add column if not exists description text;
alter table public.invoice_items add column if not exists quantity numeric(12,2);
alter table public.invoice_items add column if not exists unit_amount numeric(12,2);
alter table public.invoice_items add column if not exists line_total numeric(12,2);
alter table public.invoice_items add column if not exists created_at timestamptz;

update public.invoice_items set description = coalesce(description, 'Item') where description is null;
update public.invoice_items set quantity = coalesce(quantity, 1) where quantity is null;
update public.invoice_items set unit_amount = coalesce(unit_amount, 0) where unit_amount is null;
update public.invoice_items set line_total = coalesce(line_total, quantity * unit_amount, 0) where line_total is null;
update public.invoice_items set created_at = coalesce(created_at, now()) where created_at is null;

alter table public.invoice_items alter column quantity set default 1;
alter table public.invoice_items alter column unit_amount set default 0;
alter table public.invoice_items alter column line_total set default 0;
alter table public.invoice_items alter column created_at set default now();

create table if not exists public.service_requests (
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
  updated_by uuid references public.users(id)
);

alter table public.service_requests add column if not exists account_id uuid;
alter table public.service_requests add column if not exists client_user_id uuid;
alter table public.service_requests add column if not exists case_id uuid;
alter table public.service_requests add column if not exists assigned_user_id uuid;
alter table public.service_requests add column if not exists service_type text;
alter table public.service_requests add column if not exists status text;
alter table public.service_requests add column if not exists priority text;
alter table public.service_requests add column if not exists title text;
alter table public.service_requests add column if not exists description text;
alter table public.service_requests add column if not exists preferred_contact_method text;
alter table public.service_requests add column if not exists preferred_at timestamptz;
alter table public.service_requests add column if not exists resolved_at timestamptz;
alter table public.service_requests add column if not exists created_at timestamptz;
alter table public.service_requests add column if not exists updated_at timestamptz;
alter table public.service_requests add column if not exists created_by uuid;
alter table public.service_requests add column if not exists updated_by uuid;

update public.service_requests set service_type = coalesce(service_type, 'other') where service_type is null;
update public.service_requests set status = coalesce(status, 'submitted') where status is null;
update public.service_requests set priority = coalesce(priority, 'normal') where priority is null;
update public.service_requests set title = coalesce(title, 'Service Request') where title is null;
update public.service_requests set description = coalesce(description, 'N/A') where description is null;
update public.service_requests set created_at = coalesce(created_at, now()) where created_at is null;
update public.service_requests set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.service_requests alter column status set default 'submitted';
alter table public.service_requests alter column priority set default 'normal';
alter table public.service_requests alter column created_at set default now();
alter table public.service_requests alter column updated_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.service_requests'::regclass
      and conname = 'service_requests_service_type_chk'
  ) then
    alter table public.service_requests
      add constraint service_requests_service_type_chk
      check (service_type in ('consultation', 'document_review', 'new_claim', 'follow_up', 'other'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.service_requests'::regclass
      and conname = 'service_requests_status_chk'
  ) then
    alter table public.service_requests
      add constraint service_requests_status_chk
      check (status in ('submitted', 'in_review', 'assigned', 'in_progress', 'waiting_on_client', 'resolved', 'cancelled'));
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.service_requests'::regclass
      and conname = 'service_requests_priority_chk'
  ) then
    alter table public.service_requests
      add constraint service_requests_priority_chk
      check (priority in ('low', 'normal', 'high', 'urgent'));
  end if;
end
$$;

create table if not exists public.notifications (
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

alter table public.notifications add column if not exists account_id uuid;
alter table public.notifications add column if not exists user_id uuid;
alter table public.notifications add column if not exists channel public.notification_channel;
alter table public.notifications add column if not exists title text;
alter table public.notifications add column if not exists body text;
alter table public.notifications add column if not exists target_type text;
alter table public.notifications add column if not exists target_id uuid;
alter table public.notifications add column if not exists read_at timestamptz;
alter table public.notifications add column if not exists sent_at timestamptz;
alter table public.notifications add column if not exists metadata jsonb;
alter table public.notifications add column if not exists created_at timestamptz;

update public.notifications set channel = coalesce(channel, 'in_app') where channel is null;
update public.notifications set title = coalesce(title, 'Notification') where title is null;
update public.notifications set body = coalesce(body, '') where body is null;
update public.notifications set metadata = coalesce(metadata, '{}'::jsonb) where metadata is null;
update public.notifications set created_at = coalesce(created_at, now()) where created_at is null;

alter table public.notifications alter column channel set default 'in_app';
alter table public.notifications alter column metadata set default '{}';
alter table public.notifications alter column created_at set default now();

create table if not exists public.device_tokens (
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

alter table public.device_tokens add column if not exists account_id uuid;
alter table public.device_tokens add column if not exists user_id uuid;
alter table public.device_tokens add column if not exists platform text;
alter table public.device_tokens add column if not exists token text;
alter table public.device_tokens add column if not exists device_id text;
alter table public.device_tokens add column if not exists last_seen_at timestamptz;
alter table public.device_tokens add column if not exists created_at timestamptz;
alter table public.device_tokens add column if not exists updated_at timestamptz;

update public.device_tokens set platform = coalesce(platform, 'ios') where platform is null;
update public.device_tokens set token = coalesce(token, '') where token is null;
update public.device_tokens set device_id = coalesce(device_id, 'unknown-device') where device_id is null;
update public.device_tokens set last_seen_at = coalesce(last_seen_at, now()) where last_seen_at is null;
update public.device_tokens set created_at = coalesce(created_at, now()) where created_at is null;
update public.device_tokens set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.device_tokens alter column last_seen_at set default now();
alter table public.device_tokens alter column created_at set default now();
alter table public.device_tokens alter column updated_at set default now();

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  document_version_id uuid references public.document_versions(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued',
  requested_by uuid references public.users(id),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_jobs add column if not exists account_id uuid;
alter table public.ai_jobs add column if not exists document_version_id uuid;
alter table public.ai_jobs add column if not exists job_type text;
alter table public.ai_jobs add column if not exists status text;
alter table public.ai_jobs add column if not exists requested_by uuid;
alter table public.ai_jobs add column if not exists error_message text;
alter table public.ai_jobs add column if not exists created_at timestamptz;
alter table public.ai_jobs add column if not exists updated_at timestamptz;

update public.ai_jobs set status = coalesce(status, 'queued') where status is null;
update public.ai_jobs set created_at = coalesce(created_at, now()) where created_at is null;
update public.ai_jobs set updated_at = coalesce(updated_at, now()) where updated_at is null;

alter table public.ai_jobs alter column status set default 'queued';
alter table public.ai_jobs alter column created_at set default now();
alter table public.ai_jobs alter column updated_at set default now();

create table if not exists public.ai_outputs (
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

alter table public.ai_outputs add column if not exists account_id uuid;
alter table public.ai_outputs add column if not exists case_id uuid;
alter table public.ai_outputs add column if not exists document_version_id uuid;
alter table public.ai_outputs add column if not exists output_type text;
alter table public.ai_outputs add column if not exists prompt text;
alter table public.ai_outputs add column if not exists output jsonb;
alter table public.ai_outputs add column if not exists model text;
alter table public.ai_outputs add column if not exists latency_ms integer;
alter table public.ai_outputs add column if not exists cost_cents numeric(10,4);
alter table public.ai_outputs add column if not exists created_at timestamptz;
alter table public.ai_outputs add column if not exists created_by uuid;

update public.ai_outputs set output_type = coalesce(output_type, 'chat') where output_type is null;
update public.ai_outputs set output = coalesce(output, '{}'::jsonb) where output is null;
update public.ai_outputs set model = coalesce(model, 'unknown') where model is null;
update public.ai_outputs set created_at = coalesce(created_at, now()) where created_at is null;

alter table public.ai_outputs alter column output set default '{}';
alter table public.ai_outputs alter column created_at set default now();

create table if not exists public.audit_logs (
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

alter table public.audit_logs add column if not exists account_id uuid;
alter table public.audit_logs add column if not exists actor_user_id uuid;
alter table public.audit_logs add column if not exists actor_role public.member_role;
alter table public.audit_logs add column if not exists action text;
alter table public.audit_logs add column if not exists target_type text;
alter table public.audit_logs add column if not exists target_id uuid;
alter table public.audit_logs add column if not exists request_id text;
alter table public.audit_logs add column if not exists ip_address inet;
alter table public.audit_logs add column if not exists user_agent text;
alter table public.audit_logs add column if not exists before_snapshot jsonb;
alter table public.audit_logs add column if not exists after_snapshot jsonb;
alter table public.audit_logs add column if not exists occurred_at timestamptz;

update public.audit_logs set action = coalesce(action, 'UNKNOWN_ACTION') where action is null;
update public.audit_logs set target_type = coalesce(target_type, 'unknown') where target_type is null;
update public.audit_logs set occurred_at = coalesce(occurred_at, now()) where occurred_at is null;

alter table public.audit_logs alter column occurred_at set default now();

create table if not exists public.audit_events (
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

create index if not exists accounts_slug_idx on public.accounts(slug);
create index if not exists account_memberships_user_idx on public.account_memberships(user_id, status);
create index if not exists account_memberships_account_role_idx on public.account_memberships(account_id, role, status);
create index if not exists clients_account_created_idx on public.clients(account_id, created_at desc);
create index if not exists clients_account_user_idx on public.clients(account_id, user_id);
create index if not exists cases_account_updated_idx on public.cases(account_id, updated_at desc);
create index if not exists cases_client_idx on public.cases(account_id, client_id);
create index if not exists case_participants_case_user_idx on public.case_participants(case_id, user_id, participant_type);
create index if not exists hearings_case_at_idx on public.hearings(case_id, hearing_at desc);
create index if not exists tasks_account_due_idx on public.tasks(account_id, due_at);
create index if not exists appointments_account_start_idx on public.appointments(account_id, starts_at);
create index if not exists client_updates_case_created_idx on public.client_updates(case_id, created_at desc);
create index if not exists documents_account_case_idx on public.documents(account_id, case_id, updated_at desc);
create index if not exists documents_verification_status_idx on public.documents(account_id, document_verification_status, updated_at desc);
create index if not exists document_versions_account_created_idx on public.document_versions(account_id, created_at desc);
create index if not exists document_versions_sha256_verification_idx on public.document_versions(account_id, sha256_verification_status, created_at desc);
create index if not exists document_version_verification_jobs_status_idx on public.document_version_verification_jobs(account_id, status, created_at);
create index if not exists invoices_account_status_idx on public.invoices(account_id, status, issued_at desc);
create index if not exists service_requests_client_created_idx on public.service_requests(account_id, client_user_id, created_at desc);
create index if not exists service_requests_status_created_idx on public.service_requests(account_id, status, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(account_id, user_id, created_at desc);
create index if not exists ai_jobs_account_status_idx on public.ai_jobs(account_id, status, created_at desc);
create index if not exists audit_logs_account_occurred_idx on public.audit_logs(account_id, occurred_at desc);
create index if not exists audit_events_account_occurred_idx on public.audit_events(account_id, occurred_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'accounts',
    'users',
    'account_memberships',
    'clients',
    'cases',
    'case_participants',
    'case_timeline_events',
    'hearings',
    'appointments',
    'tasks',
    'client_updates',
    'documents',
    'document_versions',
    'document_version_verification_jobs',
    'invoices',
    'invoice_items',
    'service_requests',
    'notifications',
    'device_tokens',
    'ai_jobs',
    'ai_outputs',
    'audit_logs',
    'audit_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end
$$;

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

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'tenant_read_clients'
  ) then
    create policy tenant_read_clients on public.clients
    for select using (
      account_id in (select public.current_account_ids())
      and (public.current_role_for_account(account_id) <> 'client' or user_id = auth.uid())
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'clients' and policyname = 'tenant_write_clients'
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
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'cases' and policyname = 'tenant_read_cases'
  ) then
    create policy tenant_read_cases on public.cases
    for select using (
      account_id in (select public.current_account_ids())
      and (public.current_role_for_account(account_id) <> 'client' or public.can_access_case(id))
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'documents' and policyname = 'tenant_read_documents'
  ) then
    create policy tenant_read_documents on public.documents
    for select using (
      account_id in (select public.current_account_ids())
      and (
        public.current_role_for_account(account_id) <> 'client'
        or visible_to_client = true
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
    where schemaname = 'public' and tablename = 'document_versions' and policyname = 'tenant_read_document_versions'
  ) then
    create policy tenant_read_document_versions on public.document_versions
    for select using (
      account_id in (select public.current_account_ids())
      and exists (select 1 from public.documents d where d.id = document_versions.document_id)
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'case_timeline_events' and policyname = 'tenant_read_timeline'
  ) then
    create policy tenant_read_timeline on public.case_timeline_events
    for select using (
      account_id in (select public.current_account_ids())
      and (public.current_role_for_account(account_id) <> 'client' or (visible_to_client = true and public.can_access_case(case_id)))
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'client_updates' and policyname = 'tenant_read_client_updates'
  ) then
    create policy tenant_read_client_updates on public.client_updates
    for select using (
      account_id in (select public.current_account_ids())
      and (public.current_role_for_account(account_id) <> 'client' or (visible_to_client = true and public.can_access_case(case_id)))
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'case_participants' and policyname = 'tenant_read_case_participants'
  ) then
    create policy tenant_read_case_participants on public.case_participants
    for select using (
      account_id in (select public.current_account_ids())
      and public.can_access_case(case_id)
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'notifications' and policyname = 'tenant_read_notifications'
  ) then
    create policy tenant_read_notifications on public.notifications
    for select using (account_id in (select public.current_account_ids()) and user_id = auth.uid());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'service_requests' and policyname = 'tenant_read_service_requests'
  ) then
    create policy tenant_read_service_requests on public.service_requests
    for select using (
      account_id in (select public.current_account_ids())
      and (
        public.current_role_for_account(account_id) in ('owner', 'admin', 'lawyer', 'staff', 'system')
        or client_user_id = auth.uid()
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
    where schemaname = 'public' and tablename = 'service_requests' and policyname = 'client_create_service_requests'
  ) then
    create policy client_create_service_requests on public.service_requests
    for insert with check (
      account_id in (select public.current_account_ids())
      and client_user_id = auth.uid()
      and public.current_role_for_account(account_id) = 'client'
      and (case_id is null or public.can_access_case(case_id))
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'service_requests' and policyname = 'staff_write_service_requests'
  ) then
    create policy staff_write_service_requests on public.service_requests
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
    where schemaname = 'public' and tablename = 'audit_logs' and policyname = 'service_insert_audit_logs'
  ) then
    create policy service_insert_audit_logs on public.audit_logs
    for insert with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public' and tablename = 'audit_events' and policyname = 'service_insert_audit_events'
  ) then
    create policy service_insert_audit_events on public.audit_events
    for insert with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'accounts_set_updated_at'
      and tgrelid = 'public.accounts'::regclass
  ) then
    create trigger accounts_set_updated_at
    before update on public.accounts
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'users_set_updated_at'
      and tgrelid = 'public.users'::regclass
  ) then
    create trigger users_set_updated_at
    before update on public.users
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'account_memberships_set_updated_at'
      and tgrelid = 'public.account_memberships'::regclass
  ) then
    create trigger account_memberships_set_updated_at
    before update on public.account_memberships
    for each row execute function public.set_updated_at();
  end if;

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
    where tgname = 'cases_set_updated_at'
      and tgrelid = 'public.cases'::regclass
  ) then
    create trigger cases_set_updated_at
    before update on public.cases
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'hearings_set_updated_at'
      and tgrelid = 'public.hearings'::regclass
  ) then
    create trigger hearings_set_updated_at
    before update on public.hearings
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'appointments_set_updated_at'
      and tgrelid = 'public.appointments'::regclass
  ) then
    create trigger appointments_set_updated_at
    before update on public.appointments
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'tasks_set_updated_at'
      and tgrelid = 'public.tasks'::regclass
  ) then
    create trigger tasks_set_updated_at
    before update on public.tasks
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'client_updates_set_updated_at'
      and tgrelid = 'public.client_updates'::regclass
  ) then
    create trigger client_updates_set_updated_at
    before update on public.client_updates
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'documents_set_updated_at'
      and tgrelid = 'public.documents'::regclass
  ) then
    create trigger documents_set_updated_at
    before update on public.documents
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'invoices_set_updated_at'
      and tgrelid = 'public.invoices'::regclass
  ) then
    create trigger invoices_set_updated_at
    before update on public.invoices
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'service_requests_set_updated_at'
      and tgrelid = 'public.service_requests'::regclass
  ) then
    create trigger service_requests_set_updated_at
    before update on public.service_requests
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'device_tokens_set_updated_at'
      and tgrelid = 'public.device_tokens'::regclass
  ) then
    create trigger device_tokens_set_updated_at
    before update on public.device_tokens
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'ai_jobs_set_updated_at'
      and tgrelid = 'public.ai_jobs'::regclass
  ) then
    create trigger ai_jobs_set_updated_at
    before update on public.ai_jobs
    for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'document_version_verification_jobs_set_updated_at'
      and tgrelid = 'public.document_version_verification_jobs'::regclass
  ) then
    create trigger document_version_verification_jobs_set_updated_at
    before update on public.document_version_verification_jobs
    for each row execute function public.set_updated_at();
  end if;
end
$$;
