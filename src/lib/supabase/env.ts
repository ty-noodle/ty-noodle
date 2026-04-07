export function hasSupabaseEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function getSessionSecret() {
  return String(process.env.SESSION_SECRET ?? "").trim();
}

export function hasSessionSecret() {
  return getSessionSecret().length >= 16;
}

export function hasPinPepper() {
  return Boolean(process.env.LOGIN_PIN_PEPPER?.trim());
}
