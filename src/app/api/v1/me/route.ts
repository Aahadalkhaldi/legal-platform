import { fail, ok, requestId } from "@/lib/api/errors";
import { resolveMeAuthContext } from "@/lib/api/context";

export async function GET(request: Request) {
  const reqId = requestId(request);

  try {
    const result = await resolveMeAuthContext(request);

    if (result.status === "ready") {
      return ok({ data: result.context, requestId: reqId });
    }

    return ok({
      data: {
        onboardingRequired: true,
        code: result.code,
        userId: result.userId,
        email: result.email,
        debugStage: result.debugStage,
        stageMarkers: result.stageMarkers,
      },
      requestId: reqId,
    });
  } catch (error) {
    return fail(error, reqId);
  }
}
