import { getAuthContext, requirePermission } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { fail, ok, requestId } from "@/lib/api/errors";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "ai:document_ingest");
    const body = await request.json();

    const { data, error } = await createSupabaseAdmin()
      .from("ai_jobs")
      .insert({
        account_id: context.accountId,
        document_version_id: String(body.documentVersionId),
        job_type: "document_ingest",
        status: "queued",
        requested_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditEvent({ context, action: "AI_DOCUMENT_INGEST_QUEUED", targetType: "ai_job", targetId: data.id, requestId: reqId, request, after: data });
    return ok({ data, requestId: reqId }, { status: 202 });
  } catch (error) {
    return fail(error, reqId);
  }
}
