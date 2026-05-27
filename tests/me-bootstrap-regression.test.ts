import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { GET } from "@/app/api/v1/me/route";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}));

const userId = "11111111-1111-4111-8111-111111111111";

describe("/api/v1/me production bootstrap regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  });

  it("returns onboarding payload when public membership lookup fails but no membership exists", async () => {
    const publicClient = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: userId, email: "new-user@example.com" } },
          error: null,
        })),
      },
      from: vi.fn((table: string) => {
        if (table !== "account_memberships") {
          throw new Error(`Unexpected public table: ${table}`);
        }

        return queryBuilder({
          data: null,
          error: {
            code: "42501",
            message: "permission denied for table account_memberships",
            details: "new row violates row-level security policy",
          },
        });
      }),
    };

    const adminClient = {
      from: vi.fn((table: string) => {
        if (table === "account_memberships") {
          return queryBuilder({ data: null, error: null });
        }

        if (table === "accounts") {
          return queryBuilder({ data: null, error: null });
        }

        throw new Error(`Unexpected admin table: ${table}`);
      }),
    };

    vi.mocked(createClient).mockReturnValue(publicClient as never);
    vi.mocked(createSupabaseAdmin).mockReturnValue(adminClient as never);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        onboardingRequired: true,
        code: "MEMBERSHIP_NOT_FOUND",
        userId,
        email: "new-user@example.com",
      },
      requestId: "req-regression",
    });
    expect(body.error).toBeUndefined();
  });
});

function makeRequest() {
  return new Request("http://localhost/api/v1/me", {
    headers: {
      authorization: "Bearer access-token",
      "x-request-id": "req-regression",
    },
  });
}

function queryBuilder(result: { data: unknown; error: unknown }) {
  const builder: {
    select: (_value: string) => typeof builder;
    eq: (_column: string, _value: string) => typeof builder;
    order: (_column: string, _options: { ascending: boolean }) => typeof builder;
    limit: (_value: number) => typeof builder;
    is: (_column: string, _value: null) => typeof builder;
    maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  } = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    is: () => builder,
    maybeSingle: async () => result,
  };

  return builder;
}
