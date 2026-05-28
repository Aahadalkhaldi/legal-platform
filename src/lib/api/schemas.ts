import { z } from "zod";

export const createCaseSchema = z.object({
  title: z.string().min(3).max(240),
  caseNumber: z.string().max(80).optional(),
  stage: z.enum(["complaint", "case", "execution"]).default("complaint"),
  status: z.enum(["open", "pending", "closed", "archived"]).default("open"),
  clientId: z.string().uuid().optional(),
  courtId: z.string().uuid().optional(),
  description: z.string().max(4000).optional(),
});

export const updateCaseSchema = createCaseSchema.partial();

export const createTimelineEventSchema = z.object({
  eventType: z.enum(["note", "hearing", "task", "document", "status_change", "client_update"]),
  title: z.string().min(2).max(180),
  body: z.string().max(4000).optional(),
  visibleToClient: z.boolean().default(false),
});

export const createClientUpdateSchema = z.object({
  title: z.string().min(2).max(180),
  body: z.string().min(2).max(4000),
  visibleToClient: z.boolean().default(false),
});

export const updateClientVisibilitySchema = z.object({
  visibleToClient: z.boolean(),
});

export const createTaskSchema = z.object({
  caseId: z.string().uuid().optional(),
  title: z.string().min(2).max(180),
  description: z.string().max(2000).optional(),
  assigneeUserId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

export const createAppointmentSchema = z.object({
  caseId: z.string().uuid().optional(),
  title: z.string().min(2).max(180),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().optional(),
  location: z.string().max(240).optional(),
  appointmentType: z.enum(["court_hearing", "prosecution", "client_meeting", "deadline"]).default("client_meeting"),
});

export const createInvoiceSchema = z.object({
  clientId: z.string().uuid(),
  caseId: z.string().uuid().optional(),
  dueAt: z.string().datetime().optional(),
  items: z.array(
    z.object({
      description: z.string().min(2).max(240),
      quantity: z.number().positive().default(1),
      unitAmountQar: z.number().nonnegative(),
    }),
  ).min(1),
});

export const registerDeviceSchema = z.object({
  platform: z.enum(["ios", "android", "web"]),
  token: z.string().min(16).max(512),
  deviceId: z.string().min(3).max(160),
});

export const serviceRequestStatusSchema = z.enum([
  "submitted",
  "in_review",
  "assigned",
  "in_progress",
  "waiting_on_client",
  "resolved",
  "cancelled",
]);

export const createServiceRequestSchema = z.object({
  caseId: z.string().uuid().nullable().optional(),
  serviceType: z.enum(["consultation", "document_review", "new_claim", "follow_up", "other"]),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().min(2).max(4000),
  preferredContactMethod: z.enum(["phone", "email", "app"]).nullable().optional(),
  preferredAt: z.string().datetime().nullable().optional(),
});

export const updateServiceRequestSchema = z.object({
  status: serviceRequestStatusSchema.optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
});

export const clientDocumentUploadSchema = z.object({
  uploadId: z.string().uuid(),
  originalFileName: z.string().trim().min(1).max(180),
  mimeType: z.enum([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
});

export const completeClientDocumentUploadSchema = clientDocumentUploadSchema.extend({
  storagePath: z.string().min(1).max(800),
  sha256Hash: z.string().regex(/^[a-f0-9]{64}$/i),
  title: z.string().trim().min(1).max(180),
  documentType: z.string().trim().min(1).max(80).default("client_upload"),
});

export const matterStatusSchema = z.enum(["open", "on_hold", "closed", "archived"]);
export const proceedingStageSchema = z.enum([
  "first_instance",
  "appeal",
  "cassation",
  "execution",
  "urgent_request",
  "related_case",
]);
export const proceedingStatusSchema = z.enum(["open", "pending", "on_hold", "closed", "archived"]);
export const matterIntakeTypeSchema = z.enum(["lawsuit", "complaint_report", "consultation", "contract_document"]);
export const matterActionTypeSchema = z.enum([
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
]);
export const intakeConflictCheckStatusSchema = z.enum(["clear", "pending"]);
export const intakeAgreementStatusSchema = z.enum(["signed", "pending"]);
export const intakePoaStatusSchema = z.enum(["valid", "pending"]);
export const intakeInitialActionSchema = z.enum(["lawsuit", "complaint"]);
export const intakeSaveModeSchema = z.enum(["draft", "activate"]);
export const intakeComplaintActionTypeSchema = z.enum([
  "police_report",
  "public_prosecution_complaint",
  "cybercrime_report",
  "labor_complaint",
  "administrative_complaint",
  "regulatory_complaint",
]);

export const createLegalMatterSchema = z.object({
  title: z.string().trim().min(2).max(240),
  matterNumber: z.string().trim().max(80).optional(),
  description: z.string().trim().max(5000).optional(),
  status: matterStatusSchema.default("open"),
  intakeType: matterIntakeTypeSchema.default("lawsuit"),
  clientId: z.string().uuid().optional(),
  leadLawyerUserId: z.string().uuid().optional(),
  openedAt: z.string().datetime().optional(),
});

export const createMatterIntakeSchema = z.object({
  saveMode: intakeSaveModeSchema.default("activate"),
  client: z.object({
    fullName: z.string().trim().min(2).max(240),
    displayName: z.string().trim().max(240).optional(),
    email: z.string().trim().email().max(180).optional(),
    phone: z.string().trim().max(40).optional(),
    nationalId: z.string().trim().max(80).optional(),
    address: z.string().trim().max(500).optional(),
  }),
  opposingParty: z.object({
    fullName: z.string().trim().min(2).max(240),
    identityNumber: z.string().trim().max(80).optional(),
    email: z.string().trim().email().max(180).optional(),
    phone: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
  conflictCheckStatus: intakeConflictCheckStatusSchema,
  engagementAgreementStatus: intakeAgreementStatusSchema,
  poaStatus: intakePoaStatusSchema,
  matter: z.object({
    title: z.string().trim().min(2).max(240),
    matterNumber: z.string().trim().max(80).optional(),
    description: z.string().trim().max(5000).optional(),
    status: matterStatusSchema.default("open"),
    openedAt: z.string().datetime().optional(),
  }),
  initialAction: intakeInitialActionSchema,
  lawsuit: z.object({
    caseNumber: z.string().trim().max(80).optional(),
    courtId: z.string().uuid().optional(),
    circuit: z.string().trim().max(120).optional(),
    department: z.string().trim().max(120).optional(),
    claimType: z.string().trim().max(180).optional(),
  }).optional(),
  complaint: z.object({
    actionType: intakeComplaintActionTypeSchema.default("police_report"),
    authority: z.string().trim().max(180).optional(),
    reportNumber: z.string().trim().max(120).optional(),
    submissionDate: z.string().datetime().optional(),
    complainant: z.string().trim().max(240).optional(),
    respondent: z.string().trim().max(240).optional(),
    prosecutorName: z.string().trim().max(180).optional(),
    policeStation: z.string().trim().max(180).optional(),
  }).optional(),
}).superRefine((value, context) => {
  if (value.initialAction === "lawsuit" && !value.lawsuit) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["lawsuit"],
      message: "Lawsuit details are required when initialAction is lawsuit.",
    });
  }

  if (value.initialAction === "complaint" && !value.complaint) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["complaint"],
      message: "Complaint details are required when initialAction is complaint.",
    });
  }
});

