"use client";

import Link from "next/link";
import { FormEvent, type CSSProperties, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, LoaderCircle, LogIn } from "lucide-react";
import { requestApiWithSession } from "@/lib/api/browser-client";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { normalizePlatformRole } from "@/lib/access-control";

type MeResponse = {
  data: {
    onboardingRequired?: boolean;
    role?: string;
  };
};

export default function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const configurationError = !supabase ? "Supabase public configuration is missing." : null;

  const requestedNextPath = safeNextPath(searchParams.get("next"));

  const resolvePostLoginPath = useCallback(async () => {
    if (requestedNextPath) {
      return requestedNextPath;
    }

    if (!supabase) {
      return "/matters";
    }

    try {
      const mePayload = await requestApiWithSession<MeResponse>(supabase, "/api/v1/me");
      if (mePayload.data.onboardingRequired) {
        return "/matters";
      }

      const normalizedRole = normalizePlatformRole(mePayload.data.role ?? "client_portal");
      return normalizedRole === "client_portal" ? "/portal/client" : "/portal/admin";
    } catch {
      return "/matters";
    }
  }, [requestedNextPath, supabase]);

  useEffect(() => {
    if (!supabase) return;

    void (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) return;
      if (data.session) {
        const destination = await resolvePostLoginPath();
        router.replace(destination);
      }
    })();
  }, [resolvePostLoginPath, router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    if (!supabase) {
      setIsSubmitting(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      if (data.session) {
        await supabase.auth.setSession(data.session);
      }

      const destination = await resolvePostLoginPath();
      router.replace(destination);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel" style={{ maxWidth: 520, margin: "40px auto" }}>
      <p className="eyebrow">Secure Access</p>
      <h1 style={{ margin: "8px 0 14px", fontSize: 32 }}>Sign In</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Sign in with your office account to access legal matters and proceedings.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            style={inputStyle}
          />
        </label>

        {configurationError || errorMessage ? (
          <p role="alert" style={{ color: "#b42318", margin: 0 }}>
            {configurationError ?? errorMessage}
          </p>
        ) : null}

        <button type="submit" className="button button-primary" disabled={isSubmitting || !!configurationError} style={{ width: "fit-content" }}>
          {isSubmitting ? <LoaderCircle size={18} className="animate-spin" /> : <LogIn size={18} />}
          {isSubmitting ? "Signing In..." : "Sign In"}
        </button>
      </form>

      <div className="actions">
        <Link className="button button-secondary" href="/">
          <KeyRound size={18} />
          Back Home
        </Link>
      </div>
    </section>
  );
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

function safeNextPath(raw: string | null) {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  return raw;
}
