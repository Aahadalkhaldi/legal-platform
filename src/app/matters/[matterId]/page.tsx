"use client";

import Link from "next/link";
import { FormEvent, type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CircleChevronRight,
  CirclePlus,
  FilePlus2,
  Gavel,
  Link2,
  LoaderCircle,
  RefreshCw,
  Scale,
} from "lucide-react";
import { requestApiWithSession, SessionRequiredError } from "@/lib/api/browser-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type MatterDetailResponse = {
  data: MatterDetail;
  requestId: string;
};

type MatterDetail = {
  id: string;
  matterNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  openedAt: string | null;
  closedAt: string | null;
  updatedAt: string;
  client: {
    id: string | null;
    userId: string | null;
    fullName: string | null;
  } | null;
  proceedings: Proceeding[];
};

type Proceeding = {
  id: string;
  parentProceedingId: string | null;
  linkedCaseId: string | null;
  stage: string;
  status: string;
  caseNumber: string | null;
  court: { id: string | null; nameAr: string | null } | null;
  department: string | null;
  filingDate: string | null;
  nextDeadlineAt: string | null;
  feesAmountQar: number | null;
  hearings: unknown[];
  documents: unknown[];
  tasks: unknown[];
  updates: unknown[];
  parties: unknown[];
  fees: unknown[];
  deadlines: unknown[];
};

type CreateProceedingForm = {
  stage: "first_instance" | "appeal" | "cassation" | "execution" | "urgent_request" | "related_case";
  status: "open" | "pending" | "on_hold" | "closed" | "archived";
  caseNumber: string;
  courtId: string;
  department: string;
  filingDate: string;
  nextDeadlineAt: string;
  feesAmountQar: string;
  linkedCaseId: string;
};

const EMPTY_PROCEEDING_FORM: CreateProceedingForm = {
  stage: "first_instance",
  status: "open",
  caseNumber: "",
  courtId: "",
  department: "",
  filingDate: "",
  nextDeadlineAt: "",
  feesAmountQar: "",
  linkedCaseId: "",
};

