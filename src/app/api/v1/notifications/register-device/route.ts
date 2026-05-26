import { getAuthContext } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { fail, ok, requestId } from "@/lib/api/errors";
import { registerDeviceSchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const payload = registerDeviceSchema.parse(await request.json());

    const { data, error } = await createSupabaseAdmin()
      .from("device_tokens")
      .upsert(
        {
          account_id: context.accountId,
          user_id: context.userId,
          platform: payload.platform,
          token: payload.token,
          device_id: payload.deviceId,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "account_id,user_id,device_id" },
      )
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditEvent({ context, action: "DEVICE_TOKEN_REGISTERED", targetType: "device_token", targetId: data.id, requestId: reqId, request });
    return ok({ data, requestId: reqId });
  } catch (error) {
    return fail(error, reqId);
  }
}
