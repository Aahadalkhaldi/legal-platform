export type ProceedingLifecycleStage = "first_instance" | "appeal" | "cassation" | "execution";

export type ProceedingLifecycleEventType = "hearing" | "filing" | "judgment" | "appeal" | "cassation" | "execution";

export type ProceedingSession = {
  id: string;
  stage: ProceedingLifecycleStage;
  hearingDate: string;
  hearingResult: string | null;
  nextHearing: string | null;
  reminderAt: string | null;
  notes: string | null;
  createdAt: string;
};

export type ProceedingFiling = {
  id: string;
  title: string;
  filedAt: string;
  notes: string | null;
};

export type ProceedingPayment = {
  id: string;
  title: string;
  filedAt: string;
  amountQar: number | null;
  notes: string | null;
};

export type ProceedingJudgment = {
  id: string;
  stage: "first_instance" | "appeal" | "cassation";
  judgmentDate: string;
  summary: string;
  isFinal: boolean;
  appealAvailable: boolean;
  createdAt: string;
};

export type ProceedingExecutionClosure = {
  closedAt: string;
  notes: string | null;
};

export type ProceedingTimelineEvent = {
  id: string;
  eventType: ProceedingLifecycleEventType;
  stage: string;
  title: string;
  description: string | null;
  eventDate: string;
};

export type ProceedingLifecycleWorkspace = {
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
    closure: ProceedingExecutionClosure | null;
  };
  timeline: ProceedingTimelineEvent[];
  sessionManagement: ProceedingSession[];
  judgmentManagement: ProceedingJudgment[];
};

export type ProceedingFilingType =
  | "pleading"
  | "evidence"
  | "expert_report"
  | "execution_application"
  | "objection"
  | "attachment"
  | "seizure"
  | "payment";

export type ProceedingLifecycleMutation =
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
      filingType: ProceedingFilingType;
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

export type ProceedingLifecycleMutationResult = {
  metadata: Record<string, unknown>;
  lifecycle: ProceedingLifecycleWorkspace;
  nextDeadlineAt?: string;
  judgmentSummary?: string;
};

export type MatterLifecycleSummary = {
  progressPercent: number;
  currentStage: string;
  nextLegalAction: string;
  openProceedings: number;
  closedProceedings: number;
};

export type MatterLifecycleSummaryInput = Array<{
  stage: string;
  status: string;
  actionType: string;
  nextDeadlineAt?: string | null;
}>;

export type ProceedingTimelineBuildInput = {
  proceeding: {
    id: string;
    actionType: string;
    stage: string;
    status: string;
    caseNumber?: string | null;
    reportNumber?: string | null;
    createdAt?: string | null;
    nextDeadlineAt?: string | null;
  };
  lifecycle: ProceedingLifecycleWorkspace;
  hearings?: Array<Record<string, unknown>>;
  documents?: Array<Record<string, unknown>>;
  updates?: Array<Record<string, unknown>>;
};

export function createEmptyProceedingLifecycle(): ProceedingLifecycleWorkspace {
  return {
    firstInstance: {
      hearings: [],
      pleadings: [],
      evidence: [],
      expertReports: [],
      judgment: null,
    },
    appeal: {
      parentProceedingId: null,
      grounds: [],
      hearings: [],
      judgment: null,
    },
    cassation: {
      grounds: [],
      sessions: [],
      judgment: null,
    },
    execution: {
      executionFileNumber: null,
      applications: [],
      objections: [],
      attachments: [],
      seizures: [],
      payments: [],
      closure: null,
    },
    timeline: [],
    sessionManagement: [],
    judgmentManagement: [],
  };
}

