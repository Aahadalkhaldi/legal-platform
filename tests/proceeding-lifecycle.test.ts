import { describe, expect, it } from "vitest";
import {
  applyProceedingLifecycleMutation,
  buildProceedingTimeline,
  createEmptyProceedingLifecycle,
  deriveMatterLifecycleSummary,
  readProceedingLifecycle,
  writeProceedingLifecycle,
} from "@/lib/proceeding-lifecycle";

describe("proceeding lifecycle workspace", () => {
  it("returns empty lifecycle defaults when metadata has no workspace", () => {
    const lifecycle = readProceedingLifecycle({});
    expect(lifecycle.firstInstance.hearings).toHaveLength(0);
    expect(lifecycle.appeal.grounds).toHaveLength(0);
    expect(lifecycle.execution.executionFileNumber).toBeNull();
    expect(lifecycle.timeline).toHaveLength(0);
  });

  it("adds a session and timeline event with next deadline", () => {
    const mutation = applyProceedingLifecycleMutation({
      metadata: {},
      mutation: {
        action: "add_session",
        stage: "first_instance",
        hearingDate: "2026-05-29T09:00:00.000Z",
        hearingResult: "Adjourned",
        nextHearing: "2026-06-15T09:00:00.000Z",
        reminderAt: "2026-06-14T09:00:00.000Z",
      },
      nowIso: "2026-05-29T08:00:00.000Z",
      createId: () => "session-id",
    });

    expect(mutation.lifecycle.firstInstance.hearings).toHaveLength(1);
    expect(mutation.lifecycle.sessionManagement).toHaveLength(1);
    expect(mutation.lifecycle.timeline).toHaveLength(1);
    expect(mutation.nextDeadlineAt).toBe("2026-06-15T09:00:00.000Z");
  });

  it("stores judgment details and reflects judgment summary", () => {
    const mutation = applyProceedingLifecycleMutation({
      metadata: {},
      mutation: {
        action: "set_judgment",
        stage: "appeal",
        judgmentDate: "2026-05-20T10:00:00.000Z",
        summary: "Appeal dismissed and first instance upheld.",
        isFinal: false,
        appealAvailable: true,
      },
      nowIso: "2026-05-29T08:00:00.000Z",
      createId: () => "judgment-id",
    });

    expect(mutation.lifecycle.appeal.judgment?.summary).toContain("Appeal dismissed");
    expect(mutation.judgmentSummary).toBe("Appeal dismissed and first instance upheld.");
    expect(mutation.lifecycle.judgmentManagement).toHaveLength(1);
  });

  it("adds execution payments using filing mutation", () => {
    const mutation = applyProceedingLifecycleMutation({
      metadata: {},
      mutation: {
        action: "add_filing",
        filingType: "payment",
        title: "Debtor payment received",
        filedAt: "2026-05-29T10:00:00.000Z",
        amountQar: 5000,
      },
      nowIso: "2026-05-29T08:00:00.000Z",
      createId: () => "payment-id",
    });

    expect(mutation.lifecycle.execution.payments).toHaveLength(1);
    expect(mutation.lifecycle.execution.payments[0].amountQar).toBe(5000);
    expect(mutation.lifecycle.timeline[0].eventType).toBe("execution");
  });
});

describe("matter lifecycle summary", () => {
  it("resolves current stage and next legal action", () => {
    const summary = deriveMatterLifecycleSummary([
      {
        stage: "first_instance",
        status: "closed",
        actionType: "lawsuit",
        nextDeadlineAt: null,
      },
      {
        stage: "appeal",
        status: "open",
        actionType: "appeal",
        nextDeadlineAt: "2026-06-15T09:00:00.000Z",
      },
    ]);

    expect(summary.currentStage).toBe("Appeal");
    expect(summary.progressPercent).toBe(50);
    expect(summary.nextLegalAction).toContain("Prepare filing/hearing");
  });
});

describe("proceeding timeline builder", () => {
  it("combines lifecycle timeline and related row events", () => {
    const lifecycle = createEmptyProceedingLifecycle();
    lifecycle.timeline = [
      {
        id: "lifecycle-event",
        eventType: "appeal",
        stage: "appeal",
        title: "Appeal grounds updated",
        description: "Ground #1",
        eventDate: "2026-05-20T10:00:00.000Z",
      },
    ];

    const timeline = buildProceedingTimeline({
      proceeding: {
        id: "proceeding-1",
        actionType: "appeal",
        stage: "appeal",
        status: "open",
        caseNumber: "2026/300",
        createdAt: "2026-05-01T09:00:00.000Z",
      },
      lifecycle,
      hearings: [
        {
          id: "hearing-1",
          hearing_at: "2026-05-25T09:00:00.000Z",
          outcome: "Adjourned",
        },
      ],
      documents: [
        {
          id: "doc-1",
          title: "Appeal memo",
          document_type: "appeal_memo",
          updated_at: "2026-05-22T09:00:00.000Z",
        },
      ],
    });

    expect(timeline).toHaveLength(4);
    expect(timeline[0].eventDate >= timeline[1].eventDate).toBe(true);
    expect(timeline.some((entry) => entry.eventType === "appeal")).toBe(true);
    expect(timeline.some((entry) => entry.eventType === "hearing")).toBe(true);
    expect(timeline.some((entry) => entry.eventType === "filing")).toBe(true);
  });

  it("persists lifecycle workspace into metadata", () => {
    const lifecycle = createEmptyProceedingLifecycle();
    lifecycle.execution.executionFileNumber = "EX-2026-88";
    const metadata = writeProceedingLifecycle({ intakeMvp: { workflowStatus: "active" } }, lifecycle);
    const parsed = readProceedingLifecycle(metadata);

    expect(parsed.execution.executionFileNumber).toBe("EX-2026-88");
  });
});