export const createMatterProceedingSchema = z.object({
  actionType: matterActionTypeSchema,
  stage: proceedingStageSchema.optional(),
  status: proceedingStatusSchema.default("open"),
  caseNumber: z.string().trim().max(80).optional(),
  linkedCaseId: z.string().uuid().optional(),
  courtId: z.string().uuid().optional(),
  circuit: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  claimType: z.string().trim().max(180).optional(),
  judgmentSummary: z.string().trim().max(5000).optional(),
  authority: z.string().trim().max(180).optional(),
  reportNumber: z.string().trim().max(120).optional(),
  submissionDate: z.string().datetime().optional(),
  complainant: z.string().trim().max(240).optional(),
  respondent: z.string().trim().max(240).optional(),
  investigationSessions: z.array(z.record(z.string(), z.unknown())).optional(),
  prosecutorName: z.string().trim().max(180).optional(),
  policeStation: z.string().trim().max(180).optional(),
  relatedLawsuitProceedingId: z.string().uuid().optional(),
  clientVisible: z.boolean().optional(),
  filingDate: z.string().datetime().optional(),
  nextDeadlineAt: z.string().datetime().optional(),
  feesAmountQar: z.number().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const convertMatterProceedingSchema = z.object({
  caseNumber: z.string().trim().max(80).optional(),
  courtId: z.string().uuid().optional(),
  circuit: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  claimType: z.string().trim().max(180).optional(),
  judgmentSummary: z.string().trim().max(5000).optional(),
  authority: z.string().trim().max(180).optional(),
  reportNumber: z.string().trim().max(120).optional(),
  submissionDate: z.string().datetime().optional(),
  complainant: z.string().trim().max(240).optional(),
  respondent: z.string().trim().max(240).optional(),
  investigationSessions: z.array(z.record(z.string(), z.unknown())).optional(),
  prosecutorName: z.string().trim().max(180).optional(),
  policeStation: z.string().trim().max(180).optional(),
  relatedLawsuitProceedingId: z.string().uuid().optional(),
  clientVisible: z.boolean().optional(),
  filingDate: z.string().datetime().optional(),
  nextDeadlineAt: z.string().datetime().optional(),
  feesAmountQar: z.number().nonnegative().optional(),
  stage: proceedingStageSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateMatterIntakePayload = z.infer<typeof createMatterIntakeSchema>;
