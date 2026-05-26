import { getAuthContext, requirePermission } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { fail, ok, requestId } from "@/lib/api/errors";
import { createAppointmentSchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { data, error } = await createSupabaseAdmin()
      .from("appointments")
      .select("*")
      .eq("account_id", context.accountId)
      .gte("starts_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("starts_at", { ascending: true })
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
    requirePermission(context, "appointments:create");
    const payload = createAppointmentSchema.parse(await request.json());

    const { data, error } = await createSupabaseAdmin()
      .from("appointments")
      .insert({
        account_id: context.accountId,
        case_id: payload.caseId ?? null,
        title: payload.title,
        starts_at: payload.startsAt,
        ends_at: payload.endsAt ?? null,
        location: payload.location ?? null,
        appointment_type: payload.appointmentType,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditEvent({ context, action: "APPOINTMENT_CREATED", targetType: "appointment", targetId: data.id, requestId: reqId, request, after: data });
    return ok({ data, requestId: reqId }, { status: 201 });
  } catch (error) {
    return fail(error, reqId);
  }
}
