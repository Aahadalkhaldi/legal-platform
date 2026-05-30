"use client";

import Link from "next/link";
import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, LogOut, RefreshCw } from "lucide-react";
import { requestApiWithSession, SessionRequiredError } from "@/lib/api/browser-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { normalizePlatformRole } from "@/lib/access-control";

type MeResponse = {
  data: {
    onboardingRequired?: boolean;
    code?: string;
    role?: string;
    userId?: string;
    email?: string | null;
  };
};

type MatterSummary = {
  id: string;
  matterNumber: string | null;
  title: string;
  status: string;
  intakeType: string | null;
  intakeWorkflowStatus: "draft" | "active" | "pending_documents";
  updatedAt: string;
  proceedingCount: number;
};

type MatterListResponse = {
  data: MatterSummary[];
  page: {
    nextCursor: string | null;
    limit: number;
  };
};

type MatterDetail = {
  id: string;
  matterNumber: string | null;
  title: string | null;
  status: string | null;
  intakeType: string | null;
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
  requestId: string;
};

export default function ClientPortalPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [viewer, setViewer] = useState<MeResponse["data"] | null>(null);
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState<string>("");
  const [selectedMatter, setSelectedMatter] = useState<MatterDetail | null>(null);
  const [selectedMatterLoading, setSelectedMatterLoading] = useState(false);
  const [selectedMatterError, setSelectedMatterError] = useState<string | null>(null);

  const loadSelectedMatter = useCallback(async (matterId: string) => {
    if (!supabase || !matterId) {
      setSelectedMatter(null);
      return;
    }

    setSelectedMatterLoading(true);
    setSelectedMatterError(null);
    try {
      const payload = await requestApiWithSession<MatterDetailResponse>(supabase, `/api/v1/matters/${matterId}`);
      setSelectedMatter(payload.data);
    } catch (error) {
      setSelectedMatter(null);
      setSelectedMatterError(error instanceof Error ? error.message : "Failed to load matter details.");
    } finally {
      setSelectedMatterLoading(false);
    }
  }, [supabase]);

  const loadPortal = useCallback(async () => {
    if (!supabase) return;
    setErrorMessage(null);

    const [mePayload, mattersPayload] = await Promise.all([
      requestApiWithSession<MeResponse>(supabase, "/api/v1/me"),
      requestApiWithSession<MatterListResponse>(supabase, "/api/v1/matters"),
    ]);

    const normalizedRole = normalizePlatformRole(mePayload.data.role ?? "client_portal");
    if (normalizedRole !== "client_portal") {
      router.replace("/portal/admin");
      return;
    }

    setViewer(mePayload.data);
    setMatters(mattersPayload.data ?? []);
    const preferredMatterId = selectedMatterId && (mattersPayload.data ?? []).some((row) => row.id === selectedMatterId)
      ? selectedMatterId
      : (mattersPayload.data?.[0]?.id ?? "");
    setSelectedMatterId(preferredMatterId);
    await loadSelectedMatter(preferredMatterId);
  }, [loadSelectedMatter, router, selectedMatterId, supabase]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadPortal();
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace("/login?next=/portal/client");
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Failed to refresh client portal.");
    } finally {
      setRefreshing(false);
    }
  }, [loadPortal, router]);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      setLoading(true);
      setErrorMessage(null);
      try {
        await loadPortal();
      } catch (error) {
        if (error instanceof SessionRequiredError) {
          router.replace("/login?next=/portal/client");
          return;
        }
        if (!isMounted) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load client portal.");
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void bootstrap();
    return () => {
      isMounted = false;
    };
  }, [loadPortal, router]);

  const proceedings = selectedMatter?.proceedings ?? [];
  const documents = proceedings.flatMap((proceeding) => proceeding.documents.map((row) => ({ proceeding, row })));
  const updates = proceedings.flatMap((proceeding) => proceeding.updates.map((row) => ({ proceeding, row })));

  async function handleSignOut() {
    if (!supabase) {
      router.replace("/login");
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="app-shell">
      <div className="page-container">
        <section className="panel" style={{ marginBottom: 16 }}>
          <p className="eyebrow">Client Portal</p>
          <h1 style={{ margin: "8px 0 10px", fontSize: 32 }}>Client Workspace</h1>
          <p className="muted" style={{ marginBottom: 16 }}>
            View only shared matters, shared documents, and published updates.
          </p>
          <div className="actions">
            <button type="button" className="button button-secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
              {refreshing ? <LoaderCircle size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              Refresh
            </button>
            <Link className="button button-secondary" href="/docs/API_CONTRACTS.md">
              API Contracts
            </Link>
            <button type="button" className="button button-secondary" onClick={() => void handleSignOut()}>
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
          {viewer?.onboardingRequired ? (
            <p role="alert" style={{ color: "#b42318", marginTop: 12 }}>
              Onboarding required: {viewer.code ?? "MEMBERSHIP_NOT_FOUND"}
            </p>
          ) : null}
        </section>

        {loading ? (
          <section className="panel"><p className="muted" style={{ margin: 0 }}>Loading client portal...</p></section>
        ) : null}
        {!loading && errorMessage ? (
          <section className="panel">
            <p role="alert" style={{ color: "#b42318", margin: 0 }}>{errorMessage}</p>
          </section>
        ) : null}

        {!loading && !errorMessage ? (
          <>
            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>My Matters</h2>
              {matters.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No shared matters available yet.</p>
              ) : (
                <ul style={listStyle}>
                  {matters.map((matter) => (
                    <li key={matter.id} style={itemStyle}>
                      <div>
                        <strong>{matter.matterNumber ?? "N/A"}</strong>
                        <p className="muted" style={{ margin: "4px 0 0" }}>{matter.title}</p>
                      </div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <span className="status-chip">{matter.status}</span>
                        <button
                          type="button"
                          className="button button-secondary"
                          onClick={() => {
                            setSelectedMatterId(matter.id);
                            void loadSelectedMatter(matter.id);
                          }}
                        >
                          Open
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Shared Matter Overview</h2>
              {selectedMatterLoading ? (
                <p className="muted" style={{ margin: 0 }}>Loading matter...</p>
              ) : null}
              {selectedMatterError ? (
                <p role="alert" style={{ color: "#b42318", margin: 0 }}>{selectedMatterError}</p>
              ) : null}
              {!selectedMatterLoading && !selectedMatterError && selectedMatter ? (
                <div style={infoGridStyle}>
                  <span>Title: {selectedMatter.title ?? "N/A"}</span>
                  <span>Matter Number: {selectedMatter.matterNumber ?? "N/A"}</span>
                  <span>Status: {selectedMatter.status ?? "N/A"}</span>
                  <span>Intake Type: {selectedMatter.intakeType ?? "N/A"}</span>
                </div>
              ) : null}
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Shared Documents</h2>
              {documents.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No shared documents yet.</p>
              ) : (
                <ul style={listStyle}>
                  {documents.slice(0, 20).map(({ proceeding, row }, index) => (
                    <li key={`${proceeding.id}-doc-${index}`}>
                      {readString(row, ["title"], "Document")} | {proceeding.actionType}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Client Updates</h2>
              {updates.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No updates published yet.</p>
              ) : (
                <ul style={listStyle}>
                  {updates.slice(0, 20).map(({ proceeding, row }, index) => (
                    <li key={`${proceeding.id}-update-${index}`}>
                      {readString(row, ["title"], "Update")} | {formatDate(readString(row, ["created_at"], null))}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <h2 style={{ marginTop: 0 }}>Client Messages</h2>
              <p className="muted" style={{ marginBottom: 8 }}>
                Messaging API will be connected in a future step. This placeholder is intentionally read-only.
              </p>
              <div style={placeholderStyle}>
                <p style={{ margin: 0 }}>
                  No messages yet.
                </p>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

const listStyle: CSSProperties = { margin: 0, paddingInlineStart: 18, display: "grid", gap: 10 };
const itemStyle: CSSProperties = {
  listStyle: "none",
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 12,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};
const infoGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};
const placeholderStyle: CSSProperties = {
  border: "1px dashed var(--line)",
  borderRadius: 8,
  padding: 12,
  background: "rgba(255,255,255,0.7)",
};

function formatDate(value: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function readString(record: Record<string, unknown>, keys: string[], fallback: string | null) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return fallback;
}
