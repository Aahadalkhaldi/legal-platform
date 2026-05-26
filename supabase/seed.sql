insert into public.roles (name, description) values
  ('owner', 'Account owner with protected sole-admin controls.'),
  ('admin', 'Administrative manager for the legal office.'),
  ('lawyer', 'Lawyer with case, document, client update, and AI permissions.'),
  ('staff', 'Operational staff with limited case support permissions.'),
  ('client', 'Client portal user restricted to assigned cases and shared documents.'),
  ('system', 'Service role for scheduled and integration jobs.')
on conflict (name) do update set description = excluded.description;

insert into public.permissions (name, description) values
  ('cases:create', 'Create legal cases and complaints.'),
  ('cases:update', 'Update legal cases.'),
  ('timeline:create', 'Create case timeline events.'),
  ('client_updates:create', 'Draft updates for client portal.'),
  ('client_updates:publish', 'Show or hide updates in client portal.'),
  ('documents:create', 'Create document records.'),
  ('documents:version:create', 'Upload immutable document versions.'),
  ('tasks:create', 'Create legal workflow tasks.'),
  ('appointments:create', 'Create hearings, meetings, and deadlines.'),
  ('billing:create', 'Create invoices and billing records.'),
  ('ai:document_ingest', 'Queue legal document intelligence jobs.'),
  ('service_requests:update', 'Review, assign, and update client service requests.')
on conflict (name) do update set description = excluded.description;

insert into public.role_permissions (role, permission)
select role_name::public.member_role, permission_name
from (
  values
    ('owner', 'cases:create'), ('owner', 'cases:update'), ('owner', 'timeline:create'), ('owner', 'client_updates:create'), ('owner', 'client_updates:publish'), ('owner', 'documents:create'), ('owner', 'documents:version:create'), ('owner', 'tasks:create'), ('owner', 'appointments:create'), ('owner', 'billing:create'), ('owner', 'ai:document_ingest'), ('owner', 'service_requests:update'),
    ('admin', 'cases:create'), ('admin', 'cases:update'), ('admin', 'timeline:create'), ('admin', 'client_updates:create'), ('admin', 'client_updates:publish'), ('admin', 'documents:create'), ('admin', 'documents:version:create'), ('admin', 'tasks:create'), ('admin', 'appointments:create'), ('admin', 'billing:create'), ('admin', 'ai:document_ingest'), ('admin', 'service_requests:update'),
    ('lawyer', 'cases:create'), ('lawyer', 'cases:update'), ('lawyer', 'timeline:create'), ('lawyer', 'client_updates:create'), ('lawyer', 'client_updates:publish'), ('lawyer', 'documents:create'), ('lawyer', 'documents:version:create'), ('lawyer', 'tasks:create'), ('lawyer', 'appointments:create'), ('lawyer', 'ai:document_ingest'), ('lawyer', 'service_requests:update'),
    ('staff', 'timeline:create'), ('staff', 'documents:create'), ('staff', 'documents:version:create'), ('staff', 'tasks:create'), ('staff', 'appointments:create'), ('staff', 'service_requests:update')
) as grants(role_name, permission_name)
on conflict do nothing;

insert into public.courts (code, name_ar, name_en, jurisdiction) values
  ('appeal', 'محكمة الاستئناف', 'Court of Appeal', 'qatar'),
  ('primary-dafna', 'المحكمة الابتدائية - الدفنة', 'Primary Court - Dafna', 'qatar'),
  ('primary-al-sadd', 'المحكمة الابتدائية - السد', 'Primary Court - Al Sadd', 'qatar'),
  ('primary-lusail', 'المحكمة الابتدائية - لوسيل', 'Primary Court - Lusail', 'qatar'),
  ('labor', 'المحكمة العمالية', 'Labor Court', 'qatar'),
  ('commercial', 'المحكمة التجارية', 'Commercial Court', 'qatar'),
  ('cassation', 'محكمة التمييز', 'Court of Cassation', 'qatar'),
  ('family', 'محكمة الأسرة', 'Family Court', 'qatar'),
  ('investment-trade', 'محكمة الاستثمار والتجارة', 'Investment and Trade Court', 'qatar'),
  ('rental', 'لجنة فض المنازعات الإيجارية', 'Rental Dispute Resolution Committee', 'qatar')
on conflict (code) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, active = true;

insert into public.prosecution_entities (code, name_ar, name_en) values
  ('public-prosecution', 'النيابة العامة', 'Public Prosecution'),
  ('economic-crimes', 'إدارة مكافحة الجرائم الاقتصادية', 'Economic Crimes Department'),
  ('family-prosecution', 'نيابة الأسرة', 'Family Prosecution'),
  ('traffic-prosecution', 'نيابة المرور', 'Traffic Prosecution')
on conflict (code) do update set name_ar = excluded.name_ar, name_en = excluded.name_en, active = true;
