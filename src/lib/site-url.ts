export function getSiteUrl() {
  const rawUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.VERCEL_URL?.trim() ||
    "http://localhost:3000";

  const normalizedUrl = rawUrl.startsWith("http")
    ? rawUrl
    : `https://${rawUrl}`;

  return normalizedUrl.replace(/\/+$/, "");
}
