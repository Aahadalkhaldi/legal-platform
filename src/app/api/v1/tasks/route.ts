import { getAuthContext, requirePermission } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { fail, ok, requestId } from "@/lib/api/errors";
import { createTaskSchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { data, error } = await createSupabaseAdmin()
      .from("tasks")
      .select("*")
      .eq("account_id", context.accountId)
      .is("deleted_at", null)
      .order("due_at", { ascending: true })
      .limit(100);

    if (error) throw error;
    return ok({ data, requestId: reqId });
  } catch (error) {
    return fail(error, reqId);
  }
}

export async function POST(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "tasks:create");
    const payload = createTaskSchema.parse(await request.json());

    const { data, error } = await createSupabaseAdmin()
      .from("tasks")
      .insert({
        account_id: context.accountId,
        case_id: payload.caseId ?? null,
        title: payload.title,
        description: payload.description ?? null,
        assignee_user_id: payload.assigneeUserId ?? null,
        due_at: payload.dueAt ?? null,
        priority: payload.priority,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditEvent({ context, action: "TASK_CREATED", targetType: "task", targetId: data.id, requestId: reqId, request, after: data });
    return ok({ data, requestId: reqId }, { status: 201 });
  } catch (error) {
    return fail(error, reqId);
  }
}
