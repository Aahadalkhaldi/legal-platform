import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { audit, getAuthContext } from "../_shared/auth.ts";

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const context = await getAuthContext(request);
    const { documentId } = await request.json();

    const { data: documentRow, error } = await context.supabase
      .from("documents")
      .select("id, visible_to_client, current_version:document_versions(storage_path)")
      .eq("id", documentId)
      .eq("account_id", context.accountId)
      .single();

    if (error || !documentRow) return errorResponse("NOT_FOUND", "Document was not found.", requestId, 404);
    if (context.role === "client" && !documentRow.visible_to_client) {
      return errorResponse("FORBIDDEN", "Document is not shared with the client portal.", requestId, 403);
    }

    const version = Array.isArray(documentRow.current_version)
      ? documentRow.current_version[0]
      : documentRow.current_version;

    if (!version?.storage_path) {
      return errorResponse("CONFLICT", "Document has no current version.", requestId, 409);
    }

    const { data: signed, error: signedError } = await context.supabase.storage
      .from("legal-documents")
      .createSignedUrl(version.storage_path, 120);

    if (signedError) throw signedError;

    await audit(context, request, requestId, "DOCUMENT_SIGNED_URL_CREATED", "document", documentId);
    return jsonResponse({ data: { signedUrl: signed.signedUrl, expiresInSeconds: 120 }, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return errorResponse(status === 500 ? "INTERNAL_ERROR" : message, message, requestId, status);
  }
});