export function readProceedingLifecycle(metadata: unknown): ProceedingLifecycleWorkspace {
  const root = asRecord(metadata);
  const rawWorkspace = asRecord(root?.lifecycleWorkspace);
  const base = createEmptyProceedingLifecycle();

  if (!rawWorkspace) {
    return base;
  }

  const firstInstance = asRecord(rawWorkspace.firstInstance);
  const appeal = asRecord(rawWorkspace.appeal);
  const cassation = asRecord(rawWorkspace.cassation);
  const execution = asRecord(rawWorkspace.execution);

  const lifecycle: ProceedingLifecycleWorkspace = {
    ...base,
    firstInstance: {
      hearings: parseSessions(firstInstance?.hearings, "first_instance"),
      pleadings: parseFilings(firstInstance?.pleadings),
      evidence: parseFilings(firstInstance?.evidence),
      expertReports: parseFilings(firstInstance?.expertReports),
      judgment: parseJudgment(firstInstance?.judgment, "first_instance"),
    },
    appeal: {
      parentProceedingId: stringValue(appeal?.parentProceedingId),
      grounds: parseStringArray(appeal?.grounds),
      hearings: parseSessions(appeal?.hearings, "appeal"),
      judgment: parseJudgment(appeal?.judgment, "appeal"),
    },
    cassation: {
      grounds: parseStringArray(cassation?.grounds),
      sessions: parseSessions(cassation?.sessions, "cassation"),
      judgment: parseJudgment(cassation?.judgment, "cassation"),
    },
    execution: {
      executionFileNumber: stringValue(execution?.executionFileNumber),
      applications: parseFilings(execution?.applications),
      objections: parseFilings(execution?.objections),
      attachments: parseFilings(execution?.attachments),
      seizures: parseFilings(execution?.seizures),
      payments: parsePayments(execution?.payments),
      closure: parseExecutionClosure(execution?.closure),
    },
    timeline: parseTimeline(rawWorkspace.timeline),
    sessionManagement: [],
    judgmentManagement: [],
  };

  lifecycle.sessionManagement = [
    ...lifecycle.firstInstance.hearings,
    ...lifecycle.appeal.hearings,
    ...lifecycle.cassation.sessions,
  ].sort((a, b) => b.hearingDate.localeCompare(a.hearingDate));

  lifecycle.judgmentManagement = [
    lifecycle.firstInstance.judgment,
    lifecycle.appeal.judgment,
    lifecycle.cassation.judgment,
  ]
    .filter((entry): entry is ProceedingJudgment => entry !== null)
    .sort((a, b) => b.judgmentDate.localeCompare(a.judgmentDate));

  return lifecycle;
}

export function writeProceedingLifecycle(metadata: unknown, lifecycle: ProceedingLifecycleWorkspace) {
  const root = asRecord(metadata) ?? {};

  return {
    ...root,
    lifecycleWorkspace: {
      firstInstance: lifecycle.firstInstance,
      appeal: lifecycle.appeal,
      cassation: lifecycle.cassation,
      execution: lifecycle.execution,
      timeline: lifecycle.timeline,
    },
  };
}

