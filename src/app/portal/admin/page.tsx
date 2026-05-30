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
    permissions?: string[];
    inheritedPermissions?: string[];
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
  openedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  clientName: string | null;
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
  description: string | null;
  status: string | null;
  intakeType: string | null;
  intakeWorkflowStatus: string;
  openedAt: string | null;
  closedAt: string | null;
  updatedAt: string | null;
  client: {
    id: string | null;
    userId: string | null;
    fullName: string | null;
  } | null;
  proceedings: Array<{
    id: string;
    actionType: string;
    stage: string;
    status: string;
    caseNumber: string | null;
    reportNumber: string | null;
    hearings: Array<Record<string, unknown>>;
    documents: Array<Record<string, unknown>>;
    tasks: Array<Record<string, unknown>>;
    updates: Array<Record<string, unknown>>;
    parties: Array<Record<string, unknown>>;
    fees: Array<Record<string, unknown>>;
    deadlines: Array<Record<string, unknown>>;
  }>;
};

type MatterDetailResponse = {
  data: MatterDetail;
  requestId: string;
};

export default function AdminPortalPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState<string>("");
  const [selectedMatter, setSelectedMatter] = useState<MatterDetail | null>(null);
  const [selectedMatterLoading, setSelectedMatterLoading] = useState(false);
  const [selectedMatterError, setSelectedMatterError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<MeResponse["data"] | null>(null);

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
      setSelectedMatterError(error instanceof Error ? error.message : "Failed to load matter workspace data.");
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
    if (normalizedRole === "client_portal") {
      router.replace("/portal/client");
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
        router.replace("/login?next=/portal/admin");
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Failed to refresh admin portal.");
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
          router.replace("/login?next=/portal/admin");
          return;
        }
        if (!isMounted) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load admin portal.");
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
  const hearings = proceedings.flatMap((proceeding) => proceeding.hearings.map((row) => ({ proceeding, row })));
  const documents = proceedings.flatMap((proceeding) => proceeding.documents.map((row) => ({ proceeding, row })));
  const tasks = proceedings.flatMap((proceeding) => proceeding.tasks.map((row) => ({ proceeding, row })));
  const notifications = proceedings.flatMap((proceeding) => proceeding.updates.map((row) => ({ proceeding, row })));
  const billing = proceedings.flatMap((proceeding) => proceeding.fees.map((row) => ({ proceeding, row })));
  const parties = proceedings.flatMap((proceeding) => proceeding.parties.map((row) => ({ proceeding, row })));
  const clientNames = (() => {
    const names = new Set<string>();
    for (const matter of matters) {
      if (matter.clientName) names.add(matter.clientName);
    }
    if (selectedMatter?.client?.fullName) {
      names.add(selectedMatter.client.fullName);
    }
    return Array.from(names);
  })();

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
          <p className="eyebrow">Admin Portal</p>
          <h1 style={{ margin: "8px 0 10px", fontSize: 32 }}>Office Workspace</h1>
          <p className="muted" style={{ marginBottom: 16 }}>
            Connected MVP using existing APIs and current schema.
          </p>
          <div className="actions">
            <button type="button" className="button button-secondary" onClick={() => void handleRefresh()} disabled={refreshing}>
              {refreshing ? <LoaderCircle size={18} className="animate-spin" /> : <RefreshCw size={18} />}
              Refresh
            </button>
            <Link className="button button-secondary" href="/matters">
              Open Matters Workspace
            </Link>
            <Link className="button button-secondary" href="/matters/intake">
              Intake MVP
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
          <section className="panel"><p className="muted" style={{ margin: 0 }}>Loading admin portal...</p></section>
        ) : null}
        {!loading && errorMessage ? (
          <section className="panel">
            <p role="alert" style={{ color: "#b42318", margin: 0 }}>{errorMessage}</p>
          </section>
        ) : null}

        {!loading && !errorMessage ? (
          <>
            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Users & Permissions</h2>
              <div style={infoGridStyle}>
                <span>Role: {viewer?.role ?? "N/A"}</span>
                <span>User: {viewer?.email ?? viewer?.userId ?? "N/A"}</span>
                <span>Direct permissions: {(viewer?.permissions ?? []).length}</span>
                <span>Inherited permissions: {(viewer?.inheritedPermissions ?? []).length}</span>
              </div>
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Matters</h2>
              {matters.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No matters found.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--line)", textAlign: "left" }}>
                        <th style={thStyle}>Matter</th>
                        <th style={thStyle}>Status</th>
                        <th style={thStyle}>Client</th>
                        <th style={thStyle}>Proceedings</th>
                        <th style={thStyle}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matters.map((matter) => (
                        <tr key={matter.id} style={{ borderBottom: "1px solid var(--line)" }}>
                          <td style={tdStyle}>
                            <strong>{matter.matterNumber ?? "N/A"}</strong>
                            <p className="muted" style={{ margin: "4px 0 0" }}>{matter.title}</p>
                          </td>
                          <td style={tdStyle}>{matter.status}</td>
                          <td style={tdStyle}>{matter.clientName ?? "N/A"}</td>
                          <td style={tdStyle}>{matter.proceedingCount}</td>
                          <td style={tdStyle}>
                            <button
                              type="button"
                              className="button button-secondary"
                              onClick={() => {
                                setSelectedMatterId(matter.id);
                                void loadSelectedMatter(matter.id);
                              }}
                            >
                              Load
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Overview</h2>
              {selectedMatterLoading ? (
                <p className="muted" style={{ margin: 0 }}>Loading selected matter...</p>
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
                  <span>Client: {selectedMatter.client?.fullName ?? "N/A"}</span>
                  <span>Updated: {formatDate(selectedMatter.updatedAt)}</span>
                </div>
              ) : null}
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Clients</h2>
              {clientNames.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No clients linked yet.</p>
              ) : (
                <ul style={listStyle}>
                  {clientNames.map((name) => <li key={name}>{name}</li>)}
                </ul>
              )}
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Parties</h2>
              {parties.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No parties available for selected matter.</p>
              ) : (
                <ul style={listStyle}>
                  {parties.slice(0, 12).map(({ proceeding, row }, index) => {
                    const partyName = readString(row, ["display_name", "party_name", "full_name"], "Unnamed party");
                    const partyRole = readString(row, ["participant_type", "legal_capacity"], "related_party");
                    return (
                      <li key={`${proceeding.id}-${index}`}>
                        {partyName} ({partyRole}) - {proceeding.actionType}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Proceedings</h2>
              {proceedings.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No proceedings for selected matter.</p>
              ) : (
                <ul style={listStyle}>
                  {proceedings.map((row) => (
                    <li key={row.id}>
                      {row.actionType} | {row.stage} | {row.status} | {row.caseNumber ?? row.reportNumber ?? row.id}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Hearings</h2>
              {hearings.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No hearings available.</p>
              ) : (
                <ul style={listStyle}>
                  {hearings.slice(0, 20).map(({ proceeding, row }, index) => (
                    <li key={`${proceeding.id}-hearing-${index}`}>
                      {proceeding.actionType} | {formatDate(readString(row, ["hearing_at"], null))} | {readString(row, ["status"], "N/A")}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Documents</h2>
              {documents.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No documents available.</p>
              ) : (
                <ul style={listStyle}>
                  {documents.slice(0, 20).map(({ proceeding, row }, index) => (
                    <li key={`${proceeding.id}-doc-${index}`}>
                      {readString(row, ["title"], "Untitled document")} | {proceeding.actionType}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Tasks</h2>
              {tasks.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No tasks available.</p>
              ) : (
                <ul style={listStyle}>
                  {tasks.slice(0, 20).map(({ proceeding, row }, index) => (
                    <li key={`${proceeding.id}-task-${index}`}>
                      {readString(row, ["title"], "Untitled task")} | {readString(row, ["status"], "N/A")}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Notifications</h2>
              {notifications.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No notifications available.</p>
              ) : (
                <ul style={listStyle}>
                  {notifications.slice(0, 20).map(({ proceeding, row }, index) => (
                    <li key={`${proceeding.id}-update-${index}`}>
                      {readString(row, ["title"], "Update")} | {proceeding.actionType}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Billing</h2>
              {billing.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No billing records available.</p>
              ) : (
                <ul style={listStyle}>
                  {billing.slice(0, 20).map(({ proceeding, row }, index) => (
                    <li key={`${proceeding.id}-bill-${index}`}>
                      {readString(row, ["invoice_number"], "Invoice")} | Balance: {readNumber(row, ["balance_due", "total_amount"])}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel">
              <h2 style={{ marginTop: 0 }}>Workspace Links</h2>
              {selectedMatter ? (
                <div className="actions">
                  <Link className="button button-secondary" href={`/matters/${selectedMatter.id}`}>
                    Open Matter Workspace
                  </Link>
                  <Link className="button button-secondary" href="/docs/API_CONTRACTS.md">
                    API Contracts
                  </Link>
                  <Link className="button button-secondary" href="/docs/SECURITY.md">
                    Security
                  </Link>
                </div>
              ) : (
                <p className="muted" style={{ margin: 0 }}>Select a matter to open workspace links.</p>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

const thStyle: CSSProperties = { padding: "10px 8px" };
const tdStyle: CSSProperties = { padding: "10px 8px", verticalAlign: "top" };
const listStyle: CSSProperties = { margin: 0, paddingInlineStart: 18, display: "grid", gap: 8 };
const infoGridStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
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

function readNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value.toFixed(2);
    }
  }
  return "N/A";
}
