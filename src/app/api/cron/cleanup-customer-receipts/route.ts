import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const RECEIPT_BUCKET = "customer-receipts";
const RECEIPT_FOLDER = "line-receipts";
const MAX_FILES_PER_REQUEST = 1000;
const RETENTION_DAYS = 30;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  return Boolean(secret && authorization === `Bearer ${secret}`);
}

function isExpiredReceiptFile(name: string, createdAt: string | null, cutoffTime: number) {
  return Boolean(name && !name.includes("/") && createdAt && Date.parse(createdAt) < cutoffTime);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const cutoffTime = Date.now() - RETENTION_DAYS * DAY_IN_MS;
  const summary = {
    organizationsScanned: 0,
    filesScanned: 0,
    filesSelected: 0,
    filesDeleted: 0,
    failures: 0,
  };

  const { data: organizations, error: organizationsError } = await supabase
    .from("organizations")
    .select("id");

  if (organizationsError) {
    console.error("[cleanup-customer-receipts:organizations]", organizationsError);
    return NextResponse.json({ error: "Failed to load organizations" }, { status: 500 });
  }

  for (const organization of organizations ?? []) {
    summary.organizationsScanned += 1;
    const folder = `${organization.id}/${RECEIPT_FOLDER}`;
    const expiredPaths: string[] = [];
    let offset = 0;

    while (true) {
      const { data: files, error: listError } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .list(folder, { limit: MAX_FILES_PER_REQUEST, offset });

      if (listError) {
        summary.failures += 1;
        console.error("[cleanup-customer-receipts:list]", { folder, error: listError.message });
        break;
      }

      const page = files ?? [];
      summary.filesScanned += page.length;
      for (const file of page) {
        if (isExpiredReceiptFile(file.name, file.created_at, cutoffTime)) {
          expiredPaths.push(`${folder}/${file.name}`);
        }
      }

      if (page.length < MAX_FILES_PER_REQUEST) break;
      offset += page.length;
    }

    summary.filesSelected += expiredPaths.length;
    for (let index = 0; index < expiredPaths.length; index += MAX_FILES_PER_REQUEST) {
      const batch = expiredPaths.slice(index, index + MAX_FILES_PER_REQUEST);
      const { error: removeError } = await supabase.storage.from(RECEIPT_BUCKET).remove(batch);

      if (removeError) {
        summary.failures += batch.length;
        console.error("[cleanup-customer-receipts:remove]", {
          count: batch.length,
          error: removeError.message,
        });
        continue;
      }

      summary.filesDeleted += batch.length;
    }
  }

  console.info("[cleanup-customer-receipts:complete]", summary);
  return NextResponse.json({ ...summary, retentionDays: RETENTION_DAYS });
}
