import { getAuthContext, requirePermission } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { updateClientVisibilitySchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function PATCH(request: Request, contextParams: { params: Promise<{ id: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "client_updates:publish");
    const { id } = await contextParams.params;
    const payload = updateClientVisibilitySchema.parse(await request.json());
    const supabase = createSupabaseAdmin();

    const { data: before, error: beforeError } = await supabase
      .from("client_updates")
      .select("*")
      .eq("id", id)
      .eq("account_id", context.accountId)
      .single();

    if (beforeError || !before) throw new ApiError("NOT_FOUND", "Client update was not found.");

    const { data, error } = await supabase
      .from("client_updates")
      .update({
        visible_to_client: payload.visibleToClient,
        published_at: payload.visibleToClient ? new Date().toISOString() : null,
        updated_by: context.userId,
      })
      .eq("id", id)
      .eq("account_id", context.accountId)
      .select("*")
      .single();

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: payload.visibleToClient ? "CLIENT_UPDATE_VISIBLE" : "CLIENT_UPDATE_HIDDEN",
      targetType: "client_update",
      targetId: id,
      requestId: reqId,
      request,
      before,
      after: data,
    });

    return ok({ data, requestId: reqId });
  } catch (error) {
    return fail(error, reqId);
  }
}
