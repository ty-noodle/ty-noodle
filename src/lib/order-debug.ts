export function maskLineUserId(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  if (normalized.length <= 8) return normalized;
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

export function summarizeError(error: unknown) {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`.slice(0, 200);
  }
  return String(error).slice(0, 200);
}

export async function reportOrderDebugClient(
  event: string,
  details: Record<string, unknown> = {},
) {
  try {
    await fetch("/api/order/debug", {
      body: JSON.stringify({ details, event }),
      headers: {
        "Content-Type": "application/json",
      },
      keepalive: true,
      method: "POST",
    });
  } catch {
    // Debug telemetry must never affect the user flow.
  }
}
