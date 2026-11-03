import { NextRequest, NextResponse } from "next/server";


export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const events: { type: string; source?: { type: string; groupId?: string } }[] = body?.events ?? [];

    for (const event of events) {
      if (event.type === "join" && event.source?.type === "group") {
        const groupId = event.source.groupId ?? "";
        console.log("[line/webhook] OA joined group. Set LINE_GROUP_ID =", groupId);
      }
    }
  } catch (err) {
    console.error("[line/webhook] Error parsing body:", err);
  }

  return NextResponse.json({ ok: true });
}