export function applyProceedingLifecycleMutation(input: {
  metadata: unknown;
  mutation: ProceedingLifecycleMutation;
  nowIso: string;
  createId: () => string;
}): ProceedingLifecycleMutationResult {
  const lifecycle = readProceedingLifecycle(input.metadata);
  const now = input.nowIso;
  let nextDeadlineAt: string | undefined;
  let judgmentSummary: string | undefined;
  const pushTimeline = (event: Omit<ProceedingTimelineEvent, "id">) => {
    lifecycle.timeline = [
      ...lifecycle.timeline,
      { id: input.createId(), ...event },
    ];
  };

  if (input.mutation.action === "add_session") {
    const session: ProceedingSession = {
      id: input.createId(),
      stage: input.mutation.stage,
      hearingDate: input.mutation.hearingDate,
      hearingResult: optionalString(input.mutation.hearingResult),
      nextHearing: optionalString(input.mutation.nextHearing),
      reminderAt: optionalString(input.mutation.reminderAt),
      notes: optionalString(input.mutation.notes),
      createdAt: now,
    };

    if (input.mutation.stage === "first_instance") {
      lifecycle.firstInstance.hearings = [...lifecycle.firstInstance.hearings, session];
    } else if (input.mutation.stage === "appeal") {
      lifecycle.appeal.hearings = [...lifecycle.appeal.hearings, session];
    } else {
      lifecycle.cassation.sessions = [...lifecycle.cassation.sessions, session];
    }

    nextDeadlineAt = optionalString(input.mutation.nextHearing) ?? undefined;

    pushTimeline({
      eventType: "hearing",
      stage: input.mutation.stage,
      title: `${stageLabel(input.mutation.stage)} hearing recorded`,
      description: session.hearingResult ?? session.notes,
      eventDate: session.hearingDate,
    });
  }

  if (input.mutation.action === "add_filing") {
    const filedAt = input.mutation.filedAt ?? now;
    if (input.mutation.filingType === "payment") {
      const payment: ProceedingPayment = {
        id: input.createId(),
        title: input.mutation.title,
        filedAt,
        amountQar: typeof input.mutation.amountQar === "number" ? input.mutation.amountQar : null,
        notes: optionalString(input.mutation.notes),
      };
      lifecycle.execution.payments = [...lifecycle.execution.payments, payment];
    } else {
      const filing: ProceedingFiling = {
        id: input.createId(),
        title: input.mutation.title,
        filedAt,
        notes: optionalString(input.mutation.notes),
      };

      if (input.mutation.filingType === "pleading") {
        lifecycle.firstInstance.pleadings = [...lifecycle.firstInstance.pleadings, filing];
      } else if (input.mutation.filingType === "evidence") {
        lifecycle.firstInstance.evidence = [...lifecycle.firstInstance.evidence, filing];
      } else if (input.mutation.filingType === "expert_report") {
        lifecycle.firstInstance.expertReports = [...lifecycle.firstInstance.expertReports, filing];
      } else if (input.mutation.filingType === "execution_application") {
        lifecycle.execution.applications = [...lifecycle.execution.applications, filing];
      } else if (input.mutation.filingType === "objection") {
        lifecycle.execution.objections = [...lifecycle.execution.objections, filing];
      } else if (input.mutation.filingType === "attachment") {
        lifecycle.execution.attachments = [...lifecycle.execution.attachments, filing];
      } else if (input.mutation.filingType === "seizure") {
        lifecycle.execution.seizures = [...lifecycle.execution.seizures, filing];
      }
    }

    pushTimeline({
      eventType: isExecutionFiling(input.mutation.filingType) ? "execution" : "filing",
      stage: isExecutionFiling(input.mutation.filingType) ? "execution" : "first_instance",
      title: `${filingLabel(input.mutation.filingType)} submitted`,
      description: optionalString(input.mutation.notes),
      eventDate: filedAt,
    });
  }

  if (input.mutation.action === "set_judgment") {
    const judgment: ProceedingJudgment = {
      id: input.createId(),
      stage: input.mutation.stage,
      judgmentDate: input.mutation.judgmentDate,
      summary: input.mutation.summary,
      isFinal: input.mutation.isFinal,
      appealAvailable: input.mutation.appealAvailable,
      createdAt: now,
    };

    if (input.mutation.stage === "first_instance") {
      lifecycle.firstInstance.judgment = judgment;
    } else if (input.mutation.stage === "appeal") {
      lifecycle.appeal.judgment = judgment;
    } else {
      lifecycle.cassation.judgment = judgment;
    }

    judgmentSummary = input.mutation.summary;

    pushTimeline({
      eventType: "judgment",
      stage: input.mutation.stage,
      title: `${stageLabel(input.mutation.stage)} judgment recorded`,
      description: input.mutation.summary,
      eventDate: input.mutation.judgmentDate,
    });
  }

  if (input.mutation.action === "set_appeal_grounds") {
    lifecycle.appeal.grounds = input.mutation.grounds;
    lifecycle.appeal.parentProceedingId = optionalString(input.mutation.parentProceedingId) ?? lifecycle.appeal.parentProceedingId;

    pushTimeline({
      eventType: "appeal",
      stage: "appeal",
      title: "Appeal grounds updated",
      description: input.mutation.grounds.join("; "),
      eventDate: now,
    });
  }

  if (input.mutation.action === "set_cassation_grounds") {
    lifecycle.cassation.grounds = input.mutation.grounds;

    pushTimeline({
      eventType: "cassation",
      stage: "cassation",
      title: "Cassation grounds updated",
      description: input.mutation.grounds.join("; "),
      eventDate: now,
    });
  }

  if (input.mutation.action === "set_execution_file") {
    lifecycle.execution.executionFileNumber = input.mutation.executionFileNumber;

    pushTimeline({
      eventType: "execution",
      stage: "execution",
      title: "Execution file registered",
      description: `Execution file #${input.mutation.executionFileNumber}`,
      eventDate: now,
    });
  }

  if (input.mutation.action === "close_execution") {
    const closedAt = input.mutation.closedAt ?? now;
    lifecycle.execution.closure = {
      closedAt,
      notes: optionalString(input.mutation.notes),
    };

    pushTimeline({
      eventType: "execution",
      stage: "execution",
      title: "Execution file closed",
      description: optionalString(input.mutation.notes),
      eventDate: closedAt,
    });
  }

  const normalizedLifecycle = readProceedingLifecycle(writeProceedingLifecycle({}, lifecycle));

  return {
    metadata: writeProceedingLifecycle(input.metadata, normalizedLifecycle),
    lifecycle: normalizedLifecycle,
    nextDeadlineAt,
    judgmentSummary,
  };
}

