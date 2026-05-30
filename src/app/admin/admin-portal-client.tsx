"use client";

import Link from "next/link";
import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  FileText,
  Gauge,
  LogOut,
  RefreshCw,
  UserRound,
  ListTodo,
  LoaderCircle,
} from "lucide-react";
import { normalizePlatformRole } from "@/lib/access-control";
import { requestApiWithSession, SessionRequiredError } from "@/lib/api/browser-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type AdminSection = "dashboard" | "matters" | "clients" | "tasks" | "documents";

type MeResponse = {
  data: {
    onboardingRequired?: boolean;
    code?: string;
    role?: string;
    permissions?: string[];
    inheritedPermissions?: string[];
    email?: string | null;
    userId?: string;
  };
};

type MatterSummary = {
  id: string;
  matterNumber: string | null;
  title: string;
  status: string;
  intakeType: string | null;
  updatedAt: string;
  clientName: string | null;
  proceedingCount: number;
};

type MatterListResponse = {
  data: MatterSummary[];
};

type MatterDetail = {
  id: string;
  matterNumber: string | null;
  title: string | null;
  status: string | null;
  intakeType: string | null;
  updatedAt: string | null;
  client: {
    id: string | null;
    fullName: string | null;
  } | null;
  proceedings: Array<{
    id: string;
    actionType: string;
    stage: string;
    status: string;
    caseNumber: string | null;
    reportNumber: string | null;
    documents: Array<Record<string, unknown>>;
    tasks: Array<Record<string, unknown>>;
  }>;
};

type MatterDetailResponse = {
  data: MatterDetail;
};

type AggregatedTask = {
  id: string;
  matterTitle: string;
  proceedingLabel: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
};

type AggregatedDocument = {
  id: string;
  matterTitle: string;
  proceedingLabel: string;
  title: string;
  documentType: string;
  classification: string;
  updatedAt: string | null;
};

type AggregatedClient = {
  id: string;
  name: string;
  matterCount: number;
};

const navItems: Array<{ section: AdminSection; href: string; label: string; icon: typeof Gauge }> = [
  { section: "dashboard", href: "/admin/dashboard", label: "لوحة الإدارة", icon: Gauge },
  { section: "matters", href: "/admin/matters", label: "المسائل", icon: BriefcaseBusiness },
  { section: "clients", href: "/admin/clients", label: "الموكلون", icon: UserRound },
  { section: "tasks", href: "/admin/tasks", label: "المهام", icon: ListTodo },
  { section: "documents", href: "/admin/documents", label: "المستندات", icon: FileText },
];

