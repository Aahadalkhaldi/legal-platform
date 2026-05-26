import { getAuthContext } from "@/lib/api/context";
import { fail, ok, requestId } from "@/lib/api/errors";
import { parseSearchParams } from "@/lib/api/pagination";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { cursor, limit } = parseSearchParams(request.url);

    let query = createSupabaseAdmin()
      .from("notifications")
      .select("id, title, body, target_type, target_id, read_at, created_at")
      .eq("account_id", context.accountId)
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) query = query.lt("created_at", cursor);

    const { data, error } = await query;
    if (error) throw error;

    const rows = data ?? [];
    const pageRows = rows.slice(0, limit);

    return ok({
      data: pageRows.map((item) => ({
        id: item.id,
        title: item.title,
        body: item.body,
        targetType: item.target_type,
        targetId: item.target_id,
        readAt: item.read_at,
        createdAt: item.created_at,
      })),
      page: {
        limit,
        nextCursor: rows.length > limit ? pageRows.at(-1)?.created_at ?? null : null,
      },
    });
  } catch (error) {
    return fail(error, reqId);
  }
}
