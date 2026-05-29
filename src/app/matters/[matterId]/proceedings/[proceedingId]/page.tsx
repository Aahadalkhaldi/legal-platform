"use client";

import Link from "next/link";
import { FormEvent, type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CircleChevronRight, LoaderCircle, RefreshCw } from "lucide-react";
import { requestApiWithSession, SessionRequiredError } from "@/lib/api/browser-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type ProceedingLifecycleEventType = "hearing" | "filing" | "judgment" | "appeal" | "cassation" | "execution";
type ProceedingLifecycleStage = "first_instance" | "appeal" | "cassation" | "execution";

type ProceedingSession = {
  id: string;
  stage: ProceedingLifecycleStage;
  hearingDate: string;
  hearingResult: string | null;
  nextHearing: string | null;
  reminderAt: string | null;
  notes: string | null;
  createdAt: string;
};

type ProceedingFiling = {
  id: string;
  title: string;
  filedAt: string;
  notes: string | null;
};

type ProceedingPayment = {
  id: string;
  title: string;
  filedAt: string;
  amountQar: number | null;
  notes: string | null;
};

type ProceedingJudgment = {
  id: string;
  stage: "first_instance" | "appeal" | "cassation";
  judgmentDate: string;
  summary: string;
  isFinal: boolean;
  appealAvailable: boolean;
  createdAt: string;
};

type ProceedingTimelineEvent = {
  id: string;
  eventType: ProceedingLifecycleEventType;
  stage: string;
  title: string;
  description: string | null;
  eventDate: string;
};

type ProceedingLifecycle = {
  firstInstance: {
    hearings: ProceedingSession[];
    pleadings: ProceedingFiling[];
    evidence: ProceedingFiling[];
    expertReports: ProceedingFiling[];
    judgment: ProceedingJudgment | null;
  };
  appeal: {
    parentProceedingId: string | null;
    grounds: string[];
    hearings: ProceedingSession[];
    judgment: ProceedingJudgment | null;
  };
  cassation: {
    grounds: string[];
    sessions: ProceedingSession[];
    judgment: ProceedingJudgment | null;
  };
  execution: {
    executionFileNumber: string | null;
    applications: ProceedingFiling[];
    objections: ProceedingFiling[];
    attachments: ProceedingFiling[];
    seizures: ProceedingFiling[];
    payments: ProceedingPayment[];
    closure: {
      closedAt: string;
      notes: string | null;
    } | null;
  };
  timeline: ProceedingTimelineEvent[];
  sessionManagement: ProceedingSession[];
  judgmentManagement: ProceedingJudgment[];
};

type ProceedingDetailResponse = {
  data: {
    id: string;
    legalMatterId: string;
    parentProceedingId: string | null;
    parentProceeding: {
      id: string;
      actionType: string;
      stage: string;
      status: string;
      caseNumber: string | null;
      reportNumber: string | null;
    } | null;
    actionType: string;
    stage: string;
    status: string;
    caseNumber: string | null;
    reportNumber: string | null;
    authority: string | null;
    complainant: string | null;
    respondent: string | null;
    courtId: string | null;
    circuit: string | null;
    department: string | null;
    claimType: string | null;
    judgmentSummary: string | null;
    executionFileNumber: string | null;
    filingDate: string | null;
    nextDeadlineAt: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    hearings: Array<Record<string, unknown>>;
    documents: Array<Record<string, unknown>>;
    tasks: Array<Record<string, unknown>>;
    notifications: Array<Record<string, unknown>>;
    billing: Array<Record<string, unknown>>;
    lifecycle: ProceedingLifecycle;
    timeline: ProceedingTimelineEvent[];
  };
  requestId: string;
};

type MutationAction =
  | {
      action: "add_session";
      stage: "first_instance" | "appeal" | "cassation";
      hearingDate: string;
      hearingResult?: string;
      nextHearing?: string;
      reminderAt?: string;
      notes?: string;
    }
  | {
      action: "add_filing";
      filingType:
        | "pleading"
        | "evidence"
        | "expert_report"
        | "execution_application"
        | "objection"
        | "attachment"
        | "seizure"
        | "payment";
      title: string;
      filedAt?: string;
      notes?: string;
      amountQar?: number;
    }
  | {
      action: "set_judgment";
      stage: "first_instance" | "appeal" | "cassation";
      judgmentDate: string;
      summary: string;
      isFinal: boolean;
      appealAvailable: boolean;
    }
  | {
      action: "set_appeal_grounds";
      grounds: string[];
      parentProceedingId?: string;
    }
  | {
      action: "set_cassation_grounds";
      grounds: string[];
    }
  | {
      action: "set_execution_file";
      executionFileNumber: string;
    }
  | {
      action: "close_execution";
      closedAt?: string;
      notes?: string;
    };

