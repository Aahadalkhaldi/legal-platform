/* global console, process */
import { createClient } from "@supabase/supabase-js";

const TARGET = {
  email: "law@aletefaq.com",
  userId: "cc0ccce0-19cb-4634-ba91-87d35f3a4813",
  accountName: "Aletefaq Law Firm",
  accountSlug: "aletefaq-law-firm",
  ownerFullName: "Aletefaq Law Firm Owner",
};

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
  };

  const authUser = await loadAuthUser(supabase);
  const authEmail = authUser.email?.toLowerCase() ?? null;
  if (authEmail && authEmail !== TARGET.email.toLowerCase()) {
    throw new Error(
      `Auth user email mismatch for ${TARGET.userId}. Expected ${TARGET.email}, got ${authUser.email}.`,
    );
  }

  const existingUser = await ensureUserRow({ supabase, dryRun });
  summary.userRow = existingUser;

  const account = await ensureAccount({ supabase, dryRun });
  summary.account = account.status;
  summary.accountId = account.id;

  const membership = await ensureOwnerMembership({
    supabase,
    dryRun,
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

async function loadAuthUser(supabase) {
  const { data, error } = await supabase.auth.admin.getUserById(TARGET.userId);
  if (error || !data?.user) {
    throw new Error(`Auth user not found for ${TARGET.userId}. Create the auth user first.`);
  }

  return data.user;
}

async function ensureUserRow({ supabase, dryRun }) {
  const { data: existingUser, error: selectError } = await supabase
    .from("users")
    .select("id, email, full_name")
    .eq("id", TARGET.userId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to read users row: ${selectError.message}`);
  }

  if (!existingUser) {
    if (!dryRun) {
      const { error: insertError } = await supabase.from("users").insert({
        id: TARGET.userId,
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
      const { error: updateError } = await supabase.from("users").update(updates).eq("id", TARGET.userId);
      if (updateError) {
        throw new Error(`Failed to update users row: ${updateError.message}`);
      }
    }

    return "updated";
  }

  return "unchanged";
}

async function ensureAccount({ supabase, dryRun }) {
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
          created_by: TARGET.userId,
          updated_by: TARGET.userId,
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
    updates.updated_by = TARGET.userId;
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

async function ensureOwnerMembership({ supabase, dryRun, accountId, now }) {
  if (accountId === "dry-run-generated-account-id") {
    return "created";
  }

  const { data: existingMembership, error: selectError } = await supabase
    .from("account_memberships")
    .select("id, role, status, deleted_at, accepted_at")
    .eq("account_id", accountId)
    .eq("user_id", TARGET.userId)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to read account membership: ${selectError.message}`);
  }

  if (!existingMembership) {
    if (!dryRun) {
      const { error: insertError } = await supabase.from("account_memberships").insert({
        account_id: accountId,
        user_id: TARGET.userId,
        role: "owner",
        status: "active",
        permissions: [],
        invited_by: TARGET.userId,
        invited_at: now,
        accepted_at: now,
        created_by: TARGET.userId,
        updated_by: TARGET.userId,
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
  if (Object.keys(updates).length > 0) {
    updates.updated_by = TARGET.userId;
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
