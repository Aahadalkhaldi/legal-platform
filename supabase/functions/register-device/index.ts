import { corsHeaders, errorResponse, jsonResponse } from "../_shared/cors.ts";
import { audit, getAuthContext } from "../_shared/auth.ts";

Deno.serve(async (request) => {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const context = await getAuthContext(request);
    const body = await request.json();

    const { data, error } = await context.supabase
      .from("device_tokens")
      .upsert(
        {
          account_id: context.accountId,
          user_id: context.userId,
          platform: body.platform,
          token: body.token,
          device_id: body.deviceId,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "account_id,user_id,device_id" },
      )
      .select("*")
      .single();

    if (error) throw error;
    await audit(context, request, requestId, "DEVICE_TOKEN_REGISTERED", "device_token", data.id);
    return jsonResponse({ data, requestId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    const status = message === "UNAUTHORIZED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    return errorResponse(status === 500 ? "INTERNAL_ERROR" : message, message, requestId, status);
  }
});
