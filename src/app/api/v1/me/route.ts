import { fail, ok, requestId } from "@/lib/api/errors";
import { getAuthContext } from "@/lib/api/context";

export async function GET(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    return ok({ data: context, requestId: reqId });
  } catch (error) {
    return fail(error, reqId);
  }
}
