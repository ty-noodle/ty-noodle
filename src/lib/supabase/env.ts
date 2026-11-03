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

function readEnv(name: string) {
  return String(process.env[name] ?? "").trim();
}

export function getWebPushPublicKey() {
  return readEnv("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY");
}

export function getWebPushPrivateKey() {
  return readEnv("WEB_PUSH_VAPID_PRIVATE_KEY");
}

export function getWebPushSubject() {
  return readEnv("WEB_PUSH_VAPID_SUBJECT");
}

export function hasWebPushConfig() {
  const subject = getWebPushSubject();
  const validSubject = subject.startsWith("mailto:") || subject.startsWith("https://");

  return Boolean(
    getWebPushPublicKey() &&
      getWebPushPrivateKey() &&
      validSubject,
  );
}
