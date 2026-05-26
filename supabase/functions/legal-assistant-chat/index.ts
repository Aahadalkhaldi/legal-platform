import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { audit, getAuthContext } from "../_shared/auth.ts";

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const context = await getAuthContext(request);
    const { caseId, message } = await request.json();

    const { data, error } = await context.supabase
      .from("ai_outputs")
      .insert({
        account_id: context.accountId,
        case_id: caseId ?? null,
        output_type: "assistant_chat",
        prompt: message,
        output: {
          answer: "AI provider is not configured. This function persists the request with tenant scope and is ready for RAG integration.",
          citations: [],
        },
        model: "not-configured",
        created_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;
    await audit(context, request, requestId, "AI_LEGAL_ASSISTANT_CHAT", "ai_output", data.id);
    return jsonResponse({ data: { answer: data.output.answer, citations: data.output.citations, outputId: data.id }, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return errorResponse(status === 500 ? "INTERNAL_ERROR" : message, message, requestId, status);
  }
});
