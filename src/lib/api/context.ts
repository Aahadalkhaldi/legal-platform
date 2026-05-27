import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import type { BootstrapErrorCode, CurrentUser, RoleName } from "@/lib/types";

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
  });

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

  const { data: membership, error } = await supabase
    .from("account_memberships")
    .select("account_id, role, permissions")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Unable to load account membership.");
  }

  if (!membership) {
    return {
      status: "onboarding_required",
      code: "MEMBERSHIP_NOT_FOUND",
      userId: user.id,
      email: user.email,
    };
  }

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("id")
    .eq("id", membership.account_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (accountError) {
    throw new ApiError("INTERNAL_ERROR", "Unable to load account.");
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
