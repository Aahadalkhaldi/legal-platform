import Link from "next/link";
import { BriefcaseBusiness, CirclePlus, Scale } from "lucide-react";

const scaffoldRows = [
  {
    id: "scaffold-first-instance",
    matterNumber: "MAT-2026-001",
    title: "Commercial Contract Dispute",
    status: "open",
    proceedings: 2,
    clientName: "Acme Holdings",
  },
  {
    id: "scaffold-execution",
    matterNumber: "MAT-2026-002",
    title: "Labor Claim Enforcement",
    status: "on_hold",
    proceedings: 1,
    clientName: "N/A",
  },
];

export default function MattersScaffoldPage() {
  return (
    <main className="app-shell">
      <div className="page-container">
        <section className="panel" style={{ marginBottom: 16 }}>
          <p className="eyebrow">Legal Matter Lifecycle</p>
          <h1 style={{ margin: "8px 0 12px", fontSize: 34 }}>Matters List</h1>
          <p className="muted" style={{ marginBottom: 18 }}>
            This scaffold is ready to plug into `GET /api/v1/matters` and `POST /api/v1/matters`.
          </p>
          <div className="actions">
            <button className="button button-primary" type="button">
              <CirclePlus size={18} />
              Create Legal Matter
            </button>
            <Link className="button button-secondary" href="/docs/API_CONTRACTS.md">
              <Scale size={18} />
              API Contracts
            </Link>
          </div>
        </section>

        <section className="panel">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}>
                  <th style={{ padding: "10px 8px" }}>Matter</th>
                  <th style={{ padding: "10px 8px" }}>Client</th>
                  <th style={{ padding: "10px 8px" }}>Status</th>
                  <th style={{ padding: "10px 8px" }}>Proceedings</th>
                  <th style={{ padding: "10px 8px" }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {scaffoldRows.map((row) => (
                  <tr key={row.id} style={{ borderBottom: "1px solid var(--line)" }}>
                    <td style={{ padding: "12px 8px" }}>
                      <strong>{row.matterNumber}</strong>
                      <p className="muted" style={{ marginTop: 4 }}>{row.title}</p>
                    </td>
                    <td style={{ padding: "12px 8px" }}>{row.clientName}</td>
                    <td style={{ padding: "12px 8px" }}>{row.status}</td>
                    <td style={{ padding: "12px 8px" }}>{row.proceedings}</td>
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
        </section>
      </div>
    </main>
  );
}
