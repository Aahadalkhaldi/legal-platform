"use client";

import Link from "next/link";
import { FormEvent, type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, CirclePlus, LoaderCircle, LogOut, RefreshCw, Scale } from "lucide-react";
import { requestApiWithSession, SessionRequiredError } from "@/lib/api/browser-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type MatterSummary = {
  id: string;
  matterNumber: string | null;
  title: string;
  status: string;
  intakeType: IntakeType | null;
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

type CreateMatterResponse = {
  data: {
    id: string;
  };
};

type IntakeType = "lawsuit" | "complaint_report" | "consultation" | "contract_document";
type ComplaintActionType =
  | "police_report"
  | "public_prosecution_complaint"
  | "cybercrime_report"
  | "labor_complaint"
  | "administrative_complaint"
  | "regulatory_complaint";

type CreateMatterForm = {
  title: string;
  matterNumber: string;
  description: string;
  status: "open" | "on_hold" | "closed" | "archived";
  intakeType: IntakeType;
  lawsuitCaseNumber: string;
  lawsuitCourtId: string;
  lawsuitCircuit: string;
  lawsuitDepartment: string;
  lawsuitClaimType: string;
  complaintActionType: ComplaintActionType;
  complaintAuthority: string;
  complaintReportNumber: string;
  complaintSubmissionDate: string;
  complaintComplainant: string;
  complaintRespondent: string;
  complaintProsecutorName: string;
  complaintPoliceStation: string;
};

const EMPTY_FORM: CreateMatterForm = {
  title: "",
  matterNumber: "",
  description: "",
  status: "open",
  intakeType: "lawsuit",
  lawsuitCaseNumber: "",
  lawsuitCourtId: "",
  lawsuitCircuit: "",
  lawsuitDepartment: "",
  lawsuitClaimType: "",
  complaintActionType: "police_report",
  complaintAuthority: "",
  complaintReportNumber: "",
  complaintSubmissionDate: "",
  complaintComplainant: "",
  complaintRespondent: "",
  complaintProsecutorName: "",
  complaintPoliceStation: "",
};

