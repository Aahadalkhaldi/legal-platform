do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'matter_action_type'
  ) then
    create type public.matter_action_type as enum (
      'lawsuit',
      'appeal',
      'cassation',
      'execution',
      'urgent_request',
      'police_report',
      'public_prosecution_complaint',
      'cybercrime_report',
      'labor_complaint',
      'administrative_complaint',
      'regulatory_complaint'
    );
  end if;
end
$$;

alter type public.matter_action_type add value if not exists 'lawsuit';
alter type public.matter_action_type add value if not exists 'appeal';
alter type public.matter_action_type add value if not exists 'cassation';
alter type public.matter_action_type add value if not exists 'execution';
alter type public.matter_action_type add value if not exists 'urgent_request';
alter type public.matter_action_type add value if not exists 'police_report';
alter type public.matter_action_type add value if not exists 'public_prosecution_complaint';
alter type public.matter_action_type add value if not exists 'cybercrime_report';
alter type public.matter_action_type add value if not exists 'labor_complaint';
alter type public.matter_action_type add value if not exists 'administrative_complaint';
alter type public.matter_action_type add value if not exists 'regulatory_complaint';

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'matter_intake_type'
  ) then
    create type public.matter_intake_type as enum (
      'lawsuit',
      'complaint_report',
      'consultation',
      'contract_document'
    );
  end if;
end
$$;

alter type public.matter_intake_type add value if not exists 'lawsuit';
alter type public.matter_intake_type add value if not exists 'complaint_report';
alter type public.matter_intake_type add value if not exists 'consultation';
alter type public.matter_intake_type add value if not exists 'contract_document';

alter table public.legal_matters
  add column if not exists intake_type public.matter_intake_type;

update public.legal_matters
set intake_type = coalesce(intake_type, 'lawsuit'::public.matter_intake_type)
where intake_type is null;

alter table public.legal_matters
  alter column intake_type set default 'lawsuit';

do $$
begin
  if not exists (select 1 from public.legal_matters where intake_type is null) then
    alter table public.legal_matters
      alter column intake_type set not null;
  end if;
end
$$;

alter table public.matter_proceedings
  add column if not exists action_type public.matter_action_type,
  add column if not exists circuit text,
  add column if not exists claim_type text,
  add column if not exists judgment_summary text,
  add column if not exists authority text,
  add column if not exists report_number text,
  add column if not exists submission_date timestamptz,
  add column if not exists complainant text,
  add column if not exists respondent text,
  add column if not exists investigation_sessions jsonb not null default '[]',
  add column if not exists prosecutor_name text,
  add column if not exists police_station text,
  add column if not exists related_lawsuit_proceeding_id uuid;

update public.matter_proceedings
set action_type = case
  when stage = 'appeal' then 'appeal'::public.matter_action_type
  when stage = 'cassation' then 'cassation'::public.matter_action_type
  when stage = 'execution' then 'execution'::public.matter_action_type
  when stage = 'urgent_request' then 'urgent_request'::public.matter_action_type
  else 'lawsuit'::public.matter_action_type
end
where action_type is null;

alter table public.matter_proceedings
  alter column action_type set default 'lawsuit';

do $$
begin
  if not exists (select 1 from public.matter_proceedings where action_type is null) then
    alter table public.matter_proceedings
      alter column action_type set not null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'matter_proceedings_related_lawsuit_fk'
      and conrelid = 'public.matter_proceedings'::regclass
  ) then
    alter table public.matter_proceedings
      add constraint matter_proceedings_related_lawsuit_fk
      foreign key (related_lawsuit_proceeding_id) references public.matter_proceedings(id) on delete set null;
  end if;
end
$$;

create index if not exists legal_matters_account_intake_idx
  on public.legal_matters(account_id, intake_type, updated_at desc);

create index if not exists matter_proceedings_action_type_idx
  on public.matter_proceedings(account_id, action_type, created_at desc);

create index if not exists matter_proceedings_matter_action_type_idx
  on public.matter_proceedings(legal_matter_id, action_type, created_at desc);

create index if not exists matter_proceedings_report_number_idx
  on public.matter_proceedings(account_id, report_number);

create index if not exists matter_proceedings_related_lawsuit_idx
  on public.matter_proceedings(related_lawsuit_proceeding_id);

drop index if exists public.matter_proceedings_parent_stage_unique_idx;

create unique index if not exists matter_proceedings_parent_action_unique_idx
  on public.matter_proceedings(account_id, parent_proceeding_id, action_type)
  where parent_proceeding_id is not null and deleted_at is null;
