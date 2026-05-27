import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { expandLegacyActionAliases, isElevatedPlatformRole, normalizePlatformRole, permissionImplies } from "@/lib/access-control";
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

type MeStageMarkers = {
  authUserLoaded: boolean;
  membershipLookupStarted: boolean;
  membershipLookupRlsFailed: boolean;
  membershipLookupServiceRoleFallbackStarted: boolean;
  membershipLookupServiceRoleFallbackSucceeded: boolean;
  onboardingFallbackReturned: boolean;
};

type MeDebugStage =
  | keyof MeStageMarkers
  | "membershipLookupPrimaryFailed"
  | "membershipLookupServiceRoleFallbackFailed"
  | "accountLookupFailed";

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
      debugStage: MeDebugStage;
      stageMarkers: MeStageMarkers;
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
  const stageMarkers = createStageMarkers();
  const { supabase, user } = await getAuthenticatedState(request);
  stageMarkers.authUserLoaded = true;
  const adminSupabase = getAdminSupabaseOrNull();
  let debugStage: MeDebugStage | null = null;

  stageMarkers.membershipLookupStarted = true;
  const membershipResult = await safeLoadActiveMembership(supabase, user.id);
  let membership = membershipResult.data;

  if (membershipResult.error) {
    if (isAccessDeniedError(membershipResult.error)) {
      stageMarkers.membershipLookupRlsFailed = true;
      debugStage = "membershipLookupRlsFailed";
    } else {
      debugStage = "membershipLookupPrimaryFailed";
    }

    if (adminSupabase) {
      stageMarkers.membershipLookupServiceRoleFallbackStarted = true;
      const adminMembershipResult = await safeLoadActiveMembership(adminSupabase, user.id);
      if (!adminMembershipResult.error) {
        stageMarkers.membershipLookupServiceRoleFallbackSucceeded = true;
        membership = adminMembershipResult.data;
      } else {
        debugStage = "membershipLookupServiceRoleFallbackFailed";
      }
    }
  }

  if (!membership) {
    return onboardingResult("MEMBERSHIP_NOT_FOUND", user, stageMarkers, debugStage);
  }

  const accountLookupClient = adminSupabase ?? supabase;
  const accountResult = await safeLoadActiveAccount(accountLookupClient, membership.account_id);
  if (accountResult.error) {
    return onboardingResult("ACCOUNT_NOT_FOUND", user, stageMarkers, debugStage ?? "accountLookupFailed");
  }

  if (!accountResult.data) {
    return onboardingResult("ACCOUNT_NOT_FOUND", user, stageMarkers, debugStage);
  }

  const inheritedPermissions = await safeLoadRolePermissions(accountLookupClient, String(membership.role));

  return {
    status: "ready",
    context: {
      userId: user.id,
      email: user.email,
      accountId: membership.account_id,
      role: membership.role as RoleName,
      permissions: mergeEffectivePermissions({
        directPermissions: Array.isArray(membership.permissions) ? membership.permissions : [],
        inheritedPermissions,
      }),
      inheritedPermissions,
      normalizedRole: normalizePlatformRole(String(membership.role)),
    },
  };
}

function createStageMarkers(): MeStageMarkers {
  return {
    authUserLoaded: false,
    membershipLookupStarted: false,
    membershipLookupRlsFailed: false,
    membershipLookupServiceRoleFallbackStarted: false,
    membershipLookupServiceRoleFallbackSucceeded: false,
    onboardingFallbackReturned: false,
  };
}

function onboardingResult(
  code: BootstrapErrorCode,
  user: { id: string; email: string | null },
  stageMarkers: MeStageMarkers,
  debugStage: MeDebugStage | null,
): MeAuthContextResult {
  stageMarkers.onboardingFallbackReturned = true;

  return {
    status: "onboarding_required",
    code,
    userId: user.id,
    email: user.email,
    debugStage: debugStage ?? "onboardingFallbackReturned",
    stageMarkers,
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

async function safeLoadActiveMembership(
  supabase: BootstrapLookupClient,
  userId: string,
): Promise<SingleResult<MembershipRecord>> {
  try {
    return await loadActiveMembership(supabase, userId);
  } catch (error) {
    return {
      data: null,
      error,
    };
  }
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

async function safeLoadActiveAccount(
  supabase: BootstrapLookupClient,
  accountId: string,
): Promise<SingleResult<AccountRecord>> {
  try {
    return await loadActiveAccount(supabase, accountId);
  } catch (error) {
    return {
      data: null,
      error,
    };
  }
}

async function safeLoadRolePermissions(supabase: BootstrapLookupClient, role: string): Promise<string[]> {
  try {
    const rolePermissionClient = supabase as unknown as {
      from: (table: "role_permissions") => {
        select: (columns: string) => {
          eq: (column: string, value: string) => Promise<{
            data: Array<{ permission?: string | null }> | null;
            error: unknown;
          }>;
        };
      };
    };

    const { data, error } = await rolePermissionClient
      .from("role_permissions")
      .select("permission")
      .eq("role", role);

    if (error || !Array.isArray(data)) {
      return [];
    }

    return data
      .map((row) => (typeof row.permission === "string" ? row.permission : null))
      .filter((value): value is string => value !== null);
  } catch {
    return [];
  }
}

function mergeEffectivePermissions(input: { directPermissions: unknown[]; inheritedPermissions: string[] }) {
  const effective = new Set<string>();
  for (const permission of input.directPermissions) {
    if (typeof permission !== "string") continue;
    effective.add(permission);
    for (const alias of expandLegacyActionAliases(permission)) {
      effective.add(alias);
    }
  }

  for (const permission of input.inheritedPermissions) {
    if (typeof permission !== "string") continue;
    effective.add(permission);
    for (const alias of expandLegacyActionAliases(permission)) {
      effective.add(alias);
    }
  }

  return Array.from(effective);
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
    throw new ApiError("ACCOUNT_NOT_FOUND", "The account for this membership is missing or inactive.", {
      debugStage: result.debugStage,
      stageMarkers: result.stageMarkers,
    });
  }

  throw new ApiError("MEMBERSHIP_NOT_FOUND", "No active account membership found for this user.", {
    debugStage: result.debugStage,
    stageMarkers: result.stageMarkers,
  });
}

export function requirePermission(context: CurrentUser, permission: string) {
  if (isElevatedPlatformRole(context.role)) {
    return;
  }

  const granted = [...context.permissions, ...(context.inheritedPermissions ?? [])];
  if (granted.some((grantedPermission) => permissionImplies(grantedPermission, permission))) {
    return;
  }

  throw new ApiError("FORBIDDEN", `Missing permission: ${permission}.`);
}

export function requireRole(context: CurrentUser, roles: RoleName[]) {
  const normalizedCurrentRole = normalizePlatformRole(context.role);
  const isAllowed = roles.some((role) => role === context.role || normalizePlatformRole(role) === normalizedCurrentRole);
  if (isAllowed) {
    return;
  }

  throw new ApiError("FORBIDDEN", "This role cannot perform the requested action.");
}
