import { Suspense } from "react";
import LoginClient from "./login-client";

export default function LoginPage() {
  return (
    <main className="app-shell">
      <div className="page-container">
        <Suspense fallback={<LoginFallback />}>
          <LoginClient />
        </Suspense>
      </div>
    </main>
  );
}

function LoginFallback() {
  return (
    <section className="panel" style={{ maxWidth: 520, margin: "40px auto" }}>
      <p className="muted" style={{ margin: 0 }}>Loading sign-in form...</p>
    </section>
  );
}
