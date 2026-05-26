import { getAuthContext, requirePermission } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { fail, ok, requestId } from "@/lib/api/errors";
import { createInvoiceSchema } from "@/lib/api/schemas";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { data, error } = await createSupabaseAdmin()
      .from("invoices")
      .select("*, invoice_items(*)")
      .eq("account_id", context.accountId)
      .order("issued_at", { ascending: false })
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
    requirePermission(context, "billing:create");
    const payload = createInvoiceSchema.parse(await request.json());
    const supabase = createSupabaseAdmin();
    const totalQar = payload.items.reduce((sum, item) => sum + item.quantity * item.unitAmountQar, 0);

    const { data: invoice, error } = await supabase
      .from("invoices")
      .insert({
        account_id: context.accountId,
        client_id: payload.clientId,
        case_id: payload.caseId ?? null,
        currency: "QAR",
        total_amount: totalQar,
        balance_due: totalQar,
        due_at: payload.dueAt ?? null,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("*")
      .single();

    if (error) throw error;

    const { error: itemError } = await supabase.from("invoice_items").insert(
      payload.items.map((item) => ({
        account_id: context.accountId,
        invoice_id: invoice.id,
        description: item.description,
        quantity: item.quantity,
        unit_amount: item.unitAmountQar,
        line_total: item.quantity * item.unitAmountQar,
      })),
    );

    if (itemError) throw itemError;
    await writeAuditEvent({ context, action: "INVOICE_CREATED", targetType: "invoice", targetId: invoice.id, requestId: reqId, request, after: invoice });
    return ok({ data: invoice, requestId: reqId }, { status: 201 });
  } catch (error) {
    return fail(error, reqId);
  }
}
