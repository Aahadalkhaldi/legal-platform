import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.4";

export type AuthContext = {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  accountId: string;
  role: string;
  permissions: string[];
};

export async function getAuthContext(request: Request): Promise<AuthContext> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = request.headers.get("Authorization");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase function environment is not configured.");
  }

  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("UNAUTHORIZED");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const token = authHeader.slice("Bearer ".length);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) {
    throw new Error("UNAUTHORIZED");
  }

  const { data: membership, error } = await supabase
    .from("account_memberships")
    .select("account_id, role, permissions")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (error || !membership) {
    throw new Error("FORBIDDEN");
  }

  return {
    supabase,
    userId: authData.user.id,
    accountId: membership.account_id,
    role: membership.role,
    permissions: Array.isArray(membership.permissions) ? membership.permissions : [],
  };
}

export function hasPermission(context: AuthContext, permission: string) {
  return context.role === "owner" || context.role === "admin" || context.permissions.includes(permission);
}

export async function audit(
  context: AuthContext,
  request: Request,
  requestId: string,
  action: string,
  targetType: string,
  targetId?: string,
  after?: unknown,
) {
  await context.supabase.from("audit_logs").insert({
    account_id: context.accountId,
    actor_user_id: context.userId,
    actor_role: context.role,
    action,
    target_type: targetType,
    target_id: targetId ?? null,
    request_id: requestId,
    user_agent: request.headers.get("user-agent"),
    after_snapshot: after ?? null,
  });
}
