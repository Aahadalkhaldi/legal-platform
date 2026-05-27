/* global console, process */
import { createClient } from "@supabase/supabase-js";

const TARGET = {
  email: "law@aletefaq.com",
  accountName: "Aletefaq Law Firm",
  accountSlug: "aletefaq-law-firm",
  ownerFullName: "Aletefaq Law Firm Owner",
};

const OWNER_ADMIN_PERMISSION_DEFINITIONS = [
  { name: "cases:create", description: "Create legal cases and complaints." },
  { name: "cases:update", description: "Update legal cases." },
  { name: "timeline:create", description: "Create case timeline events." },
  { name: "client_updates:create", description: "Draft updates for client portal." },
  { name: "client_updates:publish", description: "Show or hide updates in client portal." },
  { name: "documents:create", description: "Create document records." },
  { name: "documents:version:create", description: "Upload immutable document versions." },
  { name: "tasks:create", description: "Create legal workflow tasks." },
  { name: "appointments:create", description: "Create hearings, meetings, and deadlines." },
  { name: "billing:create", description: "Create invoices and billing records." },
  { name: "ai:document_ingest", description: "Queue legal document intelligence jobs." },
  { name: "service_requests:update", description: "Review, assign, and update client service requests." },
];

const OWNER_ADMIN_PERMISSION_NAMES = OWNER_ADMIN_PERMISSION_DEFINITIONS.map((permission) => permission.name);

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const supabase = createServiceRoleClient();
  const now = new Date().toISOString();
  const summary = {
    dryRun,
    userRow: "unchanged",
    account: "unchanged",
    membership: "unchanged",
    accountId: null,
    authUserId: null,
    permissionsBootstrap: "unchanged",
  };

  const authUser = await loadAuthUserByEmail(supabase, TARGET.email);
  const authUserId = authUser.id;
  summary.authUserId = authUserId;

  const permissionsBootstrap = await ensureOwnerAdminPermissionBootstrap({ supabase, dryRun });
  summary.permissionsBootstrap = permissionsBootstrap;

  const existingUser = await ensureUserRow({ supabase, dryRun, authUserId });
  summary.userRow = existingUser;

  const account = await ensureAccount({ supabase, dryRun, authUserId });
  summary.account = account.status;
  summary.accountId = account.id;

  const membership = await ensureOwnerMembership({
    supabase,
    dryRun,
    authUserId,
    accountId: account.id,
    now,
  });
  summary.membership = membership;

  console.log("[bootstrap-first-office-admin] completed.");
  console.log(JSON.stringify(summary, null, 2));
}

function createServiceRoleClient() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function loadAuthUserByEmail(supabase, email) {
  const normalizedEmail = email.toLowerCase();
  const perPage = 200;
  let page = 1;

  while (page <= 100) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list auth users while searching for ${email}: ${error.message}`);
    }

    const users = data?.users ?? [];
    const matchedUser = users.find((user) => (user.email ?? "").toLowerCase() === normalizedEmail);
    if (matchedUser) {
      return matchedUser;
    }

    if (users.length < perPage) {
      break;
    }

    page += 1;
  }

  throw new Error(`Auth user not found for email ${email}. Create the auth user first.`);
}

async function ensureUserRow({ supabase, dryRun, authUserId }) {
  const { data: existingUser, error: selectError } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("id", authUserId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to read users row: ${selectError.message}`);
  }

  if (!existingUser) {
    if (!dryRun) {
      const { error: insertError } = await supabase.from("users").insert({
        id: authUserId,
        email: TARGET.email,
        full_name: TARGET.ownerFullName,
      });

      if (insertError) {
        throw new Error(`Failed to create users row: ${insertError.message}`);
      }
    }

    return "created";
  }

  const updates = {};
  if (!existingUser.email) {
    updates.email = TARGET.email;
  }
  if (!existingUser.full_name || !existingUser.full_name.trim()) {
    updates.full_name = TARGET.ownerFullName;
  }

  if (Object.keys(updates).length > 0) {
    if (!dryRun) {
      const { error: updateError } = await supabase.from("users").update(updates).eq("id", authUserId);
      if (updateError) {
        throw new Error(`Failed to update users row: ${updateError.message}`);
      }
    }

    return "updated";
  }

  return "unchanged";
}

