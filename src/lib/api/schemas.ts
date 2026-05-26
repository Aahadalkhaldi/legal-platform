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
