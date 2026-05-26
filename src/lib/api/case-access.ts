import { ApiError } from "@/lib/api/errors";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { CurrentUser } from "@/lib/types";

export async function assertCaseAccess(context: CurrentUser, caseId: string) {
  const supabase = createSupabaseAdmin();

  const { data, error } = await supabase
    .from("cases")
    .select("id")
    .eq("id", caseId)
    .eq("account_id", context.accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new ApiError("INTERNAL_ERROR", "Failed to verify case access.");
  }

  if (!data) {
    throw new ApiError("NOT_FOUND", "Case was not found.");
  }

  if (context.role !== "client") {
    return;
  }

  const { data: participant, error: participantError } = await supabase
    .from("case_participants")
    .select("id")
    .eq("case_id", caseId)
    .eq("account_id", context.accountId)
    .eq("user_id", context.userId)
    .eq("participant_type", "client")
    .maybeSingle();

  if (participantError) {
    throw new ApiError("INTERNAL_ERROR", "Failed to verify client case access.");
  }

  if (!participant) {
    throw new ApiError("FORBIDDEN", "Clients can only access their own cases.");
  }
}
