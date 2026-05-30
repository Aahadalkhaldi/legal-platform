"use client";

import Link from "next/link";
import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  FileText,
  Gauge,
  LoaderCircle,
  LogOut,
  MessageSquareText,
  RefreshCw,
} from "lucide-react";
import { normalizePlatformRole } from "@/lib/access-control";
import { requestApiWithSession, SessionRequiredError } from "@/lib/api/browser-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type ClientSection = "dashboard" | "matters" | "matter-detail";

type MeResponse = {
  data: {
    onboardingRequired?: boolean;
    code?: string;
    role?: string;
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
  proceedings: Array<{
    id: string;
    actionType: string;
    stage: string;
    status: string;
    caseNumber: string | null;
    reportNumber: string | null;
    documents: Array<Record<string, unknown>>;
    updates: Array<Record<string, unknown>>;
  }>;
};

type MatterDetailResponse = {
  data: MatterDetail;
};

type SharedDocument = {
  id: string;
  title: string;
  matterTitle: string;
  proceedingLabel: string;
  updatedAt: string | null;
};

type SharedUpdate = {
  id: string;
  title: string;
  matterTitle: string;
  proceedingLabel: string;
  createdAt: string | null;
};

const navItems = [
  { section: "dashboard", href: "/client/dashboard", label: "لوحة الموكل", icon: Gauge },
  { section: "matters", href: "/client/matters", label: "مسائلي", icon: BriefcaseBusiness },
  { section: "matter-detail", href: "/client/matters", label: "التفاصيل", icon: FileText },
] as const;

export default function ClientPortalClient({
  section,
  matterId,
}: {
  section: ClientSection;
  matterId?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [viewer, setViewer] = useState<MeResponse["data"] | null>(null);
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [selectedMatter, setSelectedMatter] = useState<MatterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detailWarning, setDetailWarning] = useState<string | null>(null);

  const loadMatter = useCallback(async (targetMatterId: string | null) => {
    if (!supabase || !targetMatterId) {
      setSelectedMatter(null);
      setDetailWarning(null);
      return;
    }

    try {
      const payload = await requestApiWithSession<MatterDetailResponse>(supabase, `/api/v1/matters/${targetMatterId}`);
      setSelectedMatter(payload.data);
      setDetailWarning(null);
    } catch (error) {
      setSelectedMatter(null);
      setDetailWarning(portalErrorMessage(error));
    }
  }, [supabase]);

  const loadClient = useCallback(async () => {
    if (!supabase) return;
    setErrorMessage(null);

    const [mePayload, mattersPayload] = await Promise.all([
      requestApiWithSession<MeResponse>(supabase, "/api/v1/me"),
      requestApiWithSession<MatterListResponse>(supabase, "/api/v1/matters?limit=25"),
    ]);

    const normalizedRole = normalizePlatformRole(mePayload.data.role ?? "client_portal");
    if (normalizedRole !== "client_portal" && !mePayload.data.onboardingRequired) {
      router.replace("/admin/dashboard");
      return;
    }

    const rows = mattersPayload.data ?? [];
    setViewer(mePayload.data);
    setMatters(rows);
    await loadMatter(matterId ?? rows[0]?.id ?? null);
  }, [loadMatter, matterId, router, supabase]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadClient();
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent(matterId ? `/client/matters/${matterId}` : `/client/${section}`)}`);
        return;
      }
      setErrorMessage(portalErrorMessage(error));
    } finally {
      setRefreshing(false);
    }
  }, [loadClient, matterId, router, section]);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      setLoading(true);
      try {
        await loadClient();
      } catch (error) {
        if (error instanceof SessionRequiredError) {
          router.replace(`/login?next=${encodeURIComponent(matterId ? `/client/matters/${matterId}` : `/client/${section}`)}`);
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
  }, [loadClient, matterId, router, section]);

  async function signOut() {
    if (!supabase) {
      router.replace("/login");
      return;
    }
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const documents = aggregateDocuments(selectedMatter);
  const updates = aggregateUpdates(selectedMatter);

  return (
    <main className="app-shell" dir="rtl">
      <div className="page-container">
        <header className="topbar">
          <div className="brand-mark">
            <span className="brand-icon">ا</span>
            <div>
              <div className="eyebrow">Aletefaq Client Portal</div>
              <strong>بوابة موكلي مكتب الاتفاق</strong>
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

        <nav className="panel" aria-label="تنقل بوابة الموكل" style={navStyle}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.section === section || (section === "matter-detail" && item.section === "matters");
            return (
              <Link key={item.href + item.section} href={item.href} className={active ? "button button-primary" : "button button-secondary"}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {loading ? (
          <section className="panel"><p className="muted" style={{ margin: 0 }}>جاري تحميل بوابة الموكل...</p></section>
        ) : null}

        {!loading && errorMessage ? (
          <section className="panel">
            <p role="alert" style={errorStyle}>{errorMessage}</p>
          </section>
        ) : null}

        {!loading && !errorMessage ? (
          <>
            {viewer?.onboardingRequired ? (
              <section className="panel" style={{ marginBottom: 16 }}>
                <p role="alert" style={errorStyle}>الحساب يحتاج تهيئة: {viewer.code ?? "MEMBERSHIP_NOT_FOUND"}</p>
              </section>
            ) : null}
            {detailWarning ? (
              <section className="panel" style={{ marginBottom: 16 }}>
                <p role="alert" style={errorStyle}>{detailWarning}</p>
              </section>
            ) : null}
            {section === "dashboard" ? <Dashboard matters={matters} documents={documents} updates={updates} /> : null}
            {section === "matters" ? <MattersList matters={matters} /> : null}
            {section === "matter-detail" ? <MatterDetailView matter={selectedMatter} documents={documents} updates={updates} /> : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

function Dashboard({
  matters,
  documents,
  updates,
}: {
  matters: MatterSummary[];
  documents: SharedDocument[];
  updates: SharedUpdate[];
}) {
  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <p className="eyebrow">لوحة الموكل</p>
        <h1 style={pageTitleStyle}>متابعة الملفات المشتركة</h1>
        <div style={metricGridStyle}>
          <Metric label="المسائل المشتركة" value={matters.length} />
          <Metric label="المستندات المشتركة" value={documents.length} />
          <Metric label="التحديثات المنشورة" value={updates.length} />
        </div>
      </section>
      <section className="panel">
        <h2 style={sectionTitleStyle}>آخر التحديثات</h2>
        {updates.length === 0 ? <EmptyState text="لا توجد تحديثات منشورة بعد." /> : (
          <div style={cardGridStyle}>
            {updates.slice(0, 6).map((update) => (
              <article key={update.id} style={cardStyle}>
                <strong>{update.title}</strong>
                <span className="muted">{update.matterTitle} - {update.proceedingLabel}</span>
                <span>{formatDate(update.createdAt)}</span>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function MattersList({ matters }: { matters: MatterSummary[] }) {
  return (
    <section className="panel">
      <p className="eyebrow">مسائلي</p>
      <h1 style={pageTitleStyle}>المسائل المتاحة للموكل</h1>
      {matters.length === 0 ? <EmptyState text="لا توجد مسائل مشتركة مع هذا الحساب." /> : (
        <div style={cardGridStyle}>
          {matters.map((matter) => (
            <article key={matter.id} style={cardStyle}>
              <strong>{matter.title}</strong>
              <span className="muted">رقم المسألة: {matter.matterNumber ?? "غير محدد"}</span>
              <span>الحالة: {matter.status}</span>
              <span>آخر تحديث: {formatDate(matter.updatedAt)}</span>
              <Link className="button button-secondary" href={`/client/matters/${matter.id}`} style={{ width: "fit-content" }}>
                فتح التفاصيل
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function MatterDetailView({
  matter,
  documents,
  updates,
}: {
  matter: MatterDetail | null;
  documents: SharedDocument[];
  updates: SharedUpdate[];
}) {
  if (!matter) {
    return (
      <section className="panel">
        <EmptyState text="لم يتم العثور على مسألة مشتركة بهذا الرابط." />
      </section>
    );
  }

  return (
    <>
      <section className="panel" style={{ marginBottom: 16 }}>
        <p className="eyebrow">تفاصيل المسألة</p>
        <h1 style={pageTitleStyle}>{matter.title ?? "مسألة بدون عنوان"}</h1>
        <div style={infoGridStyle}>
          <span>رقم المسألة: {matter.matterNumber ?? "غير محدد"}</span>
          <span>الحالة: {matter.status ?? "غير محدد"}</span>
          <span>النوع: {matter.intakeType ?? "غير محدد"}</span>
          <span>آخر تحديث: {formatDate(matter.updatedAt)}</span>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 style={sectionTitleStyle}>الإجراءات المشتركة</h2>
        {matter.proceedings.length === 0 ? <EmptyState text="لا توجد إجراءات مشتركة بعد." /> : (
          <div style={cardGridStyle}>
            {matter.proceedings.map((proceeding) => (
              <article key={proceeding.id} style={cardStyle}>
                <strong>{proceeding.actionType}</strong>
                <span className="muted">{proceeding.caseNumber ?? proceeding.reportNumber ?? "بدون رقم"}</span>
                <span>المرحلة: {proceeding.stage}</span>
                <span>الحالة: {proceeding.status}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 style={sectionTitleStyle}>المستندات المشتركة</h2>
        {documents.length === 0 ? <EmptyState text="لا توجد مستندات مشتركة لهذه المسألة." /> : (
          <div style={cardGridStyle}>
            {documents.map((document) => (
              <article key={document.id} style={cardStyle}>
                <strong>{document.title}</strong>
                <span className="muted">{document.proceedingLabel}</span>
                <span>آخر تحديث: {formatDate(document.updatedAt)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h2 style={sectionTitleStyle}>التحديثات</h2>
        {updates.length === 0 ? <EmptyState text="لا توجد تحديثات منشورة لهذه المسألة." /> : (
          <div style={cardGridStyle}>
            {updates.map((update) => (
              <article key={update.id} style={cardStyle}>
                <strong>{update.title}</strong>
                <span className="muted">{update.proceedingLabel}</span>
                <span>{formatDate(update.createdAt)}</span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h2 style={sectionTitleStyle}>الرسائل</h2>
        <div style={placeholderStyle}>
          <MessageSquareText size={18} />
          <span>لا توجد رسائل حالياً.</span>
        </div>
      </section>
    </>
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

function aggregateDocuments(matter: MatterDetail | null): SharedDocument[] {
  if (!matter) return [];
  return matter.proceedings.flatMap((proceeding) =>
    proceeding.documents.map((document, index) => ({
      id: stringValue(document.id) ?? `${matter.id}-${proceeding.id}-document-${index}`,
      title: stringValue(document.title) ?? "مستند بدون عنوان",
      matterTitle: matter.title ?? matter.matterNumber ?? matter.id,
      proceedingLabel: proceeding.caseNumber ?? proceeding.reportNumber ?? proceeding.actionType,
      updatedAt: stringValue(document.updated_at),
    })),
  );
}

function aggregateUpdates(matter: MatterDetail | null): SharedUpdate[] {
  if (!matter) return [];
  return matter.proceedings.flatMap((proceeding) =>
    proceeding.updates.map((update, index) => ({
      id: stringValue(update.id) ?? `${matter.id}-${proceeding.id}-update-${index}`,
      title: stringValue(update.title) ?? "تحديث",
      matterTitle: matter.title ?? matter.matterNumber ?? matter.id,
      proceedingLabel: proceeding.caseNumber ?? proceeding.reportNumber ?? proceeding.actionType,
      createdAt: stringValue(update.created_at),
    })),
  );
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
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
};

const infoGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

const placeholderStyle: CSSProperties = {
  alignItems: "center",
  background: "rgba(255,255,255,0.7)",
  border: "1px dashed var(--line)",
  borderRadius: 8,
  display: "flex",
  gap: 8,
  padding: 12,
};

const errorStyle: CSSProperties = {
  color: "#b42318",
  margin: 0,
};
