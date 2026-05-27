import type { SupabaseClient } from "@supabase/supabase-js";

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class SessionRequiredError extends Error {
  constructor() {
    super("Session is required.");
    this.name = "SessionRequiredError";
  }
}

export async function getAccessTokenOrThrow(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw new Error(error.message);
  }

  const token = data.session?.access_token;
  if (!token) {
    throw new SessionRequiredError();
  }

  return token;
}

export async function requestApiWithSession<T>(
  supabase: SupabaseClient | null,
  path: string,
  init?: Omit<RequestInit, "headers"> & { headers?: HeadersInit },
): Promise<T> {
  if (!supabase) {
    throw new Error("Supabase public configuration is missing.");
  }

  const token = await getAccessTokenOrThrow(supabase);

  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });

  const payload = await parseJsonBody(response);

  if (!response.ok) {
    throw new Error(extractApiErrorMessage(payload, response.status));
  }

  return payload as T;
}

function extractApiErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object") {
    const errorBody = payload as ApiErrorBody;
    if (errorBody.error?.message) {
      return errorBody.error.message;
    }
  }

  return `Request failed with status ${status}.`;
}

async function parseJsonBody(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
