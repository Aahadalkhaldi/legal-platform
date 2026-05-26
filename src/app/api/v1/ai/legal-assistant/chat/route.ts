import { getAuthContext } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { fail, ok, requestId } from "@/lib/api/errors";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const body = await request.json();
    const caseId = body.caseId ? String(body.caseId) : null;

    const { data, error } = await createSupabaseAdmin()
      .from("ai_outputs")
      .insert({
        account_id: context.accountId,
        case_id: caseId,
        output_type: "assistant_chat",
        prompt: String(body.message ?? ""),
        output: {
          answer: "AI provider is not configured in this foundation. The request was recorded with tenant scope and provenance hooks.",
          citations: [],
        },
        model: "not-configured",
        created_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;
    await writeAuditEvent({ context, action: "AI_LEGAL_ASSISTANT_CHAT", targetType: "ai_output", targetId: data.id, requestId: reqId, request });

    return ok({
      data: {
        answer: data.output.answer,
        citations: data.output.citations,
        outputId: data.id,
      },
      requestId: reqId,
    });
  } catch (error) {
    return fail(error, reqId);
  }
}
