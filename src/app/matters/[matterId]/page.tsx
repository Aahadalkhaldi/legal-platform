import Link from "next/link";
import { CircleChevronRight, FilePlus2, Gavel, Link2, Scale } from "lucide-react";

type MatterDetailPageProps = {
  params: Promise<{ matterId: string }>;
};

const timelineRows = [
  {
    id: "p1",
    stage: "first_instance",
    caseNumber: "2026/1042",
    court: "Primary Court - Dafna",
    status: "closed",
    hearings: 4,
    documents: 7,
    tasks: 5,
    updates: 2,
    parties: 3,
    fees: "QAR 12,500",
    nextDeadline: "2026-07-10T08:00:00.000Z",
  },
  {
    id: "p2",
    stage: "appeal",
    caseNumber: "2026/221",
    court: "Court of Appeal",
    status: "open",
    hearings: 1,
    documents: 2,
    tasks: 2,
    updates: 1,
    parties: 3,
    fees: "QAR 4,000",
    nextDeadline: "2026-08-01T08:00:00.000Z",
  },
];

export default async function MatterDetailScaffoldPage({ params }: MatterDetailPageProps) {
  const { matterId } = await params;

  return (
    <main className="app-shell">
      <div className="page-container">
        <section className="panel" style={{ marginBottom: 16 }}>
          <p className="eyebrow">Legal Matter Detail</p>
          <h1 style={{ margin: "8px 0 8px", fontSize: 32 }}>Matter {matterId}</h1>
          <p className="muted" style={{ marginBottom: 14 }}>
            Proceeding timeline scaffold ready for `GET /api/v1/matters/{matterId}`.
          </p>
          <div className="actions">
            <button type="button" className="button button-primary">
              <Gavel size={18} />
              Create Appeal
            </button>
            <button type="button" className="button button-secondary">
              <Scale size={18} />
              Create Cassation
            </button>
            <button type="button" className="button button-secondary">
              <FilePlus2 size={18} />
              Open Execution File
            </button>
            <button type="button" className="button button-secondary">
              <Link2 size={18} />
              Link Related Case
            </button>
            <Link className="button button-secondary" href="/matters">
              <CircleChevronRight size={18} />
              Back to Matters
            </Link>
          </div>
        </section>

        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Proceedings Timeline</h2>
          <div style={{ display: "grid", gap: 14 }}>
            {timelineRows.map((row) => (
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
                      {row.caseNumber} - {row.court}
                    </p>
                  </div>
                  <span className="status-chip">{row.status}</span>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 8,
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  }}
                >
                  <span>Hearings: {row.hearings}</span>
                  <span>Documents: {row.documents}</span>
                  <span>Tasks: {row.tasks}</span>
                  <span>Updates: {row.updates}</span>
                  <span>Parties: {row.parties}</span>
                  <span>Fees: {row.fees}</span>
                  <span>Deadline: {new Date(row.nextDeadline).toLocaleDateString()}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
