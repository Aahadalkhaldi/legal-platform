"use client";

import Link from "next/link";
import { FormEvent, type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CircleChevronRight,
  CirclePlus,
  FilePlus2,
  FolderOpen,
  Gavel,
  Link2,
  LoaderCircle,
  RefreshCw,
  Scale,
} from "lucide-react";
import { hasMatterAction } from "@/lib/access-control";
import { requestApiWithSession, SessionRequiredError } from "@/lib/api/browser-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { deriveMatterLifecycleSummary, readProceedingLifecycle } from "@/lib/proceeding-lifecycle";

type IntakeType = "lawsuit" | "complaint_report" | "consultation" | "contract_document";
type IntakeWorkflowStatus = "draft" | "active" | "pending_documents";
type ActionType =
  | "lawsuit"
  | "appeal"
  | "cassation"
  | "execution"
  | "urgent_request"
  | "police_report"
  | "public_prosecution_complaint"
  | "cybercrime_report"
  | "labor_complaint"
  | "administrative_complaint"
  | "regulatory_complaint";

type MatterDetailResponse = {
  data: MatterDetail;
  requestId: string;
};

type MatterDraftsResponse = {
  data: MatterActionDraft[];
  requestId: string;
};

type CreateDraftResponse = {
  data: {
    draft: MatterActionDraft;
  };
  requestId: string;
};

type MeResponse = {
  data: {
    onboardingRequired?: boolean;
    role?: string;
    permissions?: string[];
    inheritedPermissions?: string[];
  };
};

type MatterDetail = {
  id: string;
  matterNumber: string | null;
  title: string;
  description: string | null;
  status: string;
  intakeType: IntakeType | null;
  intakeWorkflowStatus: IntakeWorkflowStatus;
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
  actionType: ActionType;
  stage: string;
  status: string;
  caseNumber: string | null;
  court: { id: string | null; nameAr: string | null } | null;
  circuit: string | null;
  department: string | null;
  claimType: string | null;
  judgmentSummary: string | null;
  authority: string | null;
  reportNumber: string | null;
  submissionDate: string | null;
  complainant: string | null;
  respondent: string | null;
  investigationSessions: Record<string, unknown>[] | null;
  prosecutorName: string | null;
  policeStation: string | null;
  relatedLawsuitProceedingId: string | null;
  clientVisible: boolean;
  filingDate: string | null;
  nextDeadlineAt: string | null;
  feesAmountQar: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: string | null;
  updatedAt: string | null;
  hearings: unknown[];
  documents: unknown[];
  tasks: unknown[];
  updates: unknown[];
  parties: unknown[];
  fees: unknown[];
  deadlines: unknown[];
};

type MatterActionDraft = {
  id: string;
  actionType: string;
  status: "draft";
  title: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  source: "matter_detail";
};

type TimelineEntry = {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  actionType: string;
  stage: string;
  status: string;
  reference: string;
  eventDate: string | null;
  hearingsCount: number;
  updatesCount: number;
};

type HearingEntry = {
  id: string;
  proceedingId: string;
  actionType: string;
  hearingAt: string | null;
  status: string | null;
  agenda: string | null;
  outcome: string | null;
};

type NotificationEntry = {
  id: string;
  proceedingId: string;
  actionType: string;
  title: string | null;
  createdAt: string | null;
};

type DocumentEntry = {
  id: string;
  proceedingId: string;
  actionType: string;
  title: string | null;
  documentType: string | null;
  classification: string | null;
  updatedAt: string | null;
};

type TaskEntry = {
  id: string;
  proceedingId: string;
  actionType: string;
  title: string | null;
  status: string | null;
  priority: string | null;
  dueAt: string | null;
};

type BillingEntry = {
  id: string;
  proceedingId: string;
  actionType: string;
  invoiceNumber: string | null;
  status: string | null;
  totalAmount: number | null;
  balanceDue: number | null;
  dueAt: string | null;
};

type CreateProceedingForm = {
  actionType: ActionType;
  status: "open" | "pending" | "on_hold" | "closed" | "archived";
  clientVisible: boolean;
  caseNumber: string;
  linkedCaseId: string;
  courtId: string;
  circuit: string;
  department: string;
  claimType: string;
  judgmentSummary: string;
  authority: string;
  reportNumber: string;
  submissionDate: string;
  complainant: string;
  respondent: string;
  prosecutorName: string;
  policeStation: string;
  filingDate: string;
  nextDeadlineAt: string;
  feesAmountQar: string;
};

