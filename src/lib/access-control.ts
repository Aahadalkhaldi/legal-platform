export const ENTERPRISE_PLATFORM_ROLE_VALUES = [
  "super_admin",
  "office_owner",
  "admin",
  "lawyer",
  "trainee",
  "finance",
  "secretary",
  "client_portal",
  "external_collaborator",
  "system",
  "owner",
  "staff",
  "client",
] as const;

export const MATTER_ACCESS_ROLE_VALUES = [
  "lead_counsel",
  "assigned_lawyer",
  "reviewer",
  "finance_access",
  "read_only",
  "restricted",
  "client_access",
] as const;

export const MATTER_ACTION_PERMISSION_VALUES = [
  "create_proceeding",
  "create_appeal",
  "create_cassation",
  "open_execution",
  "upload_document",
  "approve_document",
  "assign_users",
  "close_matter",
  "manage_billing",
  "export_case",
  "manage_clients",
  "run_conflict_check",
  "manage_hearings",
  "manage_notifications",
  "manage_users",
  "ai_privileged_actions",
] as const;

export type PlatformRole = (typeof ENTERPRISE_PLATFORM_ROLE_VALUES)[number];
export type MatterAccessRole = (typeof MATTER_ACCESS_ROLE_VALUES)[number];
export type MatterActionPermission = (typeof MATTER_ACTION_PERMISSION_VALUES)[number];

export type MatterAccessAssignmentInput = {
  accessRole: MatterAccessRole;
  allowedActions?: string[] | null;
  canViewConfidentialDocuments?: boolean | null;
  billingScopeOnly?: boolean | null;
};

const ROLE_ALIAS_MAP: Record<string, PlatformRole> = {
  owner: "office_owner",
  office_owner: "office_owner",
  admin: "admin",
  lawyer: "lawyer",
  trainee: "trainee",
  finance: "finance",
  secretary: "secretary",
  staff: "secretary",
  client: "client_portal",
  client_portal: "client_portal",
  external_collaborator: "external_collaborator",
  super_admin: "super_admin",
  system: "system",
};

const LEGACY_PERMISSION_ALIAS_MAP: Record<string, MatterActionPermission[]> = {
  "cases:create": ["create_proceeding"],
  "cases:update": ["create_appeal", "create_cassation", "open_execution", "close_matter", "assign_users"],
  "documents:create": ["upload_document"],
  "documents:version:create": ["upload_document", "approve_document"],
  "timeline:create": ["manage_notifications"],
  "client_updates:create": ["manage_notifications"],
  "client_updates:publish": ["manage_notifications"],
  "appointments:create": ["manage_hearings"],
  "billing:create": ["manage_billing"],
  "service_requests:update": ["manage_clients"],
  "ai:document_ingest": ["ai_privileged_actions"],
};

const PLATFORM_DEFAULT_ACTIONS: Record<PlatformRole, MatterActionPermission[]> = {
  super_admin: [...MATTER_ACTION_PERMISSION_VALUES],
  office_owner: [...MATTER_ACTION_PERMISSION_VALUES],
  admin: [...MATTER_ACTION_PERMISSION_VALUES],
  lawyer: [
    "create_proceeding",
    "create_appeal",
    "create_cassation",
    "open_execution",
    "upload_document",
    "approve_document",
    "assign_users",
    "close_matter",
    "export_case",
    "manage_clients",
    "run_conflict_check",
    "manage_hearings",
    "manage_notifications",
    "ai_privileged_actions",
  ],
  trainee: [
    "create_proceeding",
    "upload_document",
    "export_case",
    "run_conflict_check",
    "manage_hearings",
    "manage_notifications",
  ],
  finance: [
    "manage_billing",
    "export_case",
  ],
  secretary: [
    "create_proceeding",
    "upload_document",
    "manage_hearings",
    "manage_notifications",
    "export_case",
  ],
  client_portal: [
    "upload_document",
  ],
  external_collaborator: [
    "export_case",
  ],
  system: [...MATTER_ACTION_PERMISSION_VALUES],
  owner: [...MATTER_ACTION_PERMISSION_VALUES],
  staff: [
    "create_proceeding",
    "upload_document",
    "manage_hearings",
    "manage_notifications",
    "export_case",
  ],
  client: ["upload_document"],
};

