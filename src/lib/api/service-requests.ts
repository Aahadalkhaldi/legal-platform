export function toServiceRequestDTO(row: Record<string, unknown>) {
  return {
    id: row.id,
    caseId: row.case_id,
    clientUserId: row.client_user_id,
    assignedUserId: row.assigned_user_id,
    serviceType: row.service_type,
    status: row.status,
    priority: row.priority,
    title: row.title,
    description: row.description,
    preferredContactMethod: row.preferred_contact_method,
    preferredAt: row.preferred_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