export default function MatterDetailPage() {
  const router = useRouter();
  const params = useParams<{ matterId?: string | string[] }>();
  const matterIdParam = params.matterId;
  const matterId = Array.isArray(matterIdParam) ? matterIdParam[0] : (matterIdParam ?? "");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [matter, setMatter] = useState<MatterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showProceedingForm, setShowProceedingForm] = useState(false);
  const [proceedingForm, setProceedingForm] = useState<CreateProceedingForm>(EMPTY_PROCEEDING_FORM);
  const [creatingProceeding, setCreatingProceeding] = useState(false);
  const [createProceedingError, setCreateProceedingError] = useState<string | null>(null);
  const [selectedProceedingId, setSelectedProceedingId] = useState<string>("");
  const [runningActionKey, setRunningActionKey] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const fetchMatter = useCallback(async () => {
    if (!matterId) {
      return null;
    }

    return requestApiWithSession<MatterDetailResponse>(supabase, `/api/v1/matters/${matterId}`);
  }, [matterId, supabase]);

  const loadMatter = useCallback(async () => {
    if (!matterId) return;

    setLoading(true);
    setErrorMessage(null);

    try {
      const payload = await fetchMatter();
      if (!payload) return;
      setMatter(payload.data);
      setSelectedProceedingId((current) => {
        if (current) return current;
        return payload.data.proceedings[0]?.id ?? "";
      });
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent(`/matters/${matterId}`)}`);
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Failed to load matter details.");
    } finally {
      setLoading(false);
    }
  }, [fetchMatter, matterId, router]);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const payload = await fetchMatter();
        if (!payload || !isMounted) return;
        setMatter(payload.data);
        setSelectedProceedingId(payload.data.proceedings[0]?.id ?? "");
      } catch (error) {
        if (error instanceof SessionRequiredError) {
          router.replace(`/login?next=${encodeURIComponent(`/matters/${matterId}`)}`);
          return;
        }

        if (!isMounted) return;
        setErrorMessage(error instanceof Error ? error.message : "Failed to load matter details.");
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
  }, [fetchMatter, matterId, router]);

  async function handleCreateProceeding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matterId) return;

    setCreatingProceeding(true);
    setCreateProceedingError(null);
    setActionSuccessMessage(null);

    try {
      await requestApiWithSession<{ data: Proceeding }>(supabase, `/api/v1/matters/${matterId}/proceedings`, {
        method: "POST",
        body: JSON.stringify({
          stage: proceedingForm.stage,
          status: proceedingForm.status,
          caseNumber: proceedingForm.caseNumber.trim() || undefined,
          linkedCaseId: proceedingForm.linkedCaseId.trim() || undefined,
          courtId: proceedingForm.courtId.trim() || undefined,
          department: proceedingForm.department.trim() || undefined,
          filingDate: toIsoOrUndefined(proceedingForm.filingDate),
          nextDeadlineAt: toIsoOrUndefined(proceedingForm.nextDeadlineAt),
          feesAmountQar: proceedingForm.feesAmountQar ? Number(proceedingForm.feesAmountQar) : undefined,
        }),
      });

      setProceedingForm(EMPTY_PROCEEDING_FORM);
      setShowProceedingForm(false);
      await loadMatter();
      setActionSuccessMessage("Proceeding created successfully.");
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent(`/matters/${matterId}`)}`);
        return;
      }

      setCreateProceedingError(error instanceof Error ? error.message : "Failed to create proceeding.");
    } finally {
      setCreatingProceeding(false);
    }
  }

  async function handleTransition(
    action: "appeal" | "cassation" | "execution",
  ) {
    if (!matterId || !selectedProceedingId) {
      setActionErrorMessage("Select a source proceeding first.");
      return;
    }

    const endpoint = transitionEndpointByAction[action];
    const actionKey = `${action}:${selectedProceedingId}`;

    setRunningActionKey(actionKey);
    setActionErrorMessage(null);
    setActionSuccessMessage(null);

    try {
      await requestApiWithSession<{ data: Proceeding }>(
        supabase,
        `/api/v1/matters/${matterId}/proceedings/${selectedProceedingId}/${endpoint}`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      );
      await loadMatter();
      setActionSuccessMessage(successMessageByAction[action]);
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent(`/matters/${matterId}`)}`);
        return;
      }

      setActionErrorMessage(error instanceof Error ? error.message : "Transition failed.");
    } finally {
      setRunningActionKey(null);
    }
  }

  return (
    <main className="app-shell">
      <div className="page-container">
        <section className="panel" style={{ marginBottom: 16 }}>
          <p className="eyebrow">Legal Matter Detail</p>
          <h1 style={{ margin: "8px 0 8px", fontSize: 32 }}>
            {matter?.title ?? `Matter ${matterId}`}
          </h1>
          <p className="muted" style={{ marginBottom: 14 }}>
            Matter number: {matter?.matterNumber ?? "N/A"} | Status: {matter?.status ?? "N/A"}
          </p>

          <div className="actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => void handleTransition("appeal")}
              disabled={!selectedProceedingId || runningActionKey !== null}
            >
              {runningActionKey?.startsWith("appeal:") ? <LoaderCircle size={18} className="animate-spin" /> : <Gavel size={18} />}
              Create Appeal
            </button>

            <button
              type="button"
              className="button button-secondary"
              onClick={() => void handleTransition("cassation")}
              disabled={!selectedProceedingId || runningActionKey !== null}
            >
              {runningActionKey?.startsWith("cassation:") ? <LoaderCircle size={18} className="animate-spin" /> : <Scale size={18} />}
              Create Cassation
            </button>

            <button
              type="button"
              className="button button-secondary"
              onClick={() => void handleTransition("execution")}
              disabled={!selectedProceedingId || runningActionKey !== null}
            >
              {runningActionKey?.startsWith("execution:") ? <LoaderCircle size={18} className="animate-spin" /> : <FilePlus2 size={18} />}
              Open Execution File
            </button>

            <button type="button" className="button button-secondary" disabled title="Linking related case is pending API contract.">
              <Link2 size={18} />
              Link Related Case
            </button>

            <button type="button" className="button button-secondary" onClick={() => void loadMatter()} disabled={loading}>
              <RefreshCw size={18} />
              Refresh
            </button>

            <Link className="button button-secondary" href="/matters">
              <CircleChevronRight size={18} />
              Back to Matters
            </Link>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            <label style={{ display: "grid", gap: 6, maxWidth: 520 }}>
              <span>Select Source Proceeding</span>
              <select
                value={selectedProceedingId}
                onChange={(event) => setSelectedProceedingId(event.target.value)}
                style={inputStyle}
              >
                <option value="">Choose proceeding</option>
                {(matter?.proceedings ?? []).map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.stage} | {row.caseNumber ?? row.id}
                  </option>
                ))}
              </select>
            </label>

            {actionErrorMessage ? (
              <p role="alert" style={{ color: "#b42318", margin: 0 }}>{actionErrorMessage}</p>
            ) : null}
            {actionSuccessMessage ? (
              <p style={{ color: "#067647", margin: 0 }}>{actionSuccessMessage}</p>
            ) : null}
          </div>
        </section>

        <section className="panel" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Create Proceeding</h2>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowProceedingForm((value) => !value)}
          >
            <CirclePlus size={18} />
            {showProceedingForm ? "Hide Proceeding Form" : "Create Proceeding"}
          </button>

          {showProceedingForm ? (
            <form onSubmit={handleCreateProceeding} style={{ marginTop: 14, display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Stage</span>
                <select
                  value={proceedingForm.stage}
                  onChange={(event) => {
                    const stage = event.target.value as CreateProceedingForm["stage"];
                    setProceedingForm((value) => ({ ...value, stage }));
                  }}
                  style={inputStyle}
                >
                  <option value="first_instance">first_instance</option>
                  <option value="appeal">appeal</option>
                  <option value="cassation">cassation</option>
                  <option value="execution">execution</option>
                  <option value="urgent_request">urgent_request</option>
                  <option value="related_case">related_case</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Status</span>
                <select
                  value={proceedingForm.status}
                  onChange={(event) => {
                    const status = event.target.value as CreateProceedingForm["status"];
                    setProceedingForm((value) => ({ ...value, status }));
                  }}
                  style={inputStyle}
                >
                  <option value="open">open</option>
                  <option value="pending">pending</option>
                  <option value="on_hold">on_hold</option>
                  <option value="closed">closed</option>
                  <option value="archived">archived</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Case Number</span>
                <input
                  value={proceedingForm.caseNumber}
                  onChange={(event) => setProceedingForm((value) => ({ ...value, caseNumber: event.target.value }))}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Department</span>
                <input
                  value={proceedingForm.department}
                  onChange={(event) => setProceedingForm((value) => ({ ...value, department: event.target.value }))}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Court ID (optional UUID)</span>
                <input
                  value={proceedingForm.courtId}
                  onChange={(event) => setProceedingForm((value) => ({ ...value, courtId: event.target.value }))}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Linked Case ID (optional UUID)</span>
                <input
                  value={proceedingForm.linkedCaseId}
                  onChange={(event) => setProceedingForm((value) => ({ ...value, linkedCaseId: event.target.value }))}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Filing Date</span>
                <input
                  type="datetime-local"
                  value={proceedingForm.filingDate}
                  onChange={(event) => setProceedingForm((value) => ({ ...value, filingDate: event.target.value }))}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Next Deadline</span>
                <input
                  type="datetime-local"
                  value={proceedingForm.nextDeadlineAt}
                  onChange={(event) => setProceedingForm((value) => ({ ...value, nextDeadlineAt: event.target.value }))}
                  style={inputStyle}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span>Fees Amount QAR</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={proceedingForm.feesAmountQar}
                  onChange={(event) => setProceedingForm((value) => ({ ...value, feesAmountQar: event.target.value }))}
                  style={inputStyle}
                />
              </label>

              {createProceedingError ? (
                <p role="alert" style={{ color: "#b42318", margin: 0 }}>{createProceedingError}</p>
              ) : null}

              <button type="submit" className="button button-primary" disabled={creatingProceeding} style={{ width: "fit-content" }}>
                {creatingProceeding ? <LoaderCircle size={18} className="animate-spin" /> : <CirclePlus size={18} />}
                {creatingProceeding ? "Creating..." : "Create Proceeding"}
              </button>
            </form>
          ) : null}
        </section>

        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Proceedings Timeline</h2>

          {loading ? (
            <p className="muted" style={{ margin: 0 }}>Loading matter details...</p>
          ) : null}

          {!loading && errorMessage ? (
            <div>
              <p role="alert" style={{ color: "#b42318", marginTop: 0 }}>{errorMessage}</p>
              <button type="button" className="button button-secondary" onClick={() => void loadMatter()}>
                Retry
              </button>
            </div>
          ) : null}

          {!loading && !errorMessage && matter && matter.proceedings.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No proceedings found for this matter yet.
            </p>
          ) : null}

          {!loading && !errorMessage && matter && matter.proceedings.length > 0 ? (
            <div style={{ display: "grid", gap: 14 }}>
              {matter.proceedings.map((row) => (
                <article
                  key={row.id}
                  style={{
                    border: "1px solid var(--line)",
                    borderRadius: 8,
                    padding: 14,
                    background: "var(--surface)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <strong>{row.stage}</strong>
                      <p className="muted" style={{ marginTop: 4 }}>
                        {row.caseNumber ?? "N/A"} - {row.court?.nameAr ?? "N/A"}
                      </p>
                    </div>
                    <span className="status-chip">{row.status}</span>
                  </div>

                  <div
                    style={{
                      marginTop: 12,
                      display: "grid",
                      gap: 8,
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    }}
                  >
                    <span>Hearings: {row.hearings.length}</span>
                    <span>Documents: {row.documents.length}</span>
                    <span>Tasks: {row.tasks.length}</span>
                    <span>Updates: {row.updates.length}</span>
                    <span>Parties: {row.parties.length}</span>
                    <span>Fees: {row.fees.length}</span>
                    <span>Deadline: {row.nextDeadlineAt ? new Date(row.nextDeadlineAt).toLocaleDateString() : "N/A"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

const transitionEndpointByAction = {
  appeal: "convert-to-appeal",
  cassation: "convert-to-cassation",
  execution: "open-execution",
} as const;

const successMessageByAction = {
  appeal: "Appeal proceeding created.",
  cassation: "Cassation proceeding created.",
  execution: "Execution proceeding opened.",
} as const;

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: 8,
  minHeight: 42,
  padding: "8px 12px",
  fontSize: 14,
  background: "white",
};

function toIsoOrUndefined(value: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}
