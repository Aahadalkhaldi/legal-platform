import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import type { CurrentUser, RoleName } from "@/lib/types";

export async function getAuthContext(request: Request): Promise<CurrentUser> {
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

  const { data: membership, error } = await supabase
    .from("account_memberships")
    .select("account_id, role, permissions")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to load user membership.");
  }

  if (!membership) {
    throw new ApiError("FORBIDDEN", "No active account membership.");
  }

  return {
    userId: authData.user.id,
    email: authData.user.email ?? null,
    accountId: membership.account_id,
    role: membership.role as RoleName,
    permissions: Array.isArray(membership.permissions) ? membership.permissions : [],
  };
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
