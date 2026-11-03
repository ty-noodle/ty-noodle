import "server-only";

type LineVerifyResponse = {
  aud?: string;
  exp?: string | number;
  name?: string;
  picture?: string;
  sub?: string;
};

function getChannelIdFromLiffId(liffId: string) {
  const channelId = liffId.split("-")[0]?.trim() ?? "";
  return channelId;
}

export type VerifiedLineIdToken = {
  displayName: string | null;
  lineUserId: string;
};

export async function verifyLineIdToken(
  idToken: string,
  liffId: string,
): Promise<VerifiedLineIdToken | null> {
  const channelId = getChannelIdFromLiffId(liffId);

  if (!channelId || !idToken?.trim()) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: channelId,
    id_token: idToken,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as LineVerifyResponse;

    if (!payload?.sub) {
      return null;
    }

    if (payload.aud && payload.aud !== channelId) {
      return null;
    }

    if (payload.exp) {
      const expiryMs = Number(payload.exp) * 1000;
      if (Number.isFinite(expiryMs) && expiryMs <= Date.now()) {
        return null;
      }
    }

    return {
      displayName: payload.name?.trim() || null,
      lineUserId: payload.sub,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

