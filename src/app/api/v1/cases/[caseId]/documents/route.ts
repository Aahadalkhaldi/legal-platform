import { getAuthContext, requirePermission } from "@/lib/api/context";
import { assertCaseAccess } from "@/lib/api/case-access";
import { writeAuditEvent } from "@/lib/api/audit";
import { isClientPortalRole } from "@/lib/access-control";
import { fail, ok, requestId } from "@/lib/api/errors";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request, contextParams: { params: Promise<{ caseId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { caseId } = await contextParams.params;
    await assertCaseAccess(context, caseId);

    let query = createSupabaseAdmin()
      .from("documents")
      .select("*, current_version:document_versions(*)")
      .eq("account_id", context.accountId)
      .eq("case_id", caseId)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (isClientPortalRole(context.role)) {
      query = query.eq("visible_to_client", true);
    }

    const { data, error } = await query;
    if (error) throw error;
    return ok({ data, requestId: reqId });
  } catch (error) {
    return fail(error, reqId);
  }
}

export async function POST(request: Request, contextParams: { params: Promise<{ caseId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "documents:create");
    const { caseId } = await contextParams.params;
    await assertCaseAccess(context, caseId);
    const body = await request.json();
    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("documents")
      .insert({
        account_id: context.accountId,
        case_id: caseId,
        title: String(body.title ?? "Untitled document"),
        document_type: String(body.documentType ?? "general"),
        classification: String(body.classification ?? "confidential"),
        visible_to_client: Boolean(body.visibleToClient ?? false),
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: "DOCUMENT_CREATED",
      targetType: "document",
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
