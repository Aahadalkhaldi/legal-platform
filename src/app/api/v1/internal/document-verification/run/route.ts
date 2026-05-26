import { getAuthContext } from "@/lib/api/context";
import {
  assertManualDocumentVerificationAllowed,
  createSupabaseDocumentVerificationDependencies,
  runDocumentVerificationWorker,
} from "@/lib/api/document-verification-worker";
import { fail, ok, requestId } from "@/lib/api/errors";
import { z } from "zod";

const runVerificationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
});

export async function POST(request: Request) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    assertManualDocumentVerificationAllowed(context);
    const body = await request.json().catch(() => ({}));
    const payload = runVerificationSchema.parse(body);

    const result = await runDocumentVerificationWorker({
      limit: payload.limit,
      dependencies: createSupabaseDocumentVerificationDependencies(request),
    });

    return ok({ data: result, requestId: reqId });
  } catch (error) {
    return fail(error, reqId);
  }
}
