export class DashboardTimeoutError extends Error {
  constructor(group, timeoutMs) {
    super(`Dashboard group ${group} exceeded ${timeoutMs}ms`);
    this.name = "DashboardTimeoutError";
    this.group = group;
    this.timeoutMs = timeoutMs;
  }
}

const SNAPSHOT_FIELDS = {
  today_order_count: "todayOrderCount",
  today_order_amount: "todayOrderAmount",
  today_net_profit: "todayNetProfit",
  today_cost: "todayCost",
  submitted_order_count: "submittedOrderCount",
  pending_delivery_count: "pendingDeliveryCount",
  pending_delivery_amount: "pendingDeliveryAmount",
  month_delivered_amount: "monthDeliveredAmount",
  active_customer_count: "activeCustomerCount",
  low_stock_count: "lowStockCount",
};

export function normalizeDashboardSnapshot(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new TypeError("Invalid dashboard snapshot");
  }

  return Object.fromEntries(
    Object.entries(SNAPSHOT_FIELDS).map(([databaseField, applicationField]) => {
      const value = Number(row[databaseField]);
      if (!Number.isFinite(value)) {
        throw new TypeError(`Invalid dashboard snapshot field: ${databaseField}`);
      }
      return [applicationField, value];
    }),
  );
}

export async function withDeadline(group, timeoutMs, operation) {
  const controller = new AbortController();
  let timeoutId;

  try {
    const timeout = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        reject(new DashboardTimeoutError(group, timeoutMs));
      }, timeoutMs);
    });

    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      timeout,
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

function collectMismatches(left, right, path, mismatches) {
  if (Object.is(left, right)) return;

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      mismatches.push(path);
      return;
    }
    if (left.length !== right.length) mismatches.push(`${path}.length`);
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      collectMismatches(left[index], right[index], `${path}[${index}]`, mismatches);
    }
    return;
  }

  const leftIsObject = left !== null && typeof left === "object";
  const rightIsObject = right !== null && typeof right === "object";
  if (leftIsObject || rightIsObject) {
    if (!leftIsObject || !rightIsObject) {
      mismatches.push(path);
      return;
    }
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      collectMismatches(left[key], right[key], path ? `${path}.${key}` : key, mismatches);
    }
    return;
  }

  mismatches.push(path);
}

export function compareDashboardResults(legacy, candidate) {
  const mismatches = [];
  collectMismatches(legacy, candidate, "", mismatches);
  return { equal: mismatches.length === 0, mismatches };
}

export function createDashboardTimingEvent(group, durationMs, outcome) {
  return {
    group,
    durationMs: Math.round(durationMs * 10) / 10,
    outcome,
  };
}
