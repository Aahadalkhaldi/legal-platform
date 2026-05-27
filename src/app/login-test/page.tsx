"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type ApiCallState = {
  httpStatus: number;
  body: unknown;
} | null;

type DebugState = {
  submitHandlerReached: boolean;
  supabaseUrlExists: boolean;
  supabaseHost: string;
  supabaseUrlLooksValid: boolean;
  anonKeyExists: boolean;
  anonKeyLength: number;
  createClientSucceeded: boolean;
  createClientError: string | null;
  attemptedAuthTokenFetch: boolean;
  attemptedFetchTargets: string[];
  fetchNetworkExceptionMessage: string | null;
  preSignInRuntimeError: string | null;
};

type ClientInitState = {
  client: SupabaseClient | null;
  createClientSucceeded: boolean;
  createClientError: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function parseSupabaseHost(url: string): { host: string; isValid: boolean } {
  try {
    const parsed = new URL(url);
    const looksSupabaseHost = parsed.host.endsWith(".supabase.co");
    return {
      host: parsed.host,
      isValid: parsed.protocol === "https:" && looksSupabaseHost
    };
  } catch {
    return {
      host: "<invalid-url>",
      isValid: false
    };
  }
}

function safeTargetLabel(input: string): string {
  try {
    const parsed = new URL(input);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return input;
  }
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export default function LoginTestPage() {
  const parsedSupabase = useMemo(() => parseSupabaseHost(supabaseUrl), []);
  const clientInit = useMemo<ClientInitState>(() => {
    if (!supabaseUrl || !supabaseAnonKey) {
      return {
        client: null,
        createClientSucceeded: false,
        createClientError:
          "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
      };
    }

    try {
      const client = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
      return {
        client,
        createClientSucceeded: true,
        createClientError: null
      };
    } catch (createClientError) {
      return {
        client: null,
        createClientSucceeded: false,
        createClientError:
          createClientError instanceof Error
            ? createClientError.message
            : "Unknown createClient() error"
      };
    }
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiResult, setApiResult] = useState<ApiCallState>(null);
  const [debug, setDebug] = useState<DebugState>({
    submitHandlerReached: false,
    supabaseUrlExists: Boolean(supabaseUrl),
    supabaseHost: parsedSupabase.host,
    supabaseUrlLooksValid: parsedSupabase.isValid,
    anonKeyExists: Boolean(supabaseAnonKey),
    anonKeyLength: supabaseAnonKey.length,
    createClientSucceeded: clientInit.createClientSucceeded,
    createClientError: clientInit.createClientError,
    attemptedAuthTokenFetch: false,
    attemptedFetchTargets: [],
    fetchNetworkExceptionMessage: null,
    preSignInRuntimeError: null
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setApiResult(null);
    const attemptedTargets: string[] = [];
    let fetchNetworkExceptionMessage: string | null = null;
    let signInAttempted = false;
    const originalFetch = window.fetch.bind(window);
    const wrappedWindowFetch: typeof fetch = async (input, init) => {
      const target =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      const safeTarget = safeTargetLabel(target);
      attemptedTargets.push(safeTarget);
      setDebug((prev) => ({
        ...prev,
        attemptedFetchTargets: [...attemptedTargets]
      }));

      if (safeTarget.includes("/auth/v1/token")) {
        setDebug((prev) => ({
          ...prev,
          attemptedAuthTokenFetch: true
        }));
      }

      try {
        return await originalFetch(input, init);
      } catch (fetchError) {
        fetchNetworkExceptionMessage =
          fetchError instanceof Error
            ? fetchError.message
            : "Unknown fetch exception";
        setDebug((prev) => ({
          ...prev,
          fetchNetworkExceptionMessage
        }));
        throw fetchError;
      }
    };

    window.fetch = wrappedWindowFetch;
    const parsed = parseSupabaseHost(supabaseUrl);

    setDebug((prev) => ({
      ...prev,
      submitHandlerReached: true,
      supabaseUrlExists: Boolean(supabaseUrl),
      supabaseHost: parsed.host,
      supabaseUrlLooksValid: parsed.isValid,
      anonKeyExists: Boolean(supabaseAnonKey),
      anonKeyLength: supabaseAnonKey.length,
      createClientSucceeded: clientInit.createClientSucceeded,
      createClientError: clientInit.createClientError,
      attemptedAuthTokenFetch: false,
      attemptedFetchTargets: [],
      fetchNetworkExceptionMessage: null,
      preSignInRuntimeError: null
    }));

    try {
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error(
          "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY."
        );
      }

      if (!clientInit.client) {
        throw new Error(
          clientInit.createClientError ?? "createClient() failed."
        );
      }

      signInAttempted = true;
      setDebug((prev) => ({
        ...prev,
        attemptedAuthTokenFetch: true
      }));

      const { data, error: signInError } = await clientInit.client.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        setError(`Sign-in failed: ${signInError.message}`);
        setDebug((prev) => ({
          ...prev,
          attemptedFetchTargets: [...attemptedTargets],
          fetchNetworkExceptionMessage
        }));
        return;
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
      setDebug((prev) => ({
        ...prev,
        attemptedFetchTargets: [...attemptedTargets],
        fetchNetworkExceptionMessage
      }));

      if (!response.ok) {
        throw new Error(`API call failed with status ${response.status}.`);
      }
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Unknown error.";
      const preSignInRuntimeError = signInAttempted ? null : message;
      setDebug((prev) => ({
        ...prev,
        attemptedFetchTargets: [...attemptedTargets],
        fetchNetworkExceptionMessage,
        preSignInRuntimeError
      }));
      setError(
        message
      );
    } finally {
      window.fetch = originalFetch;
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

          <div
            style={{
              marginBottom: 20,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              borderRadius: 8,
              padding: 12
            }}
          >
            <strong>Temporary Debug (safe)</strong>
            <ul style={{ margin: "8px 0 0", paddingInlineStart: 18 }}>
              <li>Submit handler reached: {String(debug.submitHandlerReached)}</li>
              <li>NEXT_PUBLIC_SUPABASE_URL exists: {String(debug.supabaseUrlExists)}</li>
              <li>Parsed Supabase host: {debug.supabaseHost}</li>
              <li>URL format looks valid (https + *.supabase.co): {String(debug.supabaseUrlLooksValid)}</li>
              <li>NEXT_PUBLIC_SUPABASE_ANON_KEY exists: {String(debug.anonKeyExists)}</li>
              <li>Anon key length: {debug.anonKeyLength}</li>
              <li>createClient() succeeds: {String(debug.createClientSucceeded)}</li>
              <li>createClient() error: {debug.createClientError ?? "<none>"}</li>
              <li>Auth token fetch attempted (/auth/v1/token): {String(debug.attemptedAuthTokenFetch)}</li>
              <li>Fetch/network exception: {debug.fetchNetworkExceptionMessage ?? "<none>"}</li>
              <li>Pre-signIn runtime error: {debug.preSignInRuntimeError ?? "<none>"}</li>
            </ul>
            {debug.attemptedFetchTargets.length > 0 ? (
              <details style={{ marginTop: 8 }}>
                <summary>Attempted fetch targets (host + path only)</summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    background: "#0f172a",
                    color: "#e2e8f0",
                    borderRadius: 8,
                    padding: 12,
                    overflowX: "auto",
                    marginTop: 8
                  }}
                >
                  {JSON.stringify(debug.attemptedFetchTargets, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>

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