export default function AdminPortalClient({ section }: { section: AdminSection }) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [viewer, setViewer] = useState<MeResponse["data"] | null>(null);
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [matterDetails, setMatterDetails] = useState<MatterDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detailWarning, setDetailWarning] = useState<string | null>(null);

  const loadMatterDetails = useCallback(async (matterRows: MatterSummary[]) => {
    if (!supabase || matterRows.length === 0) {
      setMatterDetails([]);
      setDetailWarning(null);
      return;
    }

    const results = await Promise.allSettled(
      matterRows.slice(0, 20).map((matter) =>
        requestApiWithSession<MatterDetailResponse>(supabase, `/api/v1/matters/${matter.id}`),
      ),
    );

    const details: MatterDetail[] = [];
    const firstError = results.find((result) => result.status === "rejected");
    for (const result of results) {
      if (result.status === "fulfilled") {
        details.push(result.value.data);
      }
    }

    setMatterDetails(details);
    setDetailWarning(firstError && firstError.status === "rejected" ? portalErrorMessage(firstError.reason) : null);
  }, [supabase]);

  const loadAdmin = useCallback(async () => {
    if (!supabase) return;
    setErrorMessage(null);

    const [mePayload, mattersPayload] = await Promise.all([
      requestApiWithSession<MeResponse>(supabase, "/api/v1/me"),
      requestApiWithSession<MatterListResponse>(supabase, "/api/v1/matters?limit=25"),
    ]);

    const normalizedRole = normalizePlatformRole(mePayload.data.role ?? "client_portal");
    if (normalizedRole === "client_portal") {
      router.replace("/client/dashboard");
      return;
    }

    const rows = mattersPayload.data ?? [];
    setViewer(mePayload.data);
    setMatters(rows);
    await loadMatterDetails(rows);
  }, [loadMatterDetails, router, supabase]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAdmin();
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent(`/admin/${section}`)}`);
        return;
      }
      setErrorMessage(portalErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, [loadAdmin, router, section]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setLoading(true);
      try {
        await loadAdmin();
      } catch (error) {
        if (error instanceof SessionRequiredError) {
          router.replace(`/login?next=${encodeURIComponent(`/admin/${section}`)}`);
          return;
        }
        if (mounted) setErrorMessage(portalErrorMessage(error));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [loadAdmin, router, section]);

  async function signOut() {
    if (!supabase) {
      router.replace("/login");
      return;
    }
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const tasks = aggregateTasks(matterDetails);
  const documents = aggregateDocuments(matterDetails);
  const clients = aggregateClients(matters, matterDetails);
  const proceedingsCount = matterDetails.reduce((total, matter) => total + matter.proceedings.length, 0);

  return (
    <main className="app-shell" dir="rtl">
      <div className="page-container">
        <header className="topbar">
          <div className="brand-mark">
            <span className="brand-icon">ا</span>
            <div>
              <div className="eyebrow">Aletefaq Legal Platform</div>
              <strong>منصة الاتفاق لإدارة أعمال المكتب</strong>
            </div>
          </div>
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="button button-secondary" type="button" onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? <LoaderCircle size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              تحديث
            </button>
            <button className="button button-secondary" type="button" onClick={() => void signOut()}>
              <LogOut size={18} />
              خروج
            </button>
          </div>
        </header>

        <nav className="panel" aria-label="تنقل الإدارة" style={navStyle}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.section === section;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "button button-primary" : "button button-secondary"}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {loading ? (
          <section className="panel"><p className="muted" style={{ margin: 0 }}>جاري تحميل بيانات المكتب...</p></section>
        ) : null}

        {!loading && errorMessage ? (
          <section className="panel">
            <p role="alert" style={errorStyle}>{errorMessage}</p>
          </section>
        ) : null}

        {!loading && !errorMessage ? (
          <>
            {detailWarning ? (
              <section className="panel" style={{ marginBottom: 16 }}>
                <p role="alert" style={errorStyle}>{detailWarning}</p>
              </section>
            ) : null}
            {section === "dashboard" ? (
              <Dashboard matters={matters} clients={clients} tasks={tasks} documents={documents} proceedingsCount={proceedingsCount} viewer={viewer} />
            ) : null}
            {section === "matters" ? <MattersTable matters={matters} /> : null}
            {section === "clients" ? <ClientsList clients={clients} /> : null}
            {section === "tasks" ? <TasksList tasks={tasks} /> : null}
            {section === "documents" ? <DocumentsList documents={documents} /> : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function Dashboard(props: {
  matters: MatterSummary[];
  clients: AggregatedClient[];
  tasks: AggregatedTask[];
  documents: AggregatedDocument[];
  proceedingsCount: number;
  viewer: MeResponse["data"] | null;
}) {
  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <p className="eyebrow">لوحة الإدارة</p>
        <h1 style={pageTitleStyle}>ملخص أعمال مكتب الاتفاق</h1>
        <div style={metricGridStyle}>
          <Metric label="المسائل" value={props.matters.length} />
          <Metric label="الموكلون" value={props.clients.length} />
          <Metric label="الإجراءات" value={props.proceedingsCount} />
          <Metric label="المهام" value={props.tasks.length} />
          <Metric label="المستندات" value={props.documents.length} />
        </div>
      </section>
      <section className="panel">
        <h2 style={sectionTitleStyle}>الصلاحيات الحالية</h2>
        <div style={infoGridStyle}>
          <span>الدور: {props.viewer?.role ?? "غير متوفر"}</span>
          <span>المستخدم: {props.viewer?.email ?? props.viewer?.userId ?? "غير متوفر"}</span>
          <span>الصلاحيات المباشرة: {(props.viewer?.permissions ?? []).length}</span>
          <span>الصلاحيات الموروثة: {(props.viewer?.inheritedPermissions ?? []).length}</span>
        </div>
      </section>
    </>
  );
}

function MattersTable({ matters }: { matters: MatterSummary[] }) {
  return (
    <section className="panel">
      <p className="eyebrow">المسائل القانونية</p>
      <h1 style={pageTitleStyle}>ملف المسائل</h1>
      {matters.length === 0 ? <EmptyState text="لا توجد مسائل قانونية بعد." /> : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>رقم المسألة</th>
                <th style={thStyle}>العنوان</th>
                <th style={thStyle}>الموكل</th>
                <th style={thStyle}>الحالة</th>
                <th style={thStyle}>آخر تحديث</th>
                <th style={thStyle}>فتح</th>
              </tr>
            </thead>
            <tbody>
              {matters.map((matter) => (
                <tr key={matter.id}>
                  <td style={tdStyle}>{matter.matterNumber ?? "غير محدد"}</td>
                  <td style={tdStyle}>{matter.title}</td>
                  <td style={tdStyle}>{matter.clientName ?? "غير مرتبط"}</td>
                  <td style={tdStyle}>{matter.status}</td>
                  <td style={tdStyle}>{formatDate(matter.updatedAt)}</td>
                  <td style={tdStyle}>
                    <Link className="button button-secondary" href={`/matters/${matter.id}`}>فتح</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ClientsList({ clients }: { clients: AggregatedClient[] }) {
  return (
    <section className="panel">
      <p className="eyebrow">الموكلون</p>
      <h1 style={pageTitleStyle}>قائمة الموكلين</h1>
      {clients.length === 0 ? <EmptyState text="لا توجد بيانات موكلين مرتبطة بالمسائل الحالية." /> : (
        <div style={cardGridStyle}>
          {clients.map((client) => (
            <article key={client.id} style={cardStyle}>
              <strong>{client.name}</strong>
              <span className="muted">عدد المسائل: {client.matterCount}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TasksList({ tasks }: { tasks: AggregatedTask[] }) {
  return (
    <section className="panel">
      <p className="eyebrow">المهام</p>
      <h1 style={pageTitleStyle}>مهام المكتب</h1>
      {tasks.length === 0 ? <EmptyState text="لا توجد مهام مسجلة في المسائل الحالية." /> : (
        <div style={cardGridStyle}>
          {tasks.map((task) => (
            <article key={task.id} style={cardStyle}>
              <strong>{task.title}</strong>
              <span className="muted">{task.matterTitle} - {task.proceedingLabel}</span>
              <span>الحالة: {task.status} | الأولوية: {task.priority}</span>
              <span>الاستحقاق: {formatDate(task.dueAt)}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function DocumentsList({ documents }: { documents: AggregatedDocument[] }) {
  return (
    <section className="panel">
      <p className="eyebrow">المستندات</p>
      <h1 style={pageTitleStyle}>مستندات المسائل</h1>
      {documents.length === 0 ? <EmptyState text="لا توجد مستندات متاحة في المسائل الحالية." /> : (
        <div style={cardGridStyle}>
          {documents.map((document) => (
            <article key={document.id} style={cardStyle}>
              <strong>{document.title}</strong>
              <span className="muted">{document.matterTitle} - {document.proceedingLabel}</span>
              <span>النوع: {document.documentType}</span>
              <span>التصنيف: {document.classification}</span>
              <span>آخر تحديث: {formatDate(document.updatedAt)}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span className="muted">{label}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="muted" style={{ margin: 0 }}>{text}</p>;
}

function aggregateTasks(matterDetails: MatterDetail[]) {
  return matterDetails.flatMap((matter) =>
    matter.proceedings.flatMap((proceeding) =>
      proceeding.tasks.map((task, index) => ({
        id: stringValue(task.id) ?? `${matter.id}-${proceeding.id}-task-${index}`,
        matterTitle: matter.title ?? matter.matterNumber ?? matter.id,
        proceedingLabel: proceeding.caseNumber ?? proceeding.reportNumber ?? proceeding.actionType,
        title: stringValue(task.title) ?? "مهمة بدون عنوان",
        status: stringValue(task.status) ?? "غير محدد",
        priority: stringValue(task.priority) ?? "غير محدد",
        dueAt: stringValue(task.due_at),
      })),
    ),
  );
}

function aggregateDocuments(matterDetails: MatterDetail[]) {
  return matterDetails.flatMap((matter) =>
    matter.proceedings.flatMap((proceeding) =>
      proceeding.documents.map((document, index) => ({
        id: stringValue(document.id) ?? `${matter.id}-${proceeding.id}-document-${index}`,
        matterTitle: matter.title ?? matter.matterNumber ?? matter.id,
        proceedingLabel: proceeding.caseNumber ?? proceeding.reportNumber ?? proceeding.actionType,
        title: stringValue(document.title) ?? "مستند بدون عنوان",
        documentType: stringValue(document.document_type) ?? "document",
        classification: stringValue(document.classification) ?? "غير محدد",
        updatedAt: stringValue(document.updated_at),
      })),
    ),
  );
}

function aggregateClients(matters: MatterSummary[], matterDetails: MatterDetail[]) {
  const clients = new Map<string, AggregatedClient>();
  for (const matter of matters) {
    const name = matter.clientName;
    if (!name) continue;
    const existing = clients.get(name) ?? { id: name, name, matterCount: 0 };
    existing.matterCount += 1;
    clients.set(name, existing);
  }

  for (const matter of matterDetails) {
    const name = matter.client?.fullName;
    const id = matter.client?.id ?? name;
    if (!name || !id || clients.has(id)) continue;
    clients.set(id, { id, name, matterCount: 1 });
  }

  return Array.from(clients.values());
}

function portalErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message || message === "Unexpected server error.") {
    return "تعذر تنفيذ الطلب. راجع رمز الطلب في استجابة API أو سجلات الخادم.";
  }
  return message;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function formatDate(value: string | null) {
  if (!value) return "غير محدد";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString("ar-QA");
}

const navStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 16,
};

const pageTitleStyle: CSSProperties = {
  margin: "8px 0 18px",
  fontSize: 30,
};

const sectionTitleStyle: CSSProperties = {
  marginTop: 0,
  fontSize: 22,
};

const metricGridStyle: CSSProperties = {
  display: "grid",
  gap: 14,
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
};

const infoGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  textAlign: "start",
};

const thStyle: CSSProperties = {
  borderBottom: "1px solid var(--line)",
  padding: "10px 8px",
  textAlign: "start",
};

const tdStyle: CSSProperties = {
  borderBottom: "1px solid var(--line)",
  padding: "12px 8px",
  verticalAlign: "top",
};

const cardGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
};

const cardStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  display: "grid",
  gap: 8,
  padding: 14,
};

const errorStyle: CSSProperties = {
  color: "#b42318",
  margin: 0,
};