export function buildProceedingTimeline(input: ProceedingTimelineBuildInput) {
  const events: ProceedingTimelineEvent[] = [...input.lifecycle.timeline];

  const createdEventDate = input.proceeding.createdAt ?? input.proceeding.nextDeadlineAt ?? new Date(0).toISOString();
  events.push({
    id: `${input.proceeding.id}:created`,
    eventType: eventTypeForStage(input.proceeding.stage),
    stage: input.proceeding.stage,
    title: `${stageLabel(input.proceeding.stage)} proceeding started`,
    description: input.proceeding.caseNumber ?? input.proceeding.reportNumber ?? null,
    eventDate: createdEventDate,
  });

  for (const row of input.hearings ?? []) {
    const hearingAt = stringValue(row.hearing_at);
    if (!hearingAt) continue;
    events.push({
      id: stringValue(row.id) ?? `hearing:${events.length}`,
      eventType: "hearing",
      stage: input.proceeding.stage,
      title: "Court hearing logged",
      description: stringValue(row.outcome) ?? stringValue(row.agenda),
      eventDate: hearingAt,
    });
  }

  for (const row of input.documents ?? []) {
    const updatedAt = stringValue(row.updated_at);
    if (!updatedAt) continue;
    events.push({
      id: stringValue(row.id) ?? `document:${events.length}`,
      eventType: "filing",
      stage: input.proceeding.stage,
      title: stringValue(row.title) ?? "Document uploaded",
      description: stringValue(row.document_type),
      eventDate: updatedAt,
    });
  }

  for (const row of input.updates ?? []) {
    const createdAt = stringValue(row.created_at);
    if (!createdAt) continue;
    events.push({
      id: stringValue(row.id) ?? `update:${events.length}`,
      eventType: "filing",
      stage: input.proceeding.stage,
      title: stringValue(row.title) ?? "Matter update",
      description: null,
      eventDate: createdAt,
    });
  }

  return events.sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

export function deriveMatterLifecycleSummary(proceedings: MatterLifecycleSummaryInput): MatterLifecycleSummary {
  if (proceedings.length === 0) {
    return {
      progressPercent: 0,
      currentStage: "No active proceeding",
      nextLegalAction: "Create the first proceeding",
      openProceedings: 0,
      closedProceedings: 0,
    };
  }

  const openProceedings = proceedings.filter((row) => row.status !== "closed" && row.status !== "archived");
  const closedProceedings = proceedings.filter((row) => row.status === "closed" || row.status === "archived");

  const active = (openProceedings.length > 0 ? openProceedings : proceedings).sort((a, b) => stageWeight(b.stage) - stageWeight(a.stage))[0];
  const progressPercent = Math.max(...proceedings.map((row) => stageProgress(row.stage)));
  const nextLegalAction = resolveNextLegalAction(active, proceedings);

  return {
    progressPercent,
    currentStage: stageLabel(active.stage),
    nextLegalAction,
    openProceedings: openProceedings.length,
    closedProceedings: closedProceedings.length,
  };
}

function resolveNextLegalAction(
  activeProceeding: { stage: string; status: string; nextDeadlineAt?: string | null },
  proceedings: MatterLifecycleSummaryInput,
) {
  if (activeProceeding.nextDeadlineAt) {
    return `Prepare filing/hearing for ${new Date(activeProceeding.nextDeadlineAt).toLocaleDateString()}`;
  }

  if (activeProceeding.stage === "first_instance" && activeProceeding.status === "closed") {
    return "Evaluate and file appeal grounds";
  }

  if (activeProceeding.stage === "appeal" && activeProceeding.status === "closed") {
    return "Evaluate and file cassation grounds";
  }

  if (activeProceeding.stage === "cassation" && activeProceeding.status === "closed") {
    return "Open execution file and start enforcement applications";
  }

  if (proceedings.some((row) => row.stage === "execution" && row.status !== "closed" && row.status !== "archived")) {
    return "Track execution applications, objections, and collections";
  }

  return "Record next legal filing or hearing action";
}

function stageWeight(stage: string) {
  if (stage === "execution") return 5;
  if (stage === "cassation") return 4;
  if (stage === "appeal") return 3;
  if (stage === "first_instance") return 2;
  if (stage === "urgent_request") return 1;
  return 0;
}

function stageProgress(stage: string) {
  if (stage === "execution") return 100;
  if (stage === "cassation") return 75;
  if (stage === "appeal") return 50;
  if (stage === "first_instance") return 25;
  return 15;
}

function stageLabel(stage: string) {
  if (stage === "first_instance") return "First Instance";
  if (stage === "appeal") return "Appeal";
  if (stage === "cassation") return "Cassation";
  if (stage === "execution") return "Execution";
  if (stage === "urgent_request") return "Urgent Request";
  if (stage === "related_case") return "Related Complaint/Report";
  return stage;
}

function eventTypeForStage(stage: string): ProceedingLifecycleEventType {
  if (stage === "appeal") return "appeal";
  if (stage === "cassation") return "cassation";
  if (stage === "execution") return "execution";
  return "filing";
}

function filingLabel(filingType: ProceedingFilingType): string {
  if (filingType === "expert_report") return "Expert report";
  if (filingType === "execution_application") return "Execution application";
  if (filingType === "objection") return "Execution objection";
  if (filingType === "attachment") return "Attachment request";
  if (filingType === "seizure") return "Seizure action";
  if (filingType === "payment") return "Payment entry";
  if (filingType === "pleading") return "Pleading";
  return "Evidence filing";
}

function isExecutionFiling(filingType: ProceedingFilingType) {
  return filingType === "execution_application"
    || filingType === "objection"
    || filingType === "attachment"
    || filingType === "seizure"
    || filingType === "payment";
}

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseSessions(value: unknown, defaultStage: ProceedingLifecycleStage) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const typed = asRecord(entry);
      const hearingDate = stringValue(typed?.hearingDate);
      if (!hearingDate) return null;

      return {
        id: stringValue(typed?.id) ?? `session:${hearingDate}`,
        stage: parseStage(stringValue(typed?.stage)) ?? defaultStage,
        hearingDate,
        hearingResult: stringValue(typed?.hearingResult),
        nextHearing: stringValue(typed?.nextHearing),
        reminderAt: stringValue(typed?.reminderAt),
        notes: stringValue(typed?.notes),
        createdAt: stringValue(typed?.createdAt) ?? hearingDate,
      } as ProceedingSession;
    })
    .filter((entry): entry is ProceedingSession => entry !== null)
    .sort((a, b) => b.hearingDate.localeCompare(a.hearingDate));
}

