import { z } from "zod";
import { getAuthContext, requirePermission } from "@/lib/api/context";
import { writeAuditEvent } from "@/lib/api/audit";
import { ApiError, fail, ok, requestId } from "@/lib/api/errors";
import { assertMatterAccess, assertMatterActionAccess } from "@/lib/api/matters-access";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const createDraftSchema = z.object({
  actionType: z.enum([
    "lawsuit",
    "appeal",
    "cassation",
    "execution",
    "urgent_request",
    "police_report",
    "public_prosecution_complaint",
    "cybercrime_report",
    "labor_complaint",
    "administrative_complaint",
    "regulatory_complaint",
  ]).optional(),
  title: z.string().trim().max(180).optional(),
  notes: z.string().trim().max(1200).optional(),
});

type ActionDraft = {
  id: string;
  actionType: string;
  status: "draft";
  title: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  source: "matter_detail";
};

export async function GET(request: Request, contextParams: { params: Promise<{ matterId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    const { matterId } = await contextParams.params;
    const supabase = createSupabaseAdmin();

    await assertMatterAccess(supabase, context, matterId);
    const matter = await loadMatter(supabase, context.accountId, matterId);
    const drafts = readActionDrafts(matter.metadata);

    return ok({
      data: drafts,
      requestId: reqId,
    });
  } catch (error) {
    return fail(error, reqId);
  }
}

export async function POST(request: Request, contextParams: { params: Promise<{ matterId: string }> }) {
  const reqId = requestId(request);

  try {
    const context = await getAuthContext(request);
    requirePermission(context, "cases:create");
    const { matterId } = await contextParams.params;
    const payload = createDraftSchema.parse(await request.json());
    const supabase = createSupabaseAdmin();

    await assertMatterActionAccess(supabase, context, matterId, "create_proceeding");
    const matter = await loadMatter(supabase, context.accountId, matterId);
    const drafts = readActionDrafts(matter.metadata);
    const inferredActionType = payload.actionType ?? inferActionType(matter.intake_type);
    const now = new Date().toISOString();
    const draft: ActionDraft = {
      id: crypto.randomUUID(),
      actionType: inferredActionType,
      status: "draft",
      title: payload.title ?? defaultDraftTitle(inferredActionType, drafts.length + 1),
      notes: payload.notes ?? null,
      createdAt: now,
      updatedAt: now,
      source: "matter_detail",
    };
    const updatedMetadata = mergeActionDraftsIntoMetadata(matter.metadata, [...drafts, draft]);

    const { error: updateError } = await supabase
      .from("legal_matters")
      .update({
        metadata: updatedMetadata,
        updated_by: context.userId,
      })
      .eq("id", matterId)
      .eq("account_id", context.accountId);

    if (updateError) {
      throw updateError;
    }

    await writeAuditEvent({
      context,
      action: "MATTER_ACTION_DRAFT_CREATED",
      targetType: "legal_matter",
      targetId: matterId,
      requestId: reqId,
      request,
      after: draft,
    });

    return ok({
      data: {
        draft,
      },
      requestId: reqId,
    }, { status: 201 });
  } catch (error) {
    return fail(error, reqId);
  }
}

async function loadMatter(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  accountId: string,
  matterId: string,
) {
  const { data, error } = await supabase
    .from("legal_matters")
    .select("id, account_id, intake_type, metadata")
    .eq("id", matterId)
    .eq("account_id", accountId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new ApiError("NOT_FOUND", "Legal matter was not found.");
  }

  return data;
}

function readActionDrafts(metadata: unknown): ActionDraft[] {
  if (!metadata || typeof metadata !== "object") {
    return [];
  }

  const intakeMvp = (metadata as { intakeMvp?: unknown }).intakeMvp;
  if (!intakeMvp || typeof intakeMvp !== "object") {
    return [];
  }

  const drafts = (intakeMvp as { actionDrafts?: unknown }).actionDrafts;
  if (!Array.isArray(drafts)) {
    return [];
  }

  const parsed: ActionDraft[] = [];
  for (const entry of drafts) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const typed = entry as Record<string, unknown>;
    if (typeof typed.id !== "string" || typeof typed.actionType !== "string") {
      continue;
    }

    parsed.push({
      id: typed.id,
      actionType: typed.actionType,
      status: "draft",
      title: typeof typed.title === "string" ? typed.title : "Action Draft",
      notes: typeof typed.notes === "string" ? typed.notes : null,
      createdAt: typeof typed.createdAt === "string" ? typed.createdAt : new Date(0).toISOString(),
      updatedAt: typeof typed.updatedAt === "string" ? typed.updatedAt : new Date(0).toISOString(),
      source: "matter_detail",
    });
  }

  return parsed.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mergeActionDraftsIntoMetadata(metadata: unknown, drafts: ActionDraft[]) {
  const current = metadata && typeof metadata === "object"
    ? metadata as Record<string, unknown>
    : {};
  const intakeMvp = current.intakeMvp && typeof current.intakeMvp === "object"
    ? current.intakeMvp as Record<string, unknown>
    : {};

  return {
    ...current,
    intakeMvp: {
      ...intakeMvp,
      actionDrafts: drafts,
    },
  };
}

function inferActionType(intakeType: string | null) {
  return intakeType === "complaint_report" ? "police_report" : "lawsuit";
}

function defaultDraftTitle(actionType: string, sequence: number) {
  return `Action Draft ${sequence} (${actionType})`;
}
