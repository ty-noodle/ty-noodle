import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth/session";
import {
  deactivateUserPushSubscription,
  getPushSubscriptionPublicKey,
  getUserPushSubscriptions,
  savePushSubscription,
} from "@/lib/push/web-push";
import { hasWebPushConfig } from "@/lib/supabase/env";

type SubscriptionRequestBody = {
  endpoint?: string;
  p256dh?: string;
  auth?: string;
  platform?: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function GET() {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  if (!hasWebPushConfig()) {
    return NextResponse.json({
      configured: false,
      publicKey: "",
      subscriptions: [],
    });
  }

  try {
    const subscriptions = await getUserPushSubscriptions(
      session.organizationId,
      session.userId,
    );

    return NextResponse.json({
      configured: true,
      publicKey: getPushSubscriptionPublicKey(),
      subscriptions: subscriptions.map((item) => item.endpoint),
    });
  } catch (error) {
    console.error("[push/subscription:get]", error);
    return NextResponse.json({ message: "Failed to load push status." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  if (!hasWebPushConfig()) {
    return NextResponse.json({ message: "Web Push is not configured." }, { status: 503 });
  }

  let body: SubscriptionRequestBody;

  try {
    body = (await request.json()) as SubscriptionRequestBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.endpoint) || !isNonEmptyString(body.p256dh) || !isNonEmptyString(body.auth)) {
    return NextResponse.json({ message: "Missing push subscription fields." }, { status: 400 });
  }

  try {
    await savePushSubscription({
      organizationId: session.organizationId,
      userId: session.userId,
      endpoint: body.endpoint.trim(),
      p256dh: body.p256dh.trim(),
      auth: body.auth.trim(),
      platform: isNonEmptyString(body.platform) ? body.platform.trim() : null,
      userAgent: request.headers.get("user-agent"),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[push/subscription:post]", error);
    return NextResponse.json({ message: "Failed to save push subscription." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getAppSession();
  if (!session) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  let body: SubscriptionRequestBody;

  try {
    body = (await request.json()) as SubscriptionRequestBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  if (!isNonEmptyString(body.endpoint)) {
    return NextResponse.json({ message: "Missing endpoint." }, { status: 400 });
  }

  try {
    await deactivateUserPushSubscription(
      session.organizationId,
      session.userId,
      body.endpoint.trim(),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[push/subscription:delete]", error);
    return NextResponse.json({ message: "Failed to disable push subscription." }, { status: 500 });
  }
}
