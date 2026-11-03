import "server-only";

import webpush from "web-push";
import { getSiteUrl } from "@/lib/site-url";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getWebPushPrivateKey,
  getWebPushPublicKey,
  getWebPushSubject,
  hasWebPushConfig,
} from "@/lib/supabase/env";

type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type StoredPushSubscriptionRow = PushSubscriptionRecord & {
  id: string;
  organization_id: string;
  user_id: string;
  is_active: boolean;
  platform: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
};

type SavePushSubscriptionInput = PushSubscriptionRecord & {
  organizationId: string;
  userId: string;
  platform?: string | null;
  userAgent?: string | null;
};

type PushPayload = {
  title: string;
  body: string;
  badgeCount?: number;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
};

type PushSendOptions = {
  payload: PushPayload;
  topic: string;
  ttl: number;
  warningLabel: string;
};

export function getPushSubscriptionPublicKey() {
  return hasWebPushConfig() ? getWebPushPublicKey() : "";
}

let webPushConfigured = false;

function ensureWebPushConfigured() {
  if (!hasWebPushConfig()) {
    return false;
  }

  if (!webPushConfigured) {
    webpush.setVapidDetails(
      getWebPushSubject(),
      getWebPushPublicKey(),
      getWebPushPrivateKey(),
    );
    webPushConfigured = true;
  }

  return true;
}

export async function savePushSubscription(input: SavePushSubscriptionInput) {
  const now = new Date().toISOString();
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      organization_id: input.organizationId,
      user_id: input.userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      platform: input.platform ?? null,
      user_agent: input.userAgent ?? null,
      is_active: true,
      last_seen_at: now,
      updated_at: now,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    throw new Error(`Failed to save push subscription: ${error.message}`);
  }
}

export async function getUserPushSubscriptions(organizationId: string, userId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, is_active, organization_id, user_id, platform, user_agent, created_at, updated_at, last_seen_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("is_active", true);

  if (error) {
    throw new Error(`Failed to load push subscriptions: ${error.message}`);
  }

  return (data ?? []) as StoredPushSubscriptionRow[];
}

async function deactivatePushSubscriptionsByEndpoint(endpoints: string[]) {
  if (endpoints.length === 0) return;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .in("endpoint", endpoints);

  if (error) {
    console.warn("[push] Failed to deactivate subscriptions:", error.message);
  }
}

async function sendOrganizationPushNotification(
  organizationId: string,
  options: PushSendOptions,
) {
  if (!ensureWebPushConfigured()) {
    return;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, is_active, organization_id, user_id, platform, user_agent, created_at, updated_at, last_seen_at")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (error) {
    console.warn(`[push] Failed to load subscriptions for ${options.warningLabel}:`, error.message);
    return;
  }

  const subscriptions = (data ?? []) as StoredPushSubscriptionRow[];
  if (subscriptions.length === 0) {
    return;
  }

  const invalidEndpoints: string[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          JSON.stringify(options.payload),
          {
            TTL: options.ttl,
            urgency: "high",
            topic: options.topic.slice(0, 32),
          },
        );
      } catch (error) {
        const statusCode =
          typeof error === "object" && error !== null && "statusCode" in error
            ? Number((error as { statusCode?: number }).statusCode)
            : 0;

        console.warn(`[push] Failed to send ${options.warningLabel} notification:`, statusCode || error);

        if (statusCode === 400 || statusCode === 404 || statusCode === 410) {
          invalidEndpoints.push(subscription.endpoint);
        }
      }
    }),
  );

  if (invalidEndpoints.length > 0) {
    await deactivatePushSubscriptionsByEndpoint(invalidEndpoints);
  }
}

export async function deactivateUserPushSubscription(
  organizationId: string,
  userId: string,
  endpoint: string,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("push_subscriptions")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("endpoint", endpoint);

  if (error) {
    throw new Error(`Failed to deactivate push subscription: ${error.message}`);
  }
}

export async function sendNewOrderPushNotification({
  organizationId,
  customerName,
  orderNumber,
}: {
  organizationId: string;
  customerName: string;
  orderNumber: string;
}) {
  await sendOrganizationPushNotification(organizationId, {
    payload: {
      title: "มีออเดอร์ใหม่",
      body: `${customerName} - ${orderNumber}`,
      badgeCount: 1,
      icon: "/brand/192x192.png",
      badge: "/brand/192x192.png",
      tag: "new-order",
      url: `${getSiteUrl()}/orders/incoming`,
    },
    ttl: 60 * 60,
    topic: orderNumber,
    warningLabel: "new order",
  });
}

export async function sendNewCustomerInquiryPushNotification({
  inquiryId,
  organizationId,
  customerName,
  customerPhone,
}: {
  inquiryId: string;
  organizationId: string;
  customerName: string;
  customerPhone: string;
}) {
  await sendOrganizationPushNotification(organizationId, {
    payload: {
      title: "ลูกค้าใหม่ขอสั่งสินค้า",
      body: `${customerName} - ${customerPhone} - แตะเพื่อเปิดข้อมูลลูกค้า`,
      badgeCount: 1,
      icon: "/brand/192x192.png",
      badge: "/brand/192x192.png",
      tag: "new-customer-inquiry",
      url: `${getSiteUrl()}/settings/customer-data?open=inquiry-call&inquiryId=${encodeURIComponent(inquiryId)}`,
    },
    ttl: 60 * 60 * 24,
    topic: "new-customer-inquiry",
    warningLabel: "new customer inquiry",
  });
}

function getLoginDeviceLabel(userAgent: string | null) {
  const value = userAgent?.toLowerCase() ?? "";

  if (!value) return "ไม่ทราบอุปกรณ์";
  if (value.includes("iphone")) return "iPhone";
  if (value.includes("ipad")) return "iPad";
  if (value.includes("android")) return "Android";
  if (value.includes("windows")) return "Windows";
  if (value.includes("macintosh") || value.includes("mac os")) return "Mac";

  return "อุปกรณ์อื่น";
}

export async function sendLoginSuccessPushNotification({
  organizationId,
  displayName,
  role,
  userAgent,
}: {
  organizationId: string;
  displayName: string;
  role: string;
  userAgent: string | null;
}) {
  const device = getLoginDeviceLabel(userAgent);

  await sendOrganizationPushNotification(organizationId, {
    payload: {
      title: "มีการเข้าสู่ระบบ",
      body: `${displayName || "ผู้ใช้"} เข้าสู่ระบบด้วย ${device}`,
      badgeCount: 1,
      icon: "/brand/192x192.png",
      badge: "/brand/192x192.png",
      tag: "login-success",
      url: `${getSiteUrl()}/dashboard`,
    },
    ttl: 60 * 10,
    topic: `login-${role}`,
    warningLabel: "login success",
  });
}
