import { assertCaseAccess } from "@/lib/api/case-access";
import { getAuthContext } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { parseSearchParams } from "@/lib/api/pagination";
import { createServiceRequestSchema, serviceRequestStatusSchema } from "@/lib/api/schemas";
import { toServiceRequestDTO } from "@/lib/api/service-requests";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { cursor, limit } = parseSearchParams(request.url);
    const status = new URL(request.url).searchParams.get("status");
    const supabase = createSupabaseAdmin();

    if (status) {
      serviceRequestStatusSchema.parse(status);
    }

    let query = supabase
      .from("service_requests")
      .select("*")
      .eq("account_id", context.accountId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (context.role === "client") {
      query = query.eq("client_user_id", context.userId);
    }

    if (status) query = query.eq("status", status);
    if (cursor) query = query.lt("created_at", cursor);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const pageRows = rows.slice(0, limit);

    return ok({
      data: pageRows.map(toServiceRequestDTO),
      page: {
        limit,
        nextCursor: rows.length > limit ? pageRows.at(-1)?.created_at ?? null : null,
      },
    });
  } catch (error) {
    return fail(error, reqId);
  }
}

export async function POST(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    if (context.role !== "client") {
      throw new ApiError("FORBIDDEN", "Only client portal users can submit service requests.");
    }

    const payload = createServiceRequestSchema.parse(await request.json());
    if (payload.caseId) {
      await assertCaseAccess(context, payload.caseId);
    }

    const { data, error } = await createSupabaseAdmin()
      .from("service_requests")
      .insert({
        account_id: context.accountId,
        client_user_id: context.userId,
        case_id: payload.caseId ?? null,
        service_type: payload.serviceType,
        title: payload.title,
        description: payload.description,
        preferred_contact_method: payload.preferredContactMethod ?? null,
        preferred_at: payload.preferredAt ?? null,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;

    await writeAuditEvent({
      context,
      action: "SERVICE_REQUEST_CREATED",
      targetType: "service_request",
      targetId: data.id,
      requestId: reqId,
      request,
      after: data,
    });

    return ok({ data: toServiceRequestDTO(data), requestId: reqId }, { status: 201 });
  } catch (error) {
    return fail(error, reqId);
  }
}
