import { NextResponse } from "next/server";

type DebugRequestBody = {
  details?: Record<string, unknown>;
  event?: string;
};

function sanitizePrimitive(value: unknown) {
  if (typeof value === "string") {
    return value.slice(0, 200);
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  return String(value).slice(0, 200);
}

function sanitizeDetails(input: Record<string, unknown> | undefined) {
  if (!input) return {};

  return Object.fromEntries(
    Object.entries(input)
      .slice(0, 12)
      .map(([key, value]) => [key.slice(0, 80), sanitizePrimitive(value)]),
  );
}

export async function POST(request: Request) {
  let body: DebugRequestBody;
  try {
    body = (await request.json()) as DebugRequestBody;
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  const event = typeof body.event === "string" ? body.event.trim().slice(0, 80) : "";
  if (!event) {
    return NextResponse.json({ message: "Missing event." }, { status: 400 });
  }

  console.info("[order-debug]", {
    details: sanitizeDetails(body.details),
    event,
  });

  return new NextResponse(null, { status: 204 });
}