export default function MattersPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [matters, setMatters] = useState<MatterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<CreateMatterForm>(EMPTY_FORM);
  const [createErrorMessage, setCreateErrorMessage] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const fetchMatters = useCallback(async () => {
    return requestApiWithSession<MatterListResponse>(supabase, "/api/v1/matters");
  }, [supabase]);

  const loadMatters = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const payload = await fetchMatters();
      setMatters(payload.data ?? []);
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent("/matters")}`);
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Failed to load matters.");
    } finally {
      setLoading(false);
    }
  }, [fetchMatters, router]);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const payload = await fetchMatters();
        if (!isMounted) return;
        setMatters(payload.data ?? []);
      } catch (error) {
        if (error instanceof SessionRequiredError) {
          router.replace(`/login?next=${encodeURIComponent("/matters")}`);
          return;
        }

        if (!isMounted) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load matters.");
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
  }, [fetchMatters, router]);

  async function handleCreateMatter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setCreateErrorMessage(null);

    try {
      const matterPayload = await requestApiWithSession<CreateMatterResponse>(supabase, "/api/v1/matters", {
        method: "POST",
        body: JSON.stringify({
          title: createForm.title.trim(),
          matterNumber: createForm.matterNumber.trim() || undefined,
          description: createForm.description.trim() || undefined,
          status: createForm.status,
          intakeType: createForm.intakeType,
        }),
      });

      const matterId = matterPayload.data.id;
      if (createForm.intakeType === "lawsuit") {
        await requestApiWithSession(supabase, `/api/v1/matters/${matterId}/proceedings`, {
          method: "POST",
          body: JSON.stringify({
            actionType: "lawsuit",
            caseNumber: createForm.lawsuitCaseNumber.trim() || undefined,
            courtId: createForm.lawsuitCourtId.trim() || undefined,
            circuit: createForm.lawsuitCircuit.trim() || undefined,
            department: createForm.lawsuitDepartment.trim() || undefined,
            claimType: createForm.lawsuitClaimType.trim() || undefined,
          }),
        });
      } else if (createForm.intakeType === "complaint_report") {
        await requestApiWithSession(supabase, `/api/v1/matters/${matterId}/proceedings`, {
          method: "POST",
          body: JSON.stringify({
            actionType: createForm.complaintActionType,
            authority: createForm.complaintAuthority.trim() || undefined,
            reportNumber: createForm.complaintReportNumber.trim() || undefined,
            submissionDate: toIsoOrUndefined(createForm.complaintSubmissionDate),
            complainant: createForm.complaintComplainant.trim() || undefined,
            respondent: createForm.complaintRespondent.trim() || undefined,
            prosecutorName: createForm.complaintProsecutorName.trim() || undefined,
            policeStation: createForm.complaintPoliceStation.trim() || undefined,
          }),
        });
      }

      setCreateForm(EMPTY_FORM);
      setShowCreateForm(false);
      await loadMatters();
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent("/matters")}`);
        return;
      }

      setCreateErrorMessage(error instanceof Error ? error.message : "Failed to create legal matter.");
    } finally {
      setIsCreating(false);
    }
  }

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
          <p className="eyebrow">Legal Matter Lifecycle</p>
          <h1 style={{ margin: "8px 0 12px", fontSize: 34 }}>Matters List</h1>
          <p className="muted" style={{ marginBottom: 18 }}>
            Manage lawsuits, complaints/reports, consultations, and contract/document matters in one lifecycle.
          </p>

          <div className="actions">
            <button className="button button-primary" type="button" onClick={() => setShowCreateForm((value) => !value)}>
              <CirclePlus size={18} />
              {showCreateForm ? "Hide Form" : "Create Legal Matter"}
            </button>
            <button className="button button-secondary" type="button" onClick={() => void loadMatters()} disabled={loading}>
              <RefreshCw size={18} />
              Refresh
            </button>
            <Link className="button button-secondary" href="/docs/API_CONTRACTS.md">
              <Scale size={18} />
              API Contracts
            </Link>
            <button className="button button-secondary" type="button" onClick={() => void handleSignOut()}>
              <LogOut size={18} />
              Sign Out
            </button>
          </div>

          {showCreateForm ? (
            <form onSubmit={handleCreateMatter} style={{ marginTop: 18, display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Title</span>
                <input
                  required
                  value={createForm.title}
                  onChange={(event) => setCreateForm((value) => ({ ...value, title: event.target.value }))}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Matter Number</span>
                <input
                  value={createForm.matterNumber}
                  onChange={(event) => setCreateForm((value) => ({ ...value, matterNumber: event.target.value }))}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Description</span>
                <textarea
                  rows={4}
                  value={createForm.description}
                  onChange={(event) => setCreateForm((value) => ({ ...value, description: event.target.value }))}
                  style={{ ...inputStyle, resize: "vertical", padding: 10 }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Status</span>
                <select
                  value={createForm.status}
                  onChange={(event) => {
                    const status = event.target.value as CreateMatterForm["status"];
                    setCreateForm((value) => ({ ...value, status }));
                  }}
                  style={inputStyle}
                >
                  <option value="open">open</option>
                  <option value="on_hold">on_hold</option>
                  <option value="closed">closed</option>
                  <option value="archived">archived</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Is this matter starting as?</span>
                <select
                  value={createForm.intakeType}
                  onChange={(event) => {
                    const intakeType = event.target.value as IntakeType;
                    setCreateForm((value) => ({ ...value, intakeType }));
                  }}
                  style={inputStyle}
                >
                  <option value="lawsuit">Lawsuit</option>
                  <option value="complaint_report">Complaint/Report</option>
                  <option value="consultation">Consultation</option>
                  <option value="contract_document">Contract/Document matter</option>
                </select>
              </label>

              {createForm.intakeType === "lawsuit" ? (
                <div style={subPanelStyle}>
                  <p style={subPanelTitleStyle}>Initial Lawsuit Data</p>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Case Number</span>
                    <input
                      value={createForm.lawsuitCaseNumber}
                      onChange={(event) => setCreateForm((value) => ({ ...value, lawsuitCaseNumber: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Court ID (optional UUID)</span>
                    <input
                      value={createForm.lawsuitCourtId}
                      onChange={(event) => setCreateForm((value) => ({ ...value, lawsuitCourtId: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Circuit</span>
                    <input
                      value={createForm.lawsuitCircuit}
                      onChange={(event) => setCreateForm((value) => ({ ...value, lawsuitCircuit: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Department</span>
                    <input
                      value={createForm.lawsuitDepartment}
                      onChange={(event) => setCreateForm((value) => ({ ...value, lawsuitDepartment: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Claim Type</span>
                    <input
                      value={createForm.lawsuitClaimType}
                      onChange={(event) => setCreateForm((value) => ({ ...value, lawsuitClaimType: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                </div>
              ) : null}

              {createForm.intakeType === "complaint_report" ? (
                <div style={subPanelStyle}>
                  <p style={subPanelTitleStyle}>Initial Complaint/Report Data</p>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Complaint Type</span>
                    <select
                      value={createForm.complaintActionType}
                      onChange={(event) => {
                        const complaintActionType = event.target.value as ComplaintActionType;
                        setCreateForm((value) => ({ ...value, complaintActionType }));
                      }}
                      style={inputStyle}
                    >
                      <option value="police_report">police_report</option>
                      <option value="public_prosecution_complaint">public_prosecution_complaint</option>
                      <option value="cybercrime_report">cybercrime_report</option>
                      <option value="labor_complaint">labor_complaint</option>
                      <option value="administrative_complaint">administrative_complaint</option>
                      <option value="regulatory_complaint">regulatory_complaint</option>
                    </select>
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Authority</span>
                    <input
                      value={createForm.complaintAuthority}
                      onChange={(event) => setCreateForm((value) => ({ ...value, complaintAuthority: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Report Number</span>
                    <input
                      value={createForm.complaintReportNumber}
                      onChange={(event) => setCreateForm((value) => ({ ...value, complaintReportNumber: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Submission Date</span>
                    <input
                      type="datetime-local"
                      value={createForm.complaintSubmissionDate}
                      onChange={(event) => setCreateForm((value) => ({ ...value, complaintSubmissionDate: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Complainant</span>
                    <input
                      value={createForm.complaintComplainant}
                      onChange={(event) => setCreateForm((value) => ({ ...value, complaintComplainant: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Accused/Respondent</span>
                    <input
                      value={createForm.complaintRespondent}
                      onChange={(event) => setCreateForm((value) => ({ ...value, complaintRespondent: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Prosecutor</span>
                    <input
                      value={createForm.complaintProsecutorName}
                      onChange={(event) => setCreateForm((value) => ({ ...value, complaintProsecutorName: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Police Station</span>
                    <input
                      value={createForm.complaintPoliceStation}
                      onChange={(event) => setCreateForm((value) => ({ ...value, complaintPoliceStation: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                </div>
              ) : null}

              {createErrorMessage ? (
                <p role="alert" style={{ color: "#b42318", margin: 0 }}>
                  {createErrorMessage}
                </p>
              ) : null}

              <button type="submit" className="button button-primary" style={{ width: "fit-content" }} disabled={isCreating}>
                {isCreating ? <LoaderCircle size={18} className="animate-spin" /> : <CirclePlus size={18} />}
                {isCreating ? "Creating..." : "Create"}
              </button>
            </form>
          ) : null}
        </section>

        <section className="panel">
          {loading ? (
            <p className="muted" style={{ margin: 0 }}>
              Loading matters...
            </p>
          ) : null}

          {!loading && errorMessage ? (
            <div>
              <p role="alert" style={{ color: "#b42318", marginTop: 0 }}>{errorMessage}</p>
              <button type="button" className="button button-secondary" onClick={() => void loadMatters()}>
                Retry
              </button>
            </div>
          ) : null}

          {!loading && !errorMessage && matters.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No legal matters found yet. Create your first matter.
            </p>
          ) : null}

          {!loading && !errorMessage && matters.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}>
                    <th style={{ padding: "10px 8px" }}>Matter</th>
                    <th style={{ padding: "10px 8px" }}>Type</th>
                    <th style={{ padding: "10px 8px" }}>Client</th>
                    <th style={{ padding: "10px 8px" }}>Status</th>
                    <th style={{ padding: "10px 8px" }}>Proceedings</th>
                    <th style={{ padding: "10px 8px" }}>Updated</th>
                    <th style={{ padding: "10px 8px" }}>Open</th>
                  </tr>
                </thead>
                <tbody>
                  {matters.map((row) => (
                    <tr key={row.id} style={{ borderBottom: "1px solid var(--line)" }}>
                      <td style={{ padding: "12px 8px" }}>
                        <strong>{row.matterNumber ?? "N/A"}</strong>
                        <p className="muted" style={{ marginTop: 4 }}>{row.title}</p>
                      </td>
                      <td style={{ padding: "12px 8px" }}>{row.intakeType ?? "N/A"}</td>
                      <td style={{ padding: "12px 8px" }}>{row.clientName ?? "N/A"}</td>
                      <td style={{ padding: "12px 8px" }}>{row.status}</td>
                      <td style={{ padding: "12px 8px" }}>{row.proceedingCount}</td>
                      <td style={{ padding: "12px 8px" }}>{new Date(row.updatedAt).toLocaleString()}</td>
                      <td style={{ padding: "12px 8px" }}>
                        <Link className="button button-secondary" href={`/matters/${row.id}`}>
                          <BriefcaseBusiness size={16} />
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: 8,
  minHeight: 42,
  padding: "8px 12px",
  fontSize: 14,
  background: "white",
};

const subPanelStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 12,
  display: "grid",
  gap: 10,
  background: "rgba(255, 255, 255, 0.7)",
};

const subPanelTitleStyle: CSSProperties = {
  margin: 0,
  fontWeight: 700,
  color: "var(--ink)",
};

function toIsoOrUndefined(value: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}
