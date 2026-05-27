import { getAuthContext, requirePermission } from "@/lib/api/context";
import { assertCaseAccess } from "@/lib/api/case-access";
import { writeAuditEvent } from "@/lib/api/audit";
import { isClientPortalRole } from "@/lib/access-control";
import { fail, ok, requestId } from "@/lib/api/errors";
import { createClientUpdateSchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request, contextParams: { params: Promise<{ caseId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { caseId } = await contextParams.params;
    await assertCaseAccess(context, caseId);

    let query = createSupabaseAdmin()
      .from("client_updates")
      .select("*")
      .eq("account_id", context.accountId)
      .eq("case_id", caseId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (isClientPortalRole(context.role)) {
      query = query.eq("visible_to_client", true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return ok({
      data: (data ?? []).map((item) => ({
        id: item.id,
        caseId: item.case_id,
        title: item.title,
        body: item.body,
        visibleToClient: item.visible_to_client,
        createdAt: item.created_at,
      })),
      page: {
        limit: 50,
        nextCursor: null,
      },
    });
  } catch (error) {
    return fail(error, reqId);
  }
}

export async function POST(request: Request, contextParams: { params: Promise<{ caseId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "client_updates:create");
    const { caseId } = await contextParams.params;
    await assertCaseAccess(context, caseId);
    const payload = createClientUpdateSchema.parse(await request.json());

    const { data, error } = await createSupabaseAdmin()
      .from("client_updates")
      .insert({
        account_id: context.accountId,
        case_id: caseId,
        title: payload.title,
        body: payload.body,
        visible_to_client: payload.visibleToClient,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: payload.visibleToClient ? "CLIENT_UPDATE_PUBLISHED" : "CLIENT_UPDATE_DRAFTED",
      targetType: "client_update",
      targetId: data.id,
      requestId: reqId,
      request,
      after: data,
    });

    return ok({ data, requestId: reqId }, { status: 201 });
  } catch (error) {
    return fail(error, reqId);
  }
}