async function ensureAccount({ supabase, dryRun, authUserId }) {
  const { data: existingAccount, error: selectError } = await supabase
    .from("accounts")
    .select("id, slug, name, status, deleted_at")
    .eq("slug", TARGET.accountSlug)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to read accounts row: ${selectError.message}`);
  }

  if (!existingAccount) {
    if (!dryRun) {
      const { data: createdAccount, error: insertError } = await supabase
        .from("accounts")
        .insert({
          name: TARGET.accountName,
          slug: TARGET.accountSlug,
          status: "active",
          created_by: authUserId,
          updated_by: authUserId,
          deleted_at: null,
        })
        .select("id")
        .single();

      if (insertError || !createdAccount) {
        throw new Error(`Failed to create account: ${insertError?.message ?? "unknown error"}`);
      }

      return { id: createdAccount.id, status: "created" };
    }

    return { id: "dry-run-generated-account-id", status: "created" };
  }

  const updates = {};
  if (existingAccount.name !== TARGET.accountName) {
    updates.name = TARGET.accountName;
  }
  if (existingAccount.status !== "active") {
    updates.status = "active";
  }
  if (existingAccount.deleted_at !== null) {
    updates.deleted_at = null;
  }
  if (Object.keys(updates).length > 0) {
    updates.updated_by = authUserId;
  }

  if (Object.keys(updates).length > 0 && !dryRun) {
    const { error: updateError } = await supabase.from("accounts").update(updates).eq("id", existingAccount.id);
    if (updateError) {
      throw new Error(`Failed to update account: ${updateError.message}`);
    }
  }

  return {
    id: existingAccount.id,
    status: Object.keys(updates).length > 0 ? "updated" : "unchanged",
  };
}

async function ensureOwnerMembership({ supabase, dryRun, authUserId, accountId, now }) {
  if (accountId === "dry-run-generated-account-id") {
    return "created";
  }

  const { data: existingMembership, error: selectError } = await supabase
    .from("account_memberships")
    .select("id, role, status, deleted_at, accepted_at, permissions")
    .eq("account_id", accountId)
    .eq("user_id", authUserId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to read account membership: ${selectError.message}`);
  }

  if (!existingMembership) {
    if (!dryRun) {
      const { error: insertError } = await supabase.from("account_memberships").insert({
        account_id: accountId,
        user_id: authUserId,
        role: "owner",
        status: "active",
        permissions: OWNER_ADMIN_PERMISSION_NAMES,
        invited_by: authUserId,
        invited_at: now,
        accepted_at: now,
        created_by: authUserId,
        updated_by: authUserId,
        deleted_at: null,
      });

      if (insertError) {
        throw new Error(`Failed to create account membership: ${insertError.message}`);
      }
    }

    return "created";
  }

  const updates = {};
  if (existingMembership.role !== "owner") {
    updates.role = "owner";
  }
  if (existingMembership.status !== "active") {
    updates.status = "active";
  }
  if (existingMembership.deleted_at !== null) {
    updates.deleted_at = null;
  }
  if (!existingMembership.accepted_at) {
    updates.accepted_at = now;
  }
  if (!samePermissionSet(existingMembership.permissions, OWNER_ADMIN_PERMISSION_NAMES)) {
    updates.permissions = OWNER_ADMIN_PERMISSION_NAMES;
  }
  if (Object.keys(updates).length > 0) {
    updates.updated_by = authUserId;
  }

  if (Object.keys(updates).length > 0 && !dryRun) {
    const { error: updateError } = await supabase
      .from("account_memberships")
      .update(updates)
      .eq("id", existingMembership.id);
    if (updateError) {
      throw new Error(`Failed to update account membership: ${updateError.message}`);
    }
  }

  return Object.keys(updates).length > 0 ? "updated" : "unchanged";
}

async function ensureOwnerAdminPermissionBootstrap({ supabase, dryRun }) {
  const roleRows = [
    { name: "owner", description: "Account owner with protected sole-admin controls." },
    { name: "admin", description: "Administrative manager for the legal office." },
  ];
  const permissionRows = OWNER_ADMIN_PERMISSION_DEFINITIONS;
  const rolePermissionRows = [];

  for (const role of ["owner", "admin"]) {
    for (const permission of OWNER_ADMIN_PERMISSION_NAMES) {
      rolePermissionRows.push({
        role,
        permission,
      });
    }
  }

  if (dryRun) {
    return "would_update";
  }

  const { error: roleError } = await supabase.from("roles").upsert(roleRows, {
    onConflict: "name",
  });
  if (roleError) {
    throw new Error(`Failed to seed roles for owner/admin bootstrap: ${roleError.message}`);
  }

  const { error: permissionError } = await supabase.from("permissions").upsert(permissionRows, {
    onConflict: "name",
  });
  if (permissionError) {
    throw new Error(`Failed to seed permissions for owner/admin bootstrap: ${permissionError.message}`);
  }

  const { error: rolePermissionError } = await supabase.from("role_permissions").upsert(rolePermissionRows, {
    onConflict: "role,permission",
  });
  if (rolePermissionError) {
    throw new Error(`Failed to seed role_permissions for owner/admin bootstrap: ${rolePermissionError.message}`);
  }

  return "updated";
}

function samePermissionSet(currentPermissions, targetPermissions) {
  if (!Array.isArray(currentPermissions)) {
    return false;
  }

  const current = [...new Set(currentPermissions.map((value) => String(value)))].sort();
  const target = [...new Set(targetPermissions.map((value) => String(value)))].sort();

  if (current.length !== target.length) {
    return false;
  }

  return current.every((value, index) => value === target[index]);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  console.error(`[bootstrap-first-office-admin] failed: ${message}`);
  process.exit(1);
});
