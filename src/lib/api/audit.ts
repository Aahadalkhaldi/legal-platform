import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/types";

type AuditInput = {
  context: CurrentUser;
  action: string;
  targetType: string;
  targetId?: string | null;
  requestId: string;
  request: Request;
  before?: unknown;
  after?: unknown;
};

export async function writeAuditEvent(input: AuditInput) {
  const supabase = createSupabaseAdmin();

  await supabase.from("audit_logs").insert({
    account_id: input.context.accountId,
    actor_user_id: input.context.userId,
    actor_role: input.context.role,
    action: input.action,
    target_type: input.targetType,
    target_id: input.targetId ?? null,
    request_id: input.requestId,
    ip_address: input.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    user_agent: input.request.headers.get("user-agent"),
    before_snapshot: input.before ?? null,
    after_snapshot: input.after ?? null,
  });
}