const MATTER_ROLE_DEFAULT_ACTIONS: Record<MatterAccessRole, MatterActionPermission[]> = {
  lead_counsel: [
    "create_proceeding",
    "create_appeal",
    "create_cassation",
    "open_execution",
    "upload_document",
    "approve_document",
    "assign_users",
    "close_matter",
    "manage_billing",
    "export_case",
    "manage_clients",
    "run_conflict_check",
    "manage_hearings",
    "manage_notifications",
    "ai_privileged_actions",
  ],
  assigned_lawyer: [
    "create_proceeding",
    "create_appeal",
    "create_cassation",
    "open_execution",
    "upload_document",
    "approve_document",
    "export_case",
    "run_conflict_check",
    "manage_hearings",
    "manage_notifications",
  ],
  reviewer: ["approve_document", "export_case", "run_conflict_check"],
  finance_access: ["manage_billing", "export_case"],
  read_only: ["export_case"],
  restricted: [],
  client_access: ["upload_document"],
};

export function normalizePlatformRole(role: string): PlatformRole {
  return (ROLE_ALIAS_MAP[role] ?? role) as PlatformRole;
}

export function isClientPortalRole(role: string) {
  return normalizePlatformRole(role) === "client_portal";
}

export function isElevatedPlatformRole(role: string) {
  const normalized = normalizePlatformRole(role);
  return normalized === "super_admin"
    || normalized === "office_owner"
    || normalized === "admin"
    || normalized === "system";
}

export function isMatterScopedRole(role: string) {
  const normalized = normalizePlatformRole(role);
  return normalized === "lawyer"
    || normalized === "trainee"
    || normalized === "finance"
    || normalized === "secretary"
    || normalized === "external_collaborator"
    || normalized === "client_portal";
}

export function expandLegacyActionAliases(permission: string): MatterActionPermission[] {
  return LEGACY_PERMISSION_ALIAS_MAP[permission] ?? [];
}

export function permissionImplies(grantedPermission: string, requiredPermission: string) {
  if (grantedPermission === requiredPermission) {
    return true;
  }

  const grantedAliases = expandLegacyActionAliases(grantedPermission);
  if (grantedAliases.includes(requiredPermission as MatterActionPermission)) {
    return true;
  }

  const requiredAliases = expandLegacyActionAliases(requiredPermission);
  return requiredAliases.includes(grantedPermission as MatterActionPermission);
}

export function resolveEffectiveMatterActions(input: {
  role: string;
  directPermissions?: string[] | null;
  inheritedPermissions?: string[] | null;
  matterAccess?: MatterAccessAssignmentInput | null;
}) {
  const normalizedRole = normalizePlatformRole(input.role);
  const effective = new Set<string>();

  for (const action of PLATFORM_DEFAULT_ACTIONS[normalizedRole] ?? []) {
    effective.add(action);
  }

  for (const permission of input.directPermissions ?? []) {
    effective.add(permission);
    for (const alias of expandLegacyActionAliases(permission)) {
      effective.add(alias);
    }
  }

  for (const permission of input.inheritedPermissions ?? []) {
    effective.add(permission);
    for (const alias of expandLegacyActionAliases(permission)) {
      effective.add(alias);
    }
  }

  if (input.matterAccess) {
    for (const action of MATTER_ROLE_DEFAULT_ACTIONS[input.matterAccess.accessRole] ?? []) {
      effective.add(action);
    }

    for (const action of input.matterAccess.allowedActions ?? []) {
      effective.add(action);
      for (const alias of expandLegacyActionAliases(action)) {
        effective.add(alias);
      }
    }
  }

  return effective;
}

export function hasMatterAction(input: {
  role: string;
  action: MatterActionPermission;
  directPermissions?: string[] | null;
  inheritedPermissions?: string[] | null;
  matterAccess?: MatterAccessAssignmentInput | null;
}) {
  if (isElevatedPlatformRole(input.role)) {
    return true;
  }

  const effective = resolveEffectiveMatterActions(input);
  return effective.has(input.action);
}

export function canViewMatter(input: {
  role: string;
  matterAccess?: MatterAccessAssignmentInput | null;
}) {
  if (isElevatedPlatformRole(input.role)) {
    return true;
  }

  if (!input.matterAccess) {
    return false;
  }

  if (input.matterAccess.accessRole === "restricted") {
    return false;
  }

  if (isClientPortalRole(input.role)) {
    return input.matterAccess.accessRole === "client_access";
  }

  return true;
}

export function canViewConfidentialDocuments(input: {
  role: string;
  matterAccess?: MatterAccessAssignmentInput | null;
}) {
  const normalized = normalizePlatformRole(input.role);
  if (isElevatedPlatformRole(normalized)) {
    return true;
  }

  if (normalized === "trainee" || normalized === "external_collaborator" || normalized === "client_portal") {
    return Boolean(input.matterAccess?.canViewConfidentialDocuments);
  }

  return true;
}
