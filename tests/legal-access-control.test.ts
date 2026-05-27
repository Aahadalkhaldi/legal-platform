import { describe, expect, it } from "vitest";
import {
  canViewConfidentialDocuments,
  canViewMatter,
  hasMatterAction,
  normalizePlatformRole,
  permissionImplies,
  resolveEffectiveMatterActions,
  type MatterAccessAssignmentInput,
} from "@/lib/access-control";

const leadCounselAccess: MatterAccessAssignmentInput = {
  accessRole: "lead_counsel",
  allowedActions: [],
  canViewConfidentialDocuments: true,
};

describe("enterprise role normalization", () => {
  it("maps legacy roles to enterprise role names", () => {
    expect(normalizePlatformRole("owner")).toBe("office_owner");
    expect(normalizePlatformRole("staff")).toBe("secretary");
    expect(normalizePlatformRole("client")).toBe("client_portal");
  });
});

describe("permission inheritance and matching", () => {
  it("matches legacy and enterprise permission aliases", () => {
    expect(permissionImplies("cases:create", "create_proceeding")).toBe(true);
    expect(permissionImplies("create_proceeding", "cases:create")).toBe(true);
    expect(permissionImplies("manage_billing", "open_execution")).toBe(false);
  });

  it("merges role defaults, inherited, and matter-level permissions", () => {
    const effective = resolveEffectiveMatterActions({
      role: "lawyer",
      directPermissions: ["manage_users"],
      inheritedPermissions: ["cases:create"],
      matterAccess: { accessRole: "assigned_lawyer", allowedActions: ["manage_billing"] },
    });

    expect(effective.has("create_proceeding")).toBe(true);
    expect(effective.has("manage_users")).toBe(true);
    expect(effective.has("manage_billing")).toBe(true);
  });
});

describe("matter-level access rules", () => {
  it("requires explicit client_access for client portal users", () => {
    expect(canViewMatter({ role: "client_portal", matterAccess: null })).toBe(false);
    expect(canViewMatter({ role: "client_portal", matterAccess: { accessRole: "client_access" } })).toBe(true);
  });

  it("allows elevated roles without matter assignment", () => {
    expect(canViewMatter({ role: "office_owner", matterAccess: null })).toBe(true);
    expect(canViewMatter({ role: "super_admin", matterAccess: null })).toBe(true);
  });

  it("blocks restricted matter access role", () => {
    expect(canViewMatter({ role: "lawyer", matterAccess: { accessRole: "restricted" } })).toBe(false);
  });
});

describe("action authorization", () => {
  it("allows finance billing action and blocks non-billing defaults", () => {
    expect(hasMatterAction({
      role: "finance",
      action: "manage_billing",
      directPermissions: [],
      inheritedPermissions: [],
      matterAccess: { accessRole: "finance_access" },
    })).toBe(true);

    expect(hasMatterAction({
      role: "finance",
      action: "open_execution",
      directPermissions: [],
      inheritedPermissions: [],
      matterAccess: { accessRole: "finance_access" },
    })).toBe(false);
  });

  it("allows lead counsel to close matter", () => {
    expect(hasMatterAction({
      role: "lawyer",
      action: "close_matter",
      directPermissions: [],
      inheritedPermissions: [],
      matterAccess: leadCounselAccess,
    })).toBe(true);
  });
});

describe("confidential document visibility", () => {
  it("blocks trainee unless matter access allows confidential visibility", () => {
    expect(canViewConfidentialDocuments({
      role: "trainee",
      matterAccess: { accessRole: "assigned_lawyer", canViewConfidentialDocuments: false },
    })).toBe(false);

    expect(canViewConfidentialDocuments({
      role: "trainee",
      matterAccess: { accessRole: "assigned_lawyer", canViewConfidentialDocuments: true },
    })).toBe(true);
  });
});