type SessionFormState = {
  stage: "first_instance" | "appeal" | "cassation";
  hearingDate: string;
  hearingResult: string;
  nextHearing: string;
  reminderAt: string;
  notes: string;
};

type FilingFormState = {
  filingType:
    | "pleading"
    | "evidence"
    | "expert_report"
    | "execution_application"
    | "objection"
    | "attachment"
    | "seizure"
    | "payment";
  title: string;
  filedAt: string;
  notes: string;
  amountQar: string;
};

type JudgmentFormState = {
  stage: "first_instance" | "appeal" | "cassation";
  judgmentDate: string;
  summary: string;
  isFinal: boolean;
  appealAvailable: boolean;
};

const EMPTY_SESSION_FORM: SessionFormState = {
  stage: "first_instance",
  hearingDate: "",
  hearingResult: "",
  nextHearing: "",
  reminderAt: "",
  notes: "",
};

const EMPTY_FILING_FORM: FilingFormState = {
  filingType: "pleading",
  title: "",
  filedAt: "",
  notes: "",
  amountQar: "",
};

const EMPTY_JUDGMENT_FORM: JudgmentFormState = {
  stage: "first_instance",
  judgmentDate: "",
  summary: "",
  isFinal: false,
  appealAvailable: true,
};

export default function ProceedingDetailPage() {
  const router = useRouter();
  const params = useParams<{ matterId?: string | string[]; proceedingId?: string | string[] }>();
  const matterIdParam = params.matterId;
  const proceedingIdParam = params.proceedingId;
  const matterId = Array.isArray(matterIdParam) ? matterIdParam[0] : (matterIdParam ?? "");
  const proceedingId = Array.isArray(proceedingIdParam) ? proceedingIdParam[0] : (proceedingIdParam ?? "");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [payload, setPayload] = useState<ProceedingDetailResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [sessionForm, setSessionForm] = useState<SessionFormState>(EMPTY_SESSION_FORM);
  const [filingForm, setFilingForm] = useState<FilingFormState>(EMPTY_FILING_FORM);
  const [judgmentForm, setJudgmentForm] = useState<JudgmentFormState>(EMPTY_JUDGMENT_FORM);
  const [appealGroundsText, setAppealGroundsText] = useState("");
  const [appealParentId, setAppealParentId] = useState("");
  const [cassationGroundsText, setCassationGroundsText] = useState("");
  const [executionFileNumber, setExecutionFileNumber] = useState("");
  const [executionClosureNotes, setExecutionClosureNotes] = useState("");
  const [executionClosedAt, setExecutionClosedAt] = useState("");

  const loadProceeding = useCallback(async () => {
    if (!matterId || !proceedingId) {
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await requestApiWithSession<ProceedingDetailResponse>(
        supabase,
        `/api/v1/matters/${matterId}/proceedings/${proceedingId}`,
      );
      setPayload(response.data);
      setAppealParentId(response.data.parentProceeding?.id ?? response.data.parentProceedingId ?? "");
      setExecutionFileNumber(response.data.lifecycle.execution.executionFileNumber ?? "");
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent(`/matters/${matterId}/proceedings/${proceedingId}`)}`);
        return;
      }
      setErrorMessage(error instanceof Error ? error.message : "Failed to load proceeding detail.");
    } finally {
      setLoading(false);
    }
  }, [matterId, proceedingId, router, supabase]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadProceeding();
    });
  }, [loadProceeding]);

  async function mutate(action: MutationAction, successMessage: string) {
    if (!matterId || !proceedingId) return;

    setSubmitting(true);
    setMutationMessage(null);
    setMutationError(null);

    try {
      await requestApiWithSession(
        supabase,
        `/api/v1/matters/${matterId}/proceedings/${proceedingId}`,
        {
          method: "PATCH",
          body: JSON.stringify(action),
        },
      );
      setMutationMessage(successMessage);
      await loadProceeding();
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent(`/matters/${matterId}/proceedings/${proceedingId}`)}`);
        return;
      }
      setMutationError(error instanceof Error ? error.message : "Failed to update proceeding lifecycle.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSessionSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const hearingDate = toIsoOrNull(sessionForm.hearingDate);
    const nextHearing = toIsoOrNull(sessionForm.nextHearing);
    const reminderAt = toIsoOrNull(sessionForm.reminderAt);
    if (!hearingDate) {
      setMutationError("Invalid hearing date.");
      return;
    }
    if (sessionForm.nextHearing && !nextHearing) {
      setMutationError("Invalid next hearing date.");
      return;
    }
    if (sessionForm.reminderAt && !reminderAt) {
      setMutationError("Invalid reminder date.");
      return;
    }

    await mutate({
      action: "add_session",
      stage: sessionForm.stage,
      hearingDate,
      hearingResult: sessionForm.hearingResult.trim() || undefined,
      nextHearing: nextHearing ?? undefined,
      reminderAt: reminderAt ?? undefined,
      notes: sessionForm.notes.trim() || undefined,
    }, "Session added.");

    setSessionForm(EMPTY_SESSION_FORM);
  }

  async function handleFilingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const filedAt = toIsoOrNull(filingForm.filedAt);
    if (filingForm.filedAt && !filedAt) {
      setMutationError("Invalid filing date.");
      return;
    }

    await mutate({
      action: "add_filing",
      filingType: filingForm.filingType,
      title: filingForm.title.trim(),
      filedAt: filedAt ?? undefined,
      notes: filingForm.notes.trim() || undefined,
      amountQar: filingForm.amountQar ? Number(filingForm.amountQar) : undefined,
    }, "Filing added.");
    setFilingForm(EMPTY_FILING_FORM);
  }

  async function handleJudgmentSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const judgmentDate = toIsoOrNull(judgmentForm.judgmentDate);
    if (!judgmentDate) {
      setMutationError("Invalid judgment date.");
      return;
    }

    await mutate({
      action: "set_judgment",
      stage: judgmentForm.stage,
      judgmentDate,
      summary: judgmentForm.summary.trim(),
      isFinal: judgmentForm.isFinal,
      appealAvailable: judgmentForm.appealAvailable,
    }, "Judgment updated.");
    setJudgmentForm(EMPTY_JUDGMENT_FORM);
  }

  async function handleAppealGroundsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate({
      action: "set_appeal_grounds",
      grounds: splitLines(appealGroundsText),
      parentProceedingId: appealParentId.trim() || undefined,
    }, "Appeal grounds updated.");
  }

  async function handleCassationGroundsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate({
      action: "set_cassation_grounds",
      grounds: splitLines(cassationGroundsText),
    }, "Cassation grounds updated.");
  }

  async function handleExecutionFileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await mutate({
      action: "set_execution_file",
      executionFileNumber: executionFileNumber.trim(),
    }, "Execution file number updated.");
  }

  async function handleExecutionClosureSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const closedAt = toIsoOrNull(executionClosedAt);
    if (executionClosedAt && !closedAt) {
      setMutationError("Invalid execution closure date.");
      return;
    }

    await mutate({
      action: "close_execution",
      closedAt: closedAt ?? undefined,
      notes: executionClosureNotes.trim() || undefined,
    }, "Execution file closed.");
  }

  return (
    <main className="app-shell">
      <div className="page-container">
        <section className="panel" style={{ marginBottom: 16 }}>
          <p className="eyebrow">Proceeding Lifecycle Workspace</p>
          <h1 style={{ margin: "6px 0 8px", fontSize: 30 }}>
            {payload ? `${payload.actionType} | ${payload.stage}` : "Proceeding"}
          </h1>
          <p className="muted" style={{ marginBottom: 10 }}>
            Matter: {matterId} | Proceeding: {proceedingId}
          </p>
          <p className="muted" style={{ marginBottom: 14 }}>
            Status: {payload?.status ?? "N/A"} | Case/Report: {payload?.caseNumber ?? payload?.reportNumber ?? "N/A"} | Next Deadline: {formatDate(payload?.nextDeadlineAt ?? null)}
          </p>

          <div className="actions">
            <button type="button" className="button button-secondary" onClick={() => void loadProceeding()} disabled={loading || submitting}>
              <RefreshCw size={18} />
              Refresh
            </button>
            <Link className="button button-secondary" href={`/matters/${matterId}`}>
              <CircleChevronRight size={18} />
              Back To Matter
            </Link>
          </div>

          {mutationMessage ? <p style={{ color: "#067647", marginTop: 12 }}>{mutationMessage}</p> : null}
          {mutationError ? <p role="alert" style={{ color: "#b42318", marginTop: 12 }}>{mutationError}</p> : null}
        </section>

        {loading ? (
          <section className="panel">
            <p className="muted" style={{ margin: 0 }}>Loading proceeding workspace...</p>
          </section>
        ) : null}

        {!loading && errorMessage ? (
          <section className="panel">
            <p role="alert" style={{ color: "#b42318", marginTop: 0 }}>{errorMessage}</p>
            <button type="button" className="button button-secondary" onClick={() => void loadProceeding()}>
              Retry
            </button>
          </section>
        ) : null}

        {!loading && !errorMessage && payload ? (
          <>
            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>First Instance Workflow</h2>
              <p className="muted">Hearings, pleadings, evidence, expert reports, and judgment.</p>
              <p style={{ marginBottom: 6 }}><strong>Hearings:</strong> {payload.lifecycle.firstInstance.hearings.length}</p>
              <p style={{ marginBottom: 6 }}><strong>Pleadings:</strong> {payload.lifecycle.firstInstance.pleadings.length}</p>
              <p style={{ marginBottom: 6 }}><strong>Evidence:</strong> {payload.lifecycle.firstInstance.evidence.length}</p>
              <p style={{ marginBottom: 6 }}><strong>Expert Reports:</strong> {payload.lifecycle.firstInstance.expertReports.length}</p>
              <p style={{ marginBottom: 0 }}><strong>Judgment:</strong> {payload.lifecycle.firstInstance.judgment ? payload.lifecycle.firstInstance.judgment.summary : "Not recorded"}</p>
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Appeal Workflow</h2>
              <p style={{ marginBottom: 6 }}>
                <strong>Linked Parent Proceeding:</strong> {payload.parentProceeding ? `${payload.parentProceeding.actionType} (${payload.parentProceeding.id})` : "Not linked"}
              </p>
              <p style={{ marginBottom: 6 }}><strong>Appeal Grounds:</strong> {payload.lifecycle.appeal.grounds.length || "None"}</p>
              <p style={{ marginBottom: 6 }}><strong>Appeal Hearings:</strong> {payload.lifecycle.appeal.hearings.length}</p>
              <p style={{ marginBottom: 0 }}><strong>Appeal Judgment:</strong> {payload.lifecycle.appeal.judgment ? payload.lifecycle.appeal.judgment.summary : "Not recorded"}</p>

              <form onSubmit={handleAppealGroundsSubmit} style={formStyle}>
                <label style={labelStyle}>
                  <span>Parent Proceeding ID (optional)</span>
                  <input value={appealParentId} onChange={(event) => setAppealParentId(event.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span>Appeal Grounds (one per line)</span>
                  <textarea rows={4} value={appealGroundsText} onChange={(event) => setAppealGroundsText(event.target.value)} style={{ ...inputStyle, minHeight: 100 }} />
                </label>
                <button type="submit" className="button button-primary" disabled={submitting}>
                  {submitting ? <LoaderCircle size={18} className="animate-spin" /> : null}
                  Save Appeal Grounds
                </button>
              </form>
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Cassation Workflow</h2>
              <p style={{ marginBottom: 6 }}><strong>Cassation Grounds:</strong> {payload.lifecycle.cassation.grounds.length || "None"}</p>
              <p style={{ marginBottom: 6 }}><strong>Cassation Sessions:</strong> {payload.lifecycle.cassation.sessions.length}</p>
              <p style={{ marginBottom: 0 }}><strong>Cassation Judgment:</strong> {payload.lifecycle.cassation.judgment ? payload.lifecycle.cassation.judgment.summary : "Not recorded"}</p>

              <form onSubmit={handleCassationGroundsSubmit} style={formStyle}>
                <label style={labelStyle}>
                  <span>Cassation Grounds (one per line)</span>
                  <textarea rows={4} value={cassationGroundsText} onChange={(event) => setCassationGroundsText(event.target.value)} style={{ ...inputStyle, minHeight: 100 }} />
                </label>
                <button type="submit" className="button button-primary" disabled={submitting}>
                  {submitting ? <LoaderCircle size={18} className="animate-spin" /> : null}
                  Save Cassation Grounds
                </button>
              </form>
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Execution Workflow</h2>
              <p style={{ marginBottom: 6 }}><strong>Execution File Number:</strong> {payload.lifecycle.execution.executionFileNumber ?? "Not set"}</p>
              <p style={{ marginBottom: 6 }}><strong>Applications:</strong> {payload.lifecycle.execution.applications.length}</p>
              <p style={{ marginBottom: 6 }}><strong>Objections:</strong> {payload.lifecycle.execution.objections.length}</p>
              <p style={{ marginBottom: 6 }}><strong>Attachments:</strong> {payload.lifecycle.execution.attachments.length}</p>
              <p style={{ marginBottom: 6 }}><strong>Seizures:</strong> {payload.lifecycle.execution.seizures.length}</p>
              <p style={{ marginBottom: 6 }}><strong>Payments:</strong> {payload.lifecycle.execution.payments.length}</p>
              <p style={{ marginBottom: 0 }}><strong>Closure:</strong> {payload.lifecycle.execution.closure ? formatDate(payload.lifecycle.execution.closure.closedAt) : "Open"}</p>

              <form onSubmit={handleExecutionFileSubmit} style={formStyle}>
                <label style={labelStyle}>
                  <span>Execution File Number</span>
                  <input value={executionFileNumber} onChange={(event) => setExecutionFileNumber(event.target.value)} style={inputStyle} required />
                </label>
                <button type="submit" className="button button-primary" disabled={submitting}>
                  {submitting ? <LoaderCircle size={18} className="animate-spin" /> : null}
                  Save Execution File
                </button>
              </form>

              <form onSubmit={handleExecutionClosureSubmit} style={formStyle}>
                <label style={labelStyle}>
                  <span>Execution Closure Date</span>
                  <input type="datetime-local" value={executionClosedAt} onChange={(event) => setExecutionClosedAt(event.target.value)} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span>Closure Notes</span>
                  <textarea rows={3} value={executionClosureNotes} onChange={(event) => setExecutionClosureNotes(event.target.value)} style={{ ...inputStyle, minHeight: 80 }} />
                </label>
                <button type="submit" className="button button-secondary" disabled={submitting}>
                  {submitting ? <LoaderCircle size={18} className="animate-spin" /> : null}
                  Close Execution
                </button>
              </form>
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Session Management</h2>
              <form onSubmit={handleSessionSubmit} style={formStyle}>
                <label style={labelStyle}>
                  <span>Session Stage</span>
                  <select value={sessionForm.stage} onChange={(event) => setSessionForm((current) => ({ ...current, stage: event.target.value as SessionFormState["stage"] }))} style={inputStyle}>
                    <option value="first_instance">first_instance</option>
                    <option value="appeal">appeal</option>
                    <option value="cassation">cassation</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span>Hearing Date</span>
                  <input type="datetime-local" value={sessionForm.hearingDate} onChange={(event) => setSessionForm((current) => ({ ...current, hearingDate: event.target.value }))} style={inputStyle} required />
                </label>
                <label style={labelStyle}>
                  <span>Hearing Result</span>
                  <input value={sessionForm.hearingResult} onChange={(event) => setSessionForm((current) => ({ ...current, hearingResult: event.target.value }))} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span>Next Hearing</span>
                  <input type="datetime-local" value={sessionForm.nextHearing} onChange={(event) => setSessionForm((current) => ({ ...current, nextHearing: event.target.value }))} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span>Reminder</span>
                  <input type="datetime-local" value={sessionForm.reminderAt} onChange={(event) => setSessionForm((current) => ({ ...current, reminderAt: event.target.value }))} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span>Notes</span>
                  <textarea rows={3} value={sessionForm.notes} onChange={(event) => setSessionForm((current) => ({ ...current, notes: event.target.value }))} style={{ ...inputStyle, minHeight: 80 }} />
                </label>
                <button type="submit" className="button button-primary" disabled={submitting}>
                  {submitting ? <LoaderCircle size={18} className="animate-spin" /> : null}
                  Add Session
                </button>
              </form>
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Judgment Management</h2>
              <form onSubmit={handleJudgmentSubmit} style={formStyle}>
                <label style={labelStyle}>
                  <span>Judgment Stage</span>
                  <select value={judgmentForm.stage} onChange={(event) => setJudgmentForm((current) => ({ ...current, stage: event.target.value as JudgmentFormState["stage"] }))} style={inputStyle}>
                    <option value="first_instance">first_instance</option>
                    <option value="appeal">appeal</option>
                    <option value="cassation">cassation</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span>Judgment Date</span>
                  <input type="datetime-local" value={judgmentForm.judgmentDate} onChange={(event) => setJudgmentForm((current) => ({ ...current, judgmentDate: event.target.value }))} style={inputStyle} required />
                </label>
                <label style={labelStyle}>
                  <span>Summary</span>
                  <textarea rows={4} value={judgmentForm.summary} onChange={(event) => setJudgmentForm((current) => ({ ...current, summary: event.target.value }))} style={{ ...inputStyle, minHeight: 100 }} required />
                </label>
                <label style={checkboxStyle}>
                  <input type="checkbox" checked={judgmentForm.isFinal} onChange={(event) => setJudgmentForm((current) => ({ ...current, isFinal: event.target.checked }))} />
                  <span>Final Judgment</span>
                </label>
                <label style={checkboxStyle}>
                  <input type="checkbox" checked={judgmentForm.appealAvailable} onChange={(event) => setJudgmentForm((current) => ({ ...current, appealAvailable: event.target.checked }))} />
                  <span>Appeal Available</span>
                </label>
                <button type="submit" className="button button-primary" disabled={submitting}>
                  {submitting ? <LoaderCircle size={18} className="animate-spin" /> : null}
                  Save Judgment
                </button>
              </form>
            </section>

            <section className="panel" style={{ marginBottom: 16 }}>
              <h2 style={{ marginTop: 0 }}>Filings / Execution Actions</h2>
              <form onSubmit={handleFilingSubmit} style={formStyle}>
                <label style={labelStyle}>
                  <span>Filing Type</span>
                  <select value={filingForm.filingType} onChange={(event) => setFilingForm((current) => ({ ...current, filingType: event.target.value as FilingFormState["filingType"] }))} style={inputStyle}>
                    <option value="pleading">pleading</option>
                    <option value="evidence">evidence</option>
                    <option value="expert_report">expert_report</option>
                    <option value="execution_application">execution_application</option>
                    <option value="objection">objection</option>
                    <option value="attachment">attachment</option>
                    <option value="seizure">seizure</option>
                    <option value="payment">payment</option>
                  </select>
                </label>
                <label style={labelStyle}>
                  <span>Title</span>
                  <input value={filingForm.title} onChange={(event) => setFilingForm((current) => ({ ...current, title: event.target.value }))} style={inputStyle} required />
                </label>
                <label style={labelStyle}>
                  <span>Filed At</span>
                  <input type="datetime-local" value={filingForm.filedAt} onChange={(event) => setFilingForm((current) => ({ ...current, filedAt: event.target.value }))} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span>Amount (for payments)</span>
                  <input type="number" step="0.01" min="0" value={filingForm.amountQar} onChange={(event) => setFilingForm((current) => ({ ...current, amountQar: event.target.value }))} style={inputStyle} />
                </label>
                <label style={labelStyle}>
                  <span>Notes</span>
                  <textarea rows={3} value={filingForm.notes} onChange={(event) => setFilingForm((current) => ({ ...current, notes: event.target.value }))} style={{ ...inputStyle, minHeight: 80 }} />
                </label>
                <button type="submit" className="button button-secondary" disabled={submitting}>
                  {submitting ? <LoaderCircle size={18} className="animate-spin" /> : null}
                  Add Filing
                </button>
              </form>
            </section>

            <section className="panel">
              <h2 style={{ marginTop: 0 }}>Timeline</h2>
              {payload.timeline.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>No lifecycle timeline events yet.</p>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {payload.timeline.map((event) => (
                    <article key={event.id} style={cardStyle}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                        <strong>{event.title}</strong>
                        <span className="status-chip">{event.eventType}</span>
                      </div>
                      <p className="muted" style={{ margin: "6px 0 0" }}>
                        Stage: {event.stage} | {formatDate(event.eventDate)}
                      </p>
                      {event.description ? <p style={{ margin: "6px 0 0" }}>{event.description}</p> : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function toIsoOrNull(value: string) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function formatDate(value: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

const formStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginTop: 14,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
};

const checkboxStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--line)",
  borderRadius: 8,
  minHeight: 42,
  padding: "8px 12px",
  fontSize: 14,
  background: "white",
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 12,
  background: "var(--surface)",
};
