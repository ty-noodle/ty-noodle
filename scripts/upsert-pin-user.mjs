import { createHmac, randomBytes, scryptSync } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filename) {
  const filePath = resolve(process.cwd(), filename);

  if (!existsSync(filePath)) {
    return;
  }

  const contents = readFileSync(filePath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!process.env[key]) {
      process.env[key] = rawValue;
    }
  }
}

loadEnvFile(".env");
loadEnvFile(".env.local");

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function createPinLookup(pin, pepper) {
  return createHmac("sha256", pepper).update(pin).digest("hex");
}

function hashPin(pin, pepper) {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(`${pin}:${pepper}`, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const pinPepper = requireEnv("LOGIN_PIN_PEPPER");
  const organizationSlug = requireEnv("SEED_ORGANIZATION_SLUG");
  const organizationName = requireEnv("SEED_ORGANIZATION_NAME");
  const displayName = requireEnv("SEED_USER_DISPLAY_NAME");
  const role = requireEnv("SEED_USER_ROLE");
  const pin = requireEnv("SEED_USER_PIN");
  const email = process.env.SEED_USER_EMAIL?.trim() || null;

  if (!/^\d{6}$/.test(pin)) {
    throw new Error("SEED_USER_PIN must be exactly 6 digits.");
  }

  if (!["admin", "member", "warehouse"].includes(role)) {
    throw new Error("SEED_USER_ROLE must be admin, member, or warehouse.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: organization, error: orgError } = await supabase
    .from("organizations")
    .upsert(
      {
        name: organizationName,
        slug: organizationSlug,
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();

  if (orgError || !organization) {
    throw orgError ?? new Error("Unable to upsert organization.");
  }

  const { error: userError } = await supabase
    .from("app_users")
    .upsert(
      {
        organization_id: organization.id,
        display_name: displayName,
        email,
        role,
        pin_lookup: createPinLookup(pin, pinPepper),
        pin_hash: hashPin(pin, pinPepper),
        is_active: true,
      },
      { onConflict: "pin_lookup" },
    );

  if (userError) {
    throw userError;
  }

  process.stdout.write("Seeded organization/user successfully.\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
