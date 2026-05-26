export type RoleName = "owner" | "admin" | "lawyer" | "staff" | "client" | "system";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "INTERNAL_ERROR";

export type ApiErrorEnvelope = {
  error: {
    code: ApiErrorCode;
    message: string;
    requestId: string;
    details?: unknown;
  };
};

export type CursorPage<T> = {
  data: T[];
  page: {
    nextCursor: string | null;
    limit: number;
  };
};

export type CurrentUser = {
  userId: string;
  email: string | null;
  accountId: string;
  role: RoleName;
  permissions: string[];
};

export type CaseSummary = {
  id: string;
  caseNumber: string | null;
  title: string;
  status: string;
  stage: string;
  courtName: string | null;
  nextHearingAt: string | null;
  updatedAt: string;
};

export type ClientUpdate = {
  id: string;
  caseId: string;
  title: string;
  body: string;
  visibleToClient: boolean;
  createdAt: string;
};

export type ServiceRequestType = "consultation" | "document_review" | "new_claim" | "follow_up" | "other";

export type ServiceRequestStatus =
  | "submitted"
  | "in_review"
  | "assigned"
  | "in_progress"
  | "waiting_on_client"
  | "resolved"
  | "cancelled";

export type ServiceRequestPriority = "low" | "normal" | "high" | "urgent";

export type ServiceRequest = {
  id: string;
  caseId: string | null;
  clientUserId: string;
  assignedUserId: string | null;
  serviceType: ServiceRequestType;
  status: ServiceRequestStatus;
  priority: ServiceRequestPriority;
  title: string;
  description: string;
  preferredContactMethod: "phone" | "email" | "app" | null;
  preferredAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
