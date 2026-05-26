import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { audit, getAuthContext, hasPermission } from "../_shared/auth.ts";

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const context = await getAuthContext(request);
    if (!hasPermission(context, "ai:document_ingest")) {
      return errorResponse("FORBIDDEN", "Missing permission: ai:document_ingest.", requestId, 403);
    }

    const { documentVersionId } = await request.json();
    const { data, error } = await context.supabase
      .from("ai_jobs")
      .insert({
        account_id: context.accountId,
        document_version_id: documentVersionId,
        job_type: "document_ingest",
        status: "queued",
        requested_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;
    await audit(context, request, requestId, "AI_DOCUMENT_INGEST_QUEUED", "ai_job", data.id, data);
    return jsonResponse({ data, requestId }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return errorResponse(status === 500 ? "INTERNAL_ERROR" : message, message, requestId, status);
  }
});