function parseFilings(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const typed = asRecord(entry);
      const filedAt = stringValue(typed?.filedAt);
      const title = stringValue(typed?.title);
      if (!filedAt || !title) return null;

      return {
        id: stringValue(typed?.id) ?? `filing:${filedAt}:${title}`,
        title,
        filedAt,
        notes: stringValue(typed?.notes),
      } as ProceedingFiling;
    })
    .filter((entry): entry is ProceedingFiling => entry !== null)
    .sort((a, b) => b.filedAt.localeCompare(a.filedAt));
}

function parsePayments(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const typed = asRecord(entry);
      const filedAt = stringValue(typed?.filedAt);
      const title = stringValue(typed?.title);
      if (!filedAt || !title) return null;

      return {
        id: stringValue(typed?.id) ?? `payment:${filedAt}:${title}`,
        title,
        filedAt,
        amountQar: numberValue(typed?.amountQar),
        notes: stringValue(typed?.notes),
      } as ProceedingPayment;
    })
    .filter((entry): entry is ProceedingPayment => entry !== null)
    .sort((a, b) => b.filedAt.localeCompare(a.filedAt));
}

function parseJudgment(value: unknown, stage: "first_instance" | "appeal" | "cassation") {
  const typed = asRecord(value);
  if (!typed) return null;

  const judgmentDate = stringValue(typed.judgmentDate);
  const summary = stringValue(typed.summary);
  if (!judgmentDate || !summary) return null;

  return {
    id: stringValue(typed.id) ?? `judgment:${stage}:${judgmentDate}`,
    stage,
    judgmentDate,
    summary,
    isFinal: Boolean(typed.isFinal),
    appealAvailable: Boolean(typed.appealAvailable),
    createdAt: stringValue(typed.createdAt) ?? judgmentDate,
  } as ProceedingJudgment;
}

