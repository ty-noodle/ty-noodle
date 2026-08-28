export type DashboardAggregateSnapshot = {
  todayOrderCount: number;
  todayOrderAmount: number;
  todayNetProfit: number;
  todayCost: number;
  submittedOrderCount: number;
  pendingDeliveryCount: number;
  pendingDeliveryAmount: number;
  monthDeliveredAmount: number;
  activeCustomerCount: number;
  lowStockCount: number;
};

export class DashboardTimeoutError extends Error {
  group: string;
  timeoutMs: number;
  constructor(group: string, timeoutMs: number);
}

export function normalizeDashboardSnapshot(row: unknown): DashboardAggregateSnapshot;

export function withDeadline<T>(
  group: string,
  timeoutMs: number,
  operation: (signal: AbortSignal) => Promise<T> | T,
): Promise<T>;

export function compareDashboardResults(
  legacy: unknown,
  candidate: unknown,
): { equal: boolean; mismatches: string[] };

export function createDashboardTimingEvent(
  group: string,
  durationMs: number,
  outcome: "ok" | "error" | "timeout" | "fallback",
): { group: string; durationMs: number; outcome: string };
