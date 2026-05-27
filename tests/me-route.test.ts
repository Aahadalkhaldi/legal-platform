import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/v1/me/route";
import * as authContext from "@/lib/api/context";

vi.mock("@/lib/api/context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/context")>("@/lib/api/context");
  return {
    ...actual,
    resolveMeAuthContext: vi.fn(),
  };
});

const userId = "11111111-1111-4111-8111-111111111111";
const accountId = "22222222-2222-4222-8222-222222222222";

describe("/api/v1/me bootstrap response", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns active membership when the user has a valid membership", async () => {
    vi.mocked(authContext.resolveMeAuthContext).mockResolvedValue({
      status: "ready",
      context: {
        userId,
        email: "client@example.com",
        accountId,
        role: "client",
        permissions: ["cases:read"],
      },
    });

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        userId,
        email: "client@example.com",
        accountId,
        role: "client",
        permissions: ["cases:read"],
      },
      requestId: "req-test",
    });
  });

  it("returns onboarding response when auth user has no membership", async () => {
    vi.mocked(authContext.resolveMeAuthContext).mockResolvedValue({
      status: "onboarding_required",
      code: "MEMBERSHIP_NOT_FOUND",
      userId,
      email: "client@example.com",
    });

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        onboardingRequired: true,
        code: "MEMBERSHIP_NOT_FOUND",
        userId,
        email: "client@example.com",
      },
      requestId: "req-test",
    });
  });

  it("returns onboarding response when membership exists but account is invalid", async () => {
    vi.mocked(authContext.resolveMeAuthContext).mockResolvedValue({
      status: "onboarding_required",
      code: "ACCOUNT_NOT_FOUND",
      userId,
      email: "client@example.com",
    });

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        onboardingRequired: true,
        code: "ACCOUNT_NOT_FOUND",
        userId,
        email: "client@example.com",
      },
      requestId: "req-test",
    });
  });
});

function makeRequest() {
  return new Request("http://localhost/api/v1/me", {
    headers: {
      authorization: "Bearer access-token",
      "x-request-id": "req-test",
    },
  });
}