function parseExecutionClosure(value: unknown) {
  const typed = asRecord(value);
  if (!typed) return null;

  const closedAt = stringValue(typed.closedAt);
  if (!closedAt) return null;

  return {
    closedAt,
    notes: stringValue(typed.notes),
  } as ProceedingExecutionClosure;
}

function parseTimeline(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const typed = asRecord(entry);
      if (!typed) return null;
      const eventDate = stringValue(typed.eventDate);
      const title = stringValue(typed.title);
      const eventType = stringValue(typed.eventType);
      const stage = stringValue(typed.stage);
      if (!eventDate || !title || !eventType || !stage) return null;

      return {
        id: stringValue(typed.id) ?? `${eventType}:${eventDate}:${title}`,
        eventType: normalizeEventType(eventType),
        stage,
        title,
        description: stringValue(typed.description),
        eventDate,
      } as ProceedingTimelineEvent;
    })
    .filter((entry): entry is ProceedingTimelineEvent => entry !== null)
    .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
}

function normalizeEventType(value: string): ProceedingLifecycleEventType {
  if (value === "hearing" || value === "filing" || value === "judgment" || value === "appeal" || value === "cassation" || value === "execution") {
    return value;
  }

  return "filing";
}

function parseStage(value: string | null): ProceedingLifecycleStage | null {
  if (value === "first_instance" || value === "appeal" || value === "cassation" || value === "execution") {
    return value;
  }

  return null;
}

function optionalString(value: string | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