const EMPTY_PROCEEDING_FORM: CreateProceedingForm = {
  actionType: "lawsuit",
  status: "open",
  clientVisible: false,
  caseNumber: "",
  linkedCaseId: "",
  courtId: "",
  circuit: "",
  department: "",
  claimType: "",
  judgmentSummary: "",
  authority: "",
  reportNumber: "",
  submissionDate: "",
  complainant: "",
  respondent: "",
  prosecutorName: "",
  policeStation: "",
  filingDate: "",
  nextDeadlineAt: "",
  feesAmountQar: "",
};

const complaintActionTypes: ActionType[] = [
  "police_report",
  "public_prosecution_complaint",
  "cybercrime_report",
  "labor_complaint",
  "administrative_complaint",
  "regulatory_complaint",
];

const lawsuitActionTypes: ActionType[] = ["lawsuit", "appeal", "cassation", "execution", "urgent_request"];

export default function MatterDetailPage() {
  const router = useRouter();
  const params = useParams<{ matterId?: string | string[] }>();
  const matterIdParam = params.matterId;
  const matterId = Array.isArray(matterIdParam) ? matterIdParam[0] : (matterIdParam ?? "");
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [matter, setMatter] = useState<MatterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<MatterActionDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);
  const [draftsErrorMessage, setDraftsErrorMessage] = useState<string | null>(null);
  const [creatingDraft, setCreatingDraft] = useState(false);
  const [createDraftError, setCreateDraftError] = useState<string | null>(null);
  const [createDraftSuccess, setCreateDraftSuccess] = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  const [showProceedingForm, setShowProceedingForm] = useState(false);
  const [proceedingForm, setProceedingForm] = useState<CreateProceedingForm>(EMPTY_PROCEEDING_FORM);
  const [creatingProceeding, setCreatingProceeding] = useState(false);
  const [createProceedingError, setCreateProceedingError] = useState<string | null>(null);
  const [selectedProceedingId, setSelectedProceedingId] = useState<string>("");
  const [runningActionKey, setRunningActionKey] = useState<string | null>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);
  const [viewerRole, setViewerRole] = useState<string>("client_portal");
  const [viewerPermissions, setViewerPermissions] = useState<string[]>([]);
  const [viewerInheritedPermissions, setViewerInheritedPermissions] = useState<string[]>([]);

  const fetchMatter = useCallback(async () => {
    if (!matterId) {
      return null;
    }

    return requestApiWithSession<MatterDetailResponse>(supabase, `/api/v1/matters/${matterId}`);
  }, [matterId, supabase]);

  const fetchDrafts = useCallback(async () => {
    if (!matterId) {
      return null;
    }

    return requestApiWithSession<MatterDraftsResponse>(supabase, `/api/v1/matters/${matterId}/drafts`);
  }, [matterId, supabase]);

  const loadViewerAccess = useCallback(async () => {
    const payload = await requestApiWithSession<MeResponse>(supabase, "/api/v1/me");
    if (payload.data.onboardingRequired) {
      setViewerRole("client_portal");
      setViewerPermissions([]);
      setViewerInheritedPermissions([]);
      return;
    }

    setViewerRole(payload.data.role ?? "client_portal");
    setViewerPermissions(payload.data.permissions ?? []);
    setViewerInheritedPermissions(payload.data.inheritedPermissions ?? []);
  }, [supabase]);

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

  const loadDrafts = useCallback(async () => {
    if (!matterId) return;

    setDraftsLoading(true);
    setDraftsErrorMessage(null);

    try {
      const payload = await fetchDrafts();
      if (!payload) return;
      setDrafts(payload.data);
      setActiveDraftId((current) => current ?? payload.data[0]?.id ?? null);
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent(`/matters/${matterId}`)}`);
        return;
      }

      setDraftsErrorMessage(error instanceof Error ? error.message : "Failed to load drafts.");
    } finally {
      setDraftsLoading(false);
    }
  }, [fetchDrafts, matterId, router]);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      setLoading(true);
      setDraftsLoading(true);
      setErrorMessage(null);
      setDraftsErrorMessage(null);

      try {
        const [payload] = await Promise.all([
          fetchMatter(),
          loadViewerAccess(),
        ]);

        if (!isMounted) return;

        if (payload) {
          setMatter(payload.data);
          setSelectedProceedingId(payload.data.proceedings[0]?.id ?? "");
        }
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

      try {
        const draftsPayload = await fetchDrafts();
        if (!isMounted || !draftsPayload) return;

        setDrafts(draftsPayload.data);
        setActiveDraftId(draftsPayload.data[0]?.id ?? null);
      } catch (error) {
        if (error instanceof SessionRequiredError) {
          router.replace(`/login?next=${encodeURIComponent(`/matters/${matterId}`)}`);
          return;
        }

        if (!isMounted) return;
        setDraftsErrorMessage(error instanceof Error ? error.message : "Failed to load drafts.");
      } finally {
        if (isMounted) {
          setDraftsLoading(false);
        }
      }
    };

    void bootstrap();
    return () => {
      isMounted = false;
    };
  }, [fetchDrafts, fetchMatter, loadViewerAccess, matterId, router]);

  const canCreateProceeding = useMemo(() => hasMatterAction({
    role: viewerRole,
    action: "create_proceeding",
    directPermissions: viewerPermissions,
    inheritedPermissions: viewerInheritedPermissions,
  }), [viewerInheritedPermissions, viewerPermissions, viewerRole]);

  const canCreateAppeal = useMemo(() => hasMatterAction({
    role: viewerRole,
    action: "create_appeal",
    directPermissions: viewerPermissions,
    inheritedPermissions: viewerInheritedPermissions,
  }), [viewerInheritedPermissions, viewerPermissions, viewerRole]);

  const canCreateCassation = useMemo(() => hasMatterAction({
    role: viewerRole,
    action: "create_cassation",
    directPermissions: viewerPermissions,
    inheritedPermissions: viewerInheritedPermissions,
  }), [viewerInheritedPermissions, viewerPermissions, viewerRole]);

  const canOpenExecution = useMemo(() => hasMatterAction({
    role: viewerRole,
    action: "open_execution",
    directPermissions: viewerPermissions,
    inheritedPermissions: viewerInheritedPermissions,
  }), [viewerInheritedPermissions, viewerPermissions, viewerRole]);

  async function handleCreateProceeding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matterId) return;
    if (!canCreateProceeding) {
      setCreateProceedingError("You do not have permission to create proceedings.");
      return;
    }

    setCreatingProceeding(true);
    setCreateProceedingError(null);
    setActionSuccessMessage(null);

    try {
      await requestApiWithSession(supabase, `/api/v1/matters/${matterId}/proceedings`, {
        method: "POST",
        body: JSON.stringify({
          actionType: proceedingForm.actionType,
          status: proceedingForm.status,
          clientVisible: proceedingForm.clientVisible,
          caseNumber: proceedingForm.caseNumber.trim() || undefined,
          linkedCaseId: proceedingForm.linkedCaseId.trim() || undefined,
          courtId: proceedingForm.courtId.trim() || undefined,
          circuit: proceedingForm.circuit.trim() || undefined,
          department: proceedingForm.department.trim() || undefined,
          claimType: proceedingForm.claimType.trim() || undefined,
          judgmentSummary: proceedingForm.judgmentSummary.trim() || undefined,
          authority: proceedingForm.authority.trim() || undefined,
          reportNumber: proceedingForm.reportNumber.trim() || undefined,
          submissionDate: toIsoOrUndefined(proceedingForm.submissionDate),
          complainant: proceedingForm.complainant.trim() || undefined,
          respondent: proceedingForm.respondent.trim() || undefined,
          prosecutorName: proceedingForm.prosecutorName.trim() || undefined,
          policeStation: proceedingForm.policeStation.trim() || undefined,
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

  async function handleCreateDraft() {
    if (!matterId) return;
    if (!canCreateProceeding) {
      setCreateDraftError("You do not have permission to create drafts.");
      return;
    }

    setCreatingDraft(true);
    setCreateDraftError(null);
    setCreateDraftSuccess(null);

    try {
      const payload = await requestApiWithSession<CreateDraftResponse>(supabase, `/api/v1/matters/${matterId}/drafts`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      await loadDrafts();
      setActiveDraftId(payload.data.draft.id);
      setCreateDraftSuccess("Draft created successfully.");
    } catch (error) {
      if (error instanceof SessionRequiredError) {
        router.replace(`/login?next=${encodeURIComponent(`/matters/${matterId}`)}`);
        return;
      }

      setCreateDraftError(error instanceof Error ? error.message : "Failed to create draft.");
    } finally {
      setCreatingDraft(false);
    }
  }

  async function handleTransition(action: TransitionAction) {
    if (!matterId || !selectedProceedingId) {
      setActionErrorMessage("Select a source proceeding first.");
      return;
    }
    if (!isTransitionAllowed(action, { canCreateAppeal, canCreateCassation, canOpenExecution, canCreateProceeding })) {
      setActionErrorMessage("You do not have permission to run this transition.");
      return;
    }

    const endpoint = transitionEndpointByAction[action];
    const actionKey = `${action}:${selectedProceedingId}`;

    setRunningActionKey(actionKey);
    setActionErrorMessage(null);
    setActionSuccessMessage(null);

    try {
      await requestApiWithSession(
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

  const showComplaintFields = complaintActionTypes.includes(proceedingForm.actionType);
  const showLawsuitFields = lawsuitActionTypes.includes(proceedingForm.actionType);

  const proceedings = useMemo(() => matter?.proceedings ?? [], [matter]);

  const lifecycleSummary = useMemo(() => deriveMatterLifecycleSummary(
    proceedings.map((row) => ({
      stage: row.stage,
      status: row.status,
      actionType: row.actionType,
      nextDeadlineAt: row.nextDeadlineAt,
    })),
  ), [proceedings]);

  const timelineEntries = useMemo<TimelineEntry[]>(() => {
    const items: TimelineEntry[] = [];

    for (const row of proceedings) {
      items.push({
        id: `${row.id}:proceeding-started`,
        eventType: "proceeding",
        title: `${row.actionType} proceeding started`,
        description: null,
        actionType: row.actionType,
        stage: row.stage,
        status: row.status,
        reference: row.caseNumber ?? row.reportNumber ?? row.id,
        eventDate: row.createdAt ?? row.filingDate ?? row.submissionDate,
        hearingsCount: row.hearings.length,
        updatesCount: row.updates.length,
      });

      const lifecycle = readProceedingLifecycle(row.metadata);
      for (const event of lifecycle.timeline) {
        items.push({
          id: `${row.id}:${event.id}`,
          eventType: event.eventType,
          title: event.title,
          description: event.description,
          actionType: row.actionType,
          stage: event.stage || row.stage,
          status: row.status,
          reference: row.caseNumber ?? row.reportNumber ?? row.id,
          eventDate: event.eventDate,
          hearingsCount: row.hearings.length,
          updatesCount: row.updates.length,
        });
      }
    }

    return items.sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));
  }, [proceedings]);

  const hearings = useMemo<HearingEntry[]>(() => proceedings.flatMap((row) => row.hearings.map((entry, index) => {
    const record = asRecord(entry);
    return {
      id: stringValue(record?.id) ?? `${row.id}:hearing:${index}`,
      proceedingId: row.id,
      actionType: row.actionType,
      hearingAt: stringValue(record?.hearing_at),
      status: stringValue(record?.status),
      agenda: stringValue(record?.agenda),
      outcome: stringValue(record?.outcome),
    };
  })), [proceedings]);

  const notifications = useMemo<NotificationEntry[]>(() => proceedings.flatMap((row) => row.updates.map((entry, index) => {
    const record = asRecord(entry);
    return {
      id: stringValue(record?.id) ?? `${row.id}:update:${index}`,
      proceedingId: row.id,
      actionType: row.actionType,
      title: stringValue(record?.title),
      createdAt: stringValue(record?.created_at),
    };
  })), [proceedings]);

  const documents = useMemo<DocumentEntry[]>(() => proceedings.flatMap((row) => row.documents.map((entry, index) => {
    const record = asRecord(entry);
    return {
      id: stringValue(record?.id) ?? `${row.id}:document:${index}`,
      proceedingId: row.id,
      actionType: row.actionType,
      title: stringValue(record?.title),
      documentType: stringValue(record?.document_type),
      classification: stringValue(record?.classification),
      updatedAt: stringValue(record?.updated_at),
    };
  })), [proceedings]);

  const tasks = useMemo<TaskEntry[]>(() => proceedings.flatMap((row) => row.tasks.map((entry, index) => {
    const record = asRecord(entry);
    return {
      id: stringValue(record?.id) ?? `${row.id}:task:${index}`,
      proceedingId: row.id,
      actionType: row.actionType,
      title: stringValue(record?.title),
      status: stringValue(record?.status),
      priority: stringValue(record?.priority),
      dueAt: stringValue(record?.due_at),
    };
  })), [proceedings]);

  const billingEntries = useMemo<BillingEntry[]>(() => proceedings.flatMap((row) => row.fees.map((entry, index) => {
    const record = asRecord(entry);
    return {
      id: stringValue(record?.id) ?? `${row.id}:invoice:${index}`,
      proceedingId: row.id,
      actionType: row.actionType,
      invoiceNumber: stringValue(record?.invoice_number),
      status: stringValue(record?.status),
      totalAmount: numberValue(record?.total_amount),
      balanceDue: numberValue(record?.balance_due),
      dueAt: stringValue(record?.due_at),
    };
  })), [proceedings]);

  return (
    <main className="app-shell">
      <div className="page-container">
        <section className="panel" style={{ marginBottom: 16 }}>
          <p className="eyebrow">Legal Matter Detail</p>
          <h2 style={{ marginTop: 0 }}>Overview</h2>
          <h1 style={{ margin: "8px 0 8px", fontSize: 32 }}>
            {matter?.title ?? `Matter ${matterId}`}
          </h1>
          <p className="muted" style={{ marginBottom: 14 }}>
            Matter number: {matter?.matterNumber ?? "N/A"} | Status: {matter?.status ?? "N/A"} | Intake type: {matter?.intakeType ?? "N/A"}
          </p>
          {matter ? (
            <p style={{ margin: "0 0 14px", fontWeight: 700 }}>
              Intake status: {matterStatusLabel(matter.intakeWorkflowStatus)}
            </p>
          ) : null}
          <div style={{ marginBottom: 14, display: "grid", gap: 4 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>
              Lifecycle Progress: {lifecycleSummary.progressPercent}%
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Current Stage: {lifecycleSummary.currentStage}
            </p>
            <p className="muted" style={{ margin: 0 }}>
              Next Legal Action: {lifecycleSummary.nextLegalAction}
            </p>
          </div>

          <div className="actions">
            <button
              type="button"
              className="button button-primary"
              onClick={() => void handleTransition("appeal")}
              disabled={!canCreateAppeal || !selectedProceedingId || runningActionKey !== null}
            >
              {runningActionKey?.startsWith("appeal:") ? <LoaderCircle size={18} className="animate-spin" /> : <Gavel size={18} />}
              Create Appeal
            </button>

            <button
              type="button"
              className="button button-secondary"
              onClick={() => void handleTransition("cassation")}
              disabled={!canCreateCassation || !selectedProceedingId || runningActionKey !== null}
            >
              {runningActionKey?.startsWith("cassation:") ? <LoaderCircle size={18} className="animate-spin" /> : <Scale size={18} />}
              Create Cassation
            </button>

            <button
              type="button"
              className="button button-secondary"
              onClick={() => void handleTransition("execution")}
              disabled={!canOpenExecution || !selectedProceedingId || runningActionKey !== null}
            >
              {runningActionKey?.startsWith("execution:") ? <LoaderCircle size={18} className="animate-spin" /> : <FilePlus2 size={18} />}
              Open Execution File
            </button>

            <button
              type="button"
              className="button button-secondary"
              onClick={() => void handleTransition("complaint_to_lawsuit")}
              disabled={!canCreateProceeding || !selectedProceedingId || runningActionKey !== null}
            >
              {runningActionKey?.startsWith("complaint_to_lawsuit:") ? <LoaderCircle size={18} className="animate-spin" /> : <Gavel size={18} />}
              Complaint to Lawsuit
            </button>

            <button
              type="button"
              className="button button-secondary"
              onClick={() => void handleTransition("complaint_to_prosecution")}
              disabled={!canCreateProceeding || !selectedProceedingId || runningActionKey !== null}
            >
              {runningActionKey?.startsWith("complaint_to_prosecution:") ? <LoaderCircle size={18} className="animate-spin" /> : <Scale size={18} />}
              Complaint to Prosecution
            </button>

            <button type="button" className="button button-secondary" disabled title="Linking related case is pending API contract.">
              <Link2 size={18} />
              Link Related Case
            </button>

            <button type="button" className="button button-secondary" onClick={() => void Promise.all([loadMatter(), loadDrafts()])} disabled={loading || draftsLoading}>
              <RefreshCw size={18} />
              Refresh
            </button>

            <Link className="button button-secondary" href="/matters">
              <CircleChevronRight size={18} />
              Back to Matters
            </Link>
          </div>

          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            <label style={{ display: "grid", gap: 6, maxWidth: 560 }}>
              <span>Select Source Proceeding</span>
              <select
                value={selectedProceedingId}
                onChange={(event) => setSelectedProceedingId(event.target.value)}
                style={inputStyle}
              >
                <option value="">Choose proceeding</option>
                {proceedings.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.actionType} | {row.caseNumber ?? row.reportNumber ?? row.id}
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
          <h2 style={{ marginTop: 0 }}>Create Proceeding / Complaint / Report</h2>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setShowProceedingForm((value) => !value)}
            disabled={!canCreateProceeding}
            title={canCreateProceeding ? undefined : "Missing create_proceeding permission"}
          >
            <CirclePlus size={18} />
            {showProceedingForm ? "Hide Form" : "Create Action"}
          </button>

          {showProceedingForm ? (
            <form onSubmit={handleCreateProceeding} style={{ marginTop: 14, display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <span>Action Type</span>
                <select
                  value={proceedingForm.actionType}
                  onChange={(event) => {
                    const actionType = event.target.value as ActionType;
                    setProceedingForm((value) => ({ ...value, actionType }));
                  }}
                  style={inputStyle}
                >
                  <option value="lawsuit">lawsuit</option>
                  <option value="appeal">appeal</option>
                  <option value="cassation">cassation</option>
                  <option value="execution">execution</option>
                  <option value="urgent_request">urgent_request</option>
                  <option value="police_report">police_report</option>
                  <option value="public_prosecution_complaint">public_prosecution_complaint</option>
                  <option value="cybercrime_report">cybercrime_report</option>
                  <option value="labor_complaint">labor_complaint</option>
                  <option value="administrative_complaint">administrative_complaint</option>
                  <option value="regulatory_complaint">regulatory_complaint</option>
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

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={proceedingForm.clientVisible}
                  onChange={(event) => setProceedingForm((value) => ({ ...value, clientVisible: event.target.checked }))}
                />
                <span>Share this proceeding with client portal</span>
              </label>

              {showLawsuitFields ? (
                <div style={subPanelStyle}>
                  <p style={subPanelTitleStyle}>Lawsuit / Court Fields</p>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Case Number</span>
                    <input
                      value={proceedingForm.caseNumber}
                      onChange={(event) => setProceedingForm((value) => ({ ...value, caseNumber: event.target.value }))}
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
                    <span>Circuit</span>
                    <input
                      value={proceedingForm.circuit}
                      onChange={(event) => setProceedingForm((value) => ({ ...value, circuit: event.target.value }))}
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
                    <span>Claim Type</span>
                    <input
                      value={proceedingForm.claimType}
                      onChange={(event) => setProceedingForm((value) => ({ ...value, claimType: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Judgment Summary</span>
                    <textarea
                      rows={3}
                      value={proceedingForm.judgmentSummary}
                      onChange={(event) => setProceedingForm((value) => ({ ...value, judgmentSummary: event.target.value }))}
                      style={{ ...inputStyle, resize: "vertical", padding: 10 }}
                    />
                  </label>
                </div>
              ) : null}

              {showComplaintFields ? (
                <div style={subPanelStyle}>
                  <p style={subPanelTitleStyle}>Complaint / Report Fields</p>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Authority</span>
                    <input
                      value={proceedingForm.authority}
                      onChange={(event) => setProceedingForm((value) => ({ ...value, authority: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Report Number</span>
                    <input
                      value={proceedingForm.reportNumber}
                      onChange={(event) => setProceedingForm((value) => ({ ...value, reportNumber: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Submission Date</span>
                    <input
                      type="datetime-local"
                      value={proceedingForm.submissionDate}
                      onChange={(event) => setProceedingForm((value) => ({ ...value, submissionDate: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Complainant</span>
                    <input
                      value={proceedingForm.complainant}
                      onChange={(event) => setProceedingForm((value) => ({ ...value, complainant: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Accused/Respondent</span>
                    <input
                      value={proceedingForm.respondent}
                      onChange={(event) => setProceedingForm((value) => ({ ...value, respondent: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Prosecutor</span>
                    <input
                      value={proceedingForm.prosecutorName}
                      onChange={(event) => setProceedingForm((value) => ({ ...value, prosecutorName: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                  <label style={{ display: "grid", gap: 6 }}>
                    <span>Police Station</span>
                    <input
                      value={proceedingForm.policeStation}
                      onChange={(event) => setProceedingForm((value) => ({ ...value, policeStation: event.target.value }))}
                      style={inputStyle}
                    />
                  </label>
                </div>
              ) : null}

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
                {creatingProceeding ? "Creating..." : "Create Action"}
              </button>
            </form>
          ) : null}
        </section>

        <section className="panel" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Proceedings</h2>

          {loading ? (
            <p className="muted" style={{ margin: 0 }}>Loading proceedings...</p>
          ) : null}

          {!loading && errorMessage ? (
            <div>
              <p role="alert" style={{ color: "#b42318", marginTop: 0 }}>{errorMessage}</p>
              <button type="button" className="button button-secondary" onClick={() => void loadMatter()}>
                Retry
              </button>
            </div>
          ) : null}

          {!loading && !errorMessage && proceedings.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No proceedings available for this matter yet.</p>
          ) : null}

          {!loading && !errorMessage && proceedings.length > 0 ? (
            <div style={{ display: "grid", gap: 12 }}>
              {proceedings.map((row) => (
                <article key={row.id} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <strong>{row.actionType}</strong>
                      <p className="muted" style={{ margin: "4px 0 0" }}>
                        {row.caseNumber ?? row.reportNumber ?? row.id}
                      </p>
                    </div>
                    <span className="status-chip">{row.status}</span>
                  </div>
                  <div style={detailsGridStyle}>
                    <span>Stage: {row.stage}</span>
                    <span>Court/Authority: {row.court?.nameAr ?? row.authority ?? "N/A"}</span>
                    <span>Circuit/Dept: {row.circuit ?? row.department ?? "N/A"}</span>
                    <span>Hearings: {row.hearings.length}</span>
                    <span>Documents: {row.documents.length}</span>
                    <span>Tasks: {row.tasks.length}</span>
                    <span>Notifications: {row.updates.length}</span>
                    <span>Billing Records: {row.fees.length}</span>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <Link className="button button-secondary" href={`/matters/${matterId}/proceedings/${row.id}`}>
                      Open Proceeding Workspace
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="panel" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Timeline</h2>

          {loading ? (
            <p className="muted" style={{ margin: 0 }}>Loading timeline...</p>
          ) : null}

          {!loading && !errorMessage && timelineEntries.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No timeline events yet.</p>
          ) : null}

          {!loading && !errorMessage && timelineEntries.length > 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              {timelineEntries.map((entry) => (
                <article key={entry.id} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <strong>{entry.title}</strong>
                    <span className="status-chip">{entry.eventType}</span>
                  </div>
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    Ref: {entry.reference} | Stage: {entry.stage} | Event date: {formatDate(entry.eventDate)}
                  </p>
                  {entry.description ? <p style={{ margin: "6px 0 0" }}>{entry.description}</p> : null}
                  <p className="muted" style={{ margin: "6px 0 0" }}>
                    Hearings: {entry.hearingsCount} | Notifications: {entry.updatesCount}
                  </p>
                </article>
              ))}
            </div>
          ) : null}

          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            <h3 style={{ margin: 0, fontSize: 18 }}>Hearings</h3>
            {hearings.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No hearings scheduled yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {hearings.map((hearing) => (
                  <article key={hearing.id} style={cardStyle}>
                    <strong>{hearing.actionType}</strong>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      Hearing: {formatDate(hearing.hearingAt)} | Status: {hearing.status ?? "N/A"}
                    </p>
                    {hearing.agenda ? <p style={{ margin: "6px 0 0" }}>Agenda: {hearing.agenda}</p> : null}
                    {hearing.outcome ? <p style={{ margin: "6px 0 0" }}>Outcome: {hearing.outcome}</p> : null}
                  </article>
                ))}
              </div>
            )}

            <h3 style={{ margin: "8px 0 0", fontSize: 18 }}>Notifications</h3>
            {notifications.length === 0 ? (
              <p className="muted" style={{ margin: 0 }}>No notifications yet.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {notifications.map((notification) => (
                  <article key={notification.id} style={cardStyle}>
                    <strong>{notification.title ?? "Update"}</strong>
                    <p className="muted" style={{ margin: "4px 0 0" }}>
                      {notification.actionType} | {formatDate(notification.createdAt)}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="panel" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Drafts</h2>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void handleCreateDraft()}
            disabled={creatingDraft || !canCreateProceeding}
            title={canCreateProceeding ? undefined : "Missing create_proceeding permission"}
          >
            {creatingDraft ? <LoaderCircle size={18} className="animate-spin" /> : <CirclePlus size={18} />}
            {creatingDraft ? "Creating Draft..." : "Create Draft"}
          </button>

          {createDraftError ? (
            <p role="alert" style={{ color: "#b42318", margin: "12px 0 0" }}>{createDraftError}</p>
          ) : null}
          {createDraftSuccess ? (
            <p style={{ color: "#067647", margin: "12px 0 0" }}>{createDraftSuccess}</p>
          ) : null}

          {draftsLoading ? (
            <p className="muted" style={{ marginTop: 12 }}>Loading drafts...</p>
          ) : null}

          {!draftsLoading && draftsErrorMessage ? (
            <div style={{ marginTop: 12 }}>
              <p role="alert" style={{ color: "#b42318", marginTop: 0 }}>{draftsErrorMessage}</p>
              <button type="button" className="button button-secondary" onClick={() => void loadDrafts()}>
                Retry Drafts
              </button>
            </div>
          ) : null}

          {!draftsLoading && !draftsErrorMessage && drafts.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>No drafts created yet.</p>
          ) : null}

          {!draftsLoading && !draftsErrorMessage && drafts.length > 0 ? (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {drafts.map((draft) => {
                const isActive = activeDraftId === draft.id;
                return (
                  <article key={draft.id} style={{ ...cardStyle, borderColor: isActive ? "#0b66ff" : "var(--line)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div>
                        <strong>{draft.title}</strong>
                        <p className="muted" style={{ margin: "4px 0 0" }}>
                          {draft.actionType} | Updated: {formatDate(draft.updatedAt)}
                        </p>
                      </div>
                      <span className="status-chip">{draft.status}</span>
                    </div>
                    {draft.notes ? <p style={{ margin: "8px 0 0" }}>{draft.notes}</p> : null}
                    <button
                      type="button"
                      className="button button-secondary"
                      onClick={() => setActiveDraftId(draft.id)}
                      style={{ width: "fit-content" }}
                    >
                      <FolderOpen size={18} />
                      Open Draft Workflow
                    </button>
                  </article>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="panel" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Documents</h2>
          {loading ? (
            <p className="muted" style={{ margin: 0 }}>Loading documents...</p>
          ) : null}
          {!loading && !errorMessage && documents.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No documents found for this matter.</p>
          ) : null}
          {!loading && !errorMessage && documents.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {documents.map((document) => (
                <article key={document.id} style={cardStyle}>
                  <strong>{document.title ?? "Untitled Document"}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {document.actionType} | {document.documentType ?? "document"} | {document.classification ?? "N/A"}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    Updated: {formatDate(document.updatedAt)}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="panel" style={{ marginBottom: 16 }}>
          <h2 style={{ marginTop: 0 }}>Tasks</h2>
          {loading ? (
            <p className="muted" style={{ margin: 0 }}>Loading tasks...</p>
          ) : null}
          {!loading && !errorMessage && tasks.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No tasks assigned yet.</p>
          ) : null}
          {!loading && !errorMessage && tasks.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {tasks.map((task) => (
                <article key={task.id} style={cardStyle}>
                  <strong>{task.title ?? "Untitled Task"}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {task.actionType} | Status: {task.status ?? "N/A"} | Priority: {task.priority ?? "N/A"}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    Due: {formatDate(task.dueAt)}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Billing</h2>
          {loading ? (
            <p className="muted" style={{ margin: 0 }}>Loading billing records...</p>
          ) : null}
          {!loading && !errorMessage && billingEntries.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>No billing records available.</p>
          ) : null}
          {!loading && !errorMessage && billingEntries.length > 0 ? (
            <div style={{ display: "grid", gap: 8 }}>
              {billingEntries.map((entry) => (
                <article key={entry.id} style={cardStyle}>
                  <strong>{entry.invoiceNumber ?? "Invoice"}</strong>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    {entry.actionType} | Status: {entry.status ?? "N/A"}
                  </p>
                  <p className="muted" style={{ margin: "4px 0 0" }}>
                    Total: {formatCurrency(entry.totalAmount)} | Balance: {formatCurrency(entry.balanceDue)} | Due: {formatDate(entry.dueAt)}
                  </p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

type TransitionAction =
  | "appeal"
  | "cassation"
  | "execution"
  | "complaint_to_lawsuit"
  | "complaint_to_prosecution";

const transitionEndpointByAction: Record<TransitionAction, string> = {
  appeal: "convert-to-appeal",
  cassation: "convert-to-cassation",
  execution: "open-execution",
  complaint_to_lawsuit: "convert-to-lawsuit",
  complaint_to_prosecution: "convert-to-prosecution-case",
};

const successMessageByAction: Record<TransitionAction, string> = {
  appeal: "Appeal proceeding created.",
  cassation: "Cassation proceeding created.",
  execution: "Execution proceeding opened.",
  complaint_to_lawsuit: "Complaint converted to lawsuit.",
  complaint_to_prosecution: "Complaint converted to prosecution case.",
};

function isTransitionAllowed(
  action: TransitionAction,
  permissions: {
    canCreateAppeal: boolean;
    canCreateCassation: boolean;
    canOpenExecution: boolean;
    canCreateProceeding: boolean;
  },
) {
  if (action === "appeal") return permissions.canCreateAppeal;
  if (action === "cassation") return permissions.canCreateCassation;
  if (action === "execution") return permissions.canOpenExecution;
  return permissions.canCreateProceeding;
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

const cardStyle: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  padding: 12,
  background: "var(--surface)",
  display: "grid",
  gap: 4,
};

const detailsGridStyle: CSSProperties = {
  marginTop: 10,
  display: "grid",
  gap: 8,
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

function toIsoOrUndefined(value: string) {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function matterStatusLabel(status: IntakeWorkflowStatus) {
  if (status === "draft") return "Draft";
  if (status === "pending_documents") return "Pending Documents";
  return "Active";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDate(value: string | null) {
  if (!value) {
    return "N/A";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
}

function formatCurrency(value: number | null) {
  if (value === null) {
    return "N/A";
  }

  return `${value.toFixed(2)} QAR`;
}
