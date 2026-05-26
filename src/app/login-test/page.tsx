"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@supabase/supabase-js";

type ApiCallState = {
  httpStatus: number;
  body: unknown;
} | null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export default function LoginTestPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<ApiCallState>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setApiResult(null);

    try {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
          "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
      }

      const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        throw new Error(`Sign-in failed: ${signInError.message}`);
      }

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("No access_token returned from Supabase Auth.");
      }

      const response = await fetch("/api/v1/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      const responseText = await response.text();
      const parsedBody = parseMaybeJson(responseText);

      setApiResult({
        httpStatus: response.status,
        body: parsedBody
      });

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}.`);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Unknown error."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="page-container">
        <section className="panel" style={{ maxWidth: 760, margin: "32px auto" }}>
          <p className="eyebrow">Debug Utility</p>
          <h1 className="hero-title" style={{ marginBottom: 12 }}>
            Supabase Login Test
          </h1>
          <p className="muted" style={{ marginBottom: 20 }}>
            This page uses <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> only.
          </p>

          <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                style={{ padding: 10, borderRadius: 8, border: "1px solid #cfd4dc" }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                style={{ padding: 10, borderRadius: 8, border: "1px solid #cfd4dc" }}
              />
            </label>

            <button
              type="submit"
              className="button button-primary"
              disabled={loading}
              style={{ width: "fit-content" }}
            >
              {loading ? "Signing in..." : "Sign in and call /api/v1/me"}
            </button>
          </form>

          {error ? (
            <div
              style={{
                marginTop: 16,
                border: "1px solid #ef4444",
                background: "#fef2f2",
                color: "#991b1b",
                borderRadius: 8,
                padding: 12
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          ) : null}

          {apiResult ? (
            <div style={{ marginTop: 16 }}>
              <p style={{ margin: "0 0 8px" }}>
                <strong>HTTP Status:</strong> {apiResult.httpStatus}
              </p>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  background: "#0f172a",
                  color: "#e2e8f0",
                  borderRadius: 8,
                  padding: 12,
                  overflowX: "auto"
                }}
              >
                {JSON.stringify(apiResult.body, null, 2)}
              </pre>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
