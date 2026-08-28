import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  DashboardTimeoutError,
  createDashboardTimingEvent,
  normalizeDashboardSnapshot,
  withDeadline,
} from "@/lib/dashboard/snapshot-core.mjs";
import type { DashboardAggregateSnapshot } from "@/lib/dashboard/snapshot-core.mjs";

const AGGREGATE_DEADLINE_MS = 5_000;

export async function measureDashboardGroup<T>(
  group: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();

  try {
    const result = await operation();
    console.info(
      "dashboard_timing",
      createDashboardTimingEvent(group, performance.now() - startedAt, "ok"),
    );
    return result;
  } catch (error) {
    const outcome = error instanceof DashboardTimeoutError ? "timeout" : "error";
    console.error(
      "dashboard_timing",
      createDashboardTimingEvent(group, performance.now() - startedAt, outcome),
    );
    throw error;
  }
}

export async function getDashboardAggregateSnapshot(
  organizationId: string,
  businessDate: string,
): Promise<DashboardAggregateSnapshot> {
  return measureDashboardGroup("aggregate", () =>
    withDeadline("aggregate", AGGREGATE_DEADLINE_MS, async (signal) => {
      const admin = getSupabaseAdmin();
      const { data, error } = await admin
        .rpc("get_dashboard_snapshot_v1" as never, {
          p_organization_id: organizationId,
          p_business_date: businessDate,
        } as never)
        .abortSignal(signal);

      if (error) {
        throw new Error(error.message ?? "Failed to load dashboard aggregate snapshot.");
      }

      const rows = data as unknown;
      if (!Array.isArray(rows) || rows.length !== 1) {
        throw new TypeError("Dashboard aggregate RPC must return exactly one row.");
      }

      return normalizeDashboardSnapshot(rows[0]);
    }),
  );
}
