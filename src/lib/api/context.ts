import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { BootstrapErrorCode, CurrentUser, RoleName } from "@/lib/types";

type MembershipRecord = {
  account_id: string;
  role: RoleName | string;
  permissions: unknown;
};

type AccountRecord = {
  id: string;
};

type SingleResult<T> = {
  data: T | null;
  error: unknown;
};

type MembershipQueryBuilder = {
  select: (columns: string) => MembershipQueryBuilder;
  eq: (column: string, value: string) => MembershipQueryBuilder;
  order: (column: string, options: { ascending: boolean }) => MembershipQueryBuilder;
  limit: (value: number) => MembershipQueryBuilder;
  maybeSingle: () => Promise<SingleResult<MembershipRecord>>;
};

type AccountQueryBuilder = {
  select: (columns: string) => AccountQueryBuilder;
  eq: (column: string, value: string) => AccountQueryBuilder;
  is: (column: string, value: null) => AccountQueryBuilder;
  maybeSingle: () => Promise<SingleResult<AccountRecord>>;
};

type BootstrapLookupClient = {
  from: ((table: "account_memberships") => MembershipQueryBuilder) & ((table: "accounts") => AccountQueryBuilder);
};

type AuthenticatedSupabaseClient = BootstrapLookupClient & {
  auth: {
    getUser: (token: string) => Promise<{
      data: {
        user: {
          id: string;
          email?: string | null;
        } | null;
      };
      error: unknown;
    }>;
  };
};

export type MeAuthContextResult =
  | {
      status: "ready";
      context: CurrentUser;
    }
  | {
      status: "onboarding_required";
      code: BootstrapErrorCode;
      userId: string;
      email: string | null;
    };

async function getAuthenticatedState(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authorization = request.headers.get("authorization");

  if (!url || !anonKey) {
    throw new ApiError("INTERNAL_ERROR", "Supabase public configuration is missing.");
  }

  if (!authorization?.startsWith("Bearer ")) {
    throw new ApiError("UNAUTHORIZED", "Missing bearer token.");
  }

  const token = authorization.slice("Bearer ".length);
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  }) as unknown as AuthenticatedSupabaseClient;

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    throw new ApiError("UNAUTHORIZED", "Invalid or expired session.");
  }

  return {
    supabase,
    user: {
      id: authData.user.id,
      email: authData.user.email ?? null,
    },
  };
}

export async function resolveMeAuthContext(request: Request): Promise<MeAuthContextResult> {
  const { supabase, user } = await getAuthenticatedState(request);
  const adminSupabase = getAdminSupabaseOrNull();

  const membershipResult = await loadActiveMembership(supabase, user.id);
  let membership = membershipResult.data;
  let membershipError = membershipResult.error;

  if (membershipError && adminSupabase) {
    const adminMembershipResult = await loadActiveMembership(adminSupabase, user.id);
    membership = adminMembershipResult.data;
    membershipError = adminMembershipResult.error;
  }

  if (membershipError) {
    if (isAccessDeniedError(membershipError)) {
      membership = null;
      membershipError = null;
    } else {
      throw new ApiError("INTERNAL_ERROR", "Unable to load account membership.");
    }
  }

  if (!membership) {
    return {
      status: "onboarding_required",
      code: "MEMBERSHIP_NOT_FOUND",
      userId: user.id,
      email: user.email,
    };
  }

  const accountLookupClient = adminSupabase ?? supabase;
  const accountResult = await loadActiveAccount(accountLookupClient, membership.account_id);
  let account = accountResult.data;
  let accountError = accountResult.error;

  if (accountError) {
    if (isAccessDeniedError(accountError)) {
      account = null;
      accountError = null;
    } else {
      throw new ApiError("INTERNAL_ERROR", "Unable to load account.");
    }
  }

  if (!account) {
    return {
      status: "onboarding_required",
      code: "ACCOUNT_NOT_FOUND",
      userId: user.id,
      email: user.email,
    };
  }

  return {
    status: "ready",
    context: {
      userId: user.id,
      email: user.email,
      accountId: membership.account_id,
      role: membership.role as RoleName,
      permissions: Array.isArray(membership.permissions) ? membership.permissions : [],
    },
  };
}

function getAdminSupabaseOrNull() {
  try {
    return createSupabaseAdmin() as unknown as BootstrapLookupClient;
  } catch {
    return null;
  }
}

async function loadActiveMembership(supabase: BootstrapLookupClient, userId: string) {
  return supabase
    .from("account_memberships")
    .select("account_id, role, permissions")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
}

async function loadActiveAccount(supabase: BootstrapLookupClient, accountId: string) {
  return supabase
    .from("accounts")
    .select("id")
    .eq("id", accountId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
}

function isAccessDeniedError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const typed = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof typed.code === "string" ? typed.code : "";
  const message = typeof typed.message === "string" ? typed.message.toLowerCase() : "";
  const details = typeof typed.details === "string" ? typed.details.toLowerCase() : "";

  if (code === "42501" || code === "PGRST301") {
    return true;
  }

  return (
    message.includes("permission denied")
    || message.includes("row-level security")
    || details.includes("permission denied")
    || details.includes("row-level security")
  );
}

export async function getAuthContext(request: Request): Promise<CurrentUser> {
  const result = await resolveMeAuthContext(request);

  if (result.status === "ready") {
    return result.context;
  }

  if (result.code === "ACCOUNT_NOT_FOUND") {
    throw new ApiError("ACCOUNT_NOT_FOUND", "The account for this membership is missing or inactive.");
  }

  throw new ApiError("MEMBERSHIP_NOT_FOUND", "No active account membership found for this user.");
}

export function requirePermission(context: CurrentUser, permission: string) {
  if (context.role === "owner" || context.role === "admin" || context.permissions.includes(permission)) {
    return;
  }

  throw new ApiError("FORBIDDEN", `Missing permission: ${permission}.`);
}

export function requireRole(context: CurrentUser, roles: RoleName[]) {
  if (roles.includes(context.role)) {
    return;
  }

  throw new ApiError("FORBIDDEN", "This role cannot perform the requested action.");
}
