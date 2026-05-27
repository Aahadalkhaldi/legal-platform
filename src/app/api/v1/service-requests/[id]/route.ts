import { getAuthContext, requirePermission } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { isClientPortalRole } from "@/lib/access-control";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { updateServiceRequestSchema } from "@/lib/api/schemas";
import { toServiceRequestDTO } from "@/lib/api/service-requests";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request, contextParams: { params: Promise<{ id: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { id } = await contextParams.params;
    const supabase = createSupabaseAdmin();

    let query = supabase
      .from("service_requests")
      .select("*")
      .eq("id", id)
      .eq("account_id", context.accountId);

    if (isClientPortalRole(context.role)) {
      query = query.eq("client_user_id", context.userId);
    }

    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError("NOT_FOUND", "Service request was not found.");

    await writeAuditEvent({
      context,
      action: "SERVICE_REQUEST_VIEWED",
      targetType: "service_request",
      targetId: id,
      requestId: reqId,
      request,
    });

    return ok({ data: toServiceRequestDTO(data), requestId: reqId });
  } catch (error) {
    return fail(error, reqId);
  }
}

export async function PATCH(request: Request, contextParams: { params: Promise<{ id: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "service_requests:update");
    const { id } = await contextParams.params;
    const payload = updateServiceRequestSchema.parse(await request.json());
    const supabase = createSupabaseAdmin();

    if (payload.assignedUserId) {
      const { data: assignee, error: assigneeError } = await supabase
        .from("account_memberships")
        .select("id")
        .eq("account_id", context.accountId)
        .eq("user_id", payload.assignedUserId)
        .eq("status", "active")
        .is("deleted_at", null)
        .maybeSingle();

      if (assigneeError) throw assigneeError;
      if (!assignee) {
        throw new ApiError("FORBIDDEN", "Assignee must be an active member of the account.");
      }
    }

    const { data: before, error: beforeError } = await supabase
      .from("service_requests")
      .select("*")
      .eq("id", id)
      .eq("account_id", context.accountId)
      .maybeSingle();

    if (beforeError) throw beforeError;
    if (!before) throw new ApiError("NOT_FOUND", "Service request was not found.");

    const { data, error } = await supabase
      .from("service_requests")
      .update({
        status: payload.status,
        priority: payload.priority,
        assigned_user_id: payload.assignedUserId,
        resolved_at: payload.resolvedAt,
        updated_by: context.userId,
      })
      .eq("id", id)
      .eq("account_id", context.accountId)
      .select("*")
      .single();

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: before.assigned_user_id !== data.assigned_user_id ? "SERVICE_REQUEST_ASSIGNED" : "SERVICE_REQUEST_UPDATED",
      targetType: "service_request",
      targetId: id,
      requestId: reqId,
      request,
      before,
      after: data,
    });

    return ok({ data: toServiceRequestDTO(data), requestId: reqId });
  } catch (error) {
    return fail(error, reqId);
  }
}
