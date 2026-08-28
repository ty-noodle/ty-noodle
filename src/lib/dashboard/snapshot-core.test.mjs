import assert from "node:assert/strict";
import test from "node:test";

import {
  DashboardTimeoutError,
  compareDashboardResults,
  createDashboardTimingEvent,
  normalizeDashboardSnapshot,
  withDeadline,
} from "./snapshot-core.mjs";

test("normalizes the typed RPC row without changing values", () => {
  assert.deepEqual(
    normalizeDashboardSnapshot({
      today_order_count: 70,
      today_order_amount: "12500.50",
      today_net_profit: "4300.25",
      today_cost: "8200.25",
      submitted_order_count: 70,
      pending_delivery_count: 1234,
      pending_delivery_amount: "456789.25",
      month_delivered_amount: "98000.00",
      active_customer_count: 112,
      low_stock_count: 8,
    }),
    {
      todayOrderCount: 70,
      todayOrderAmount: 12500.5,
      todayNetProfit: 4300.25,
      todayCost: 8200.25,
      submittedOrderCount: 70,
      pendingDeliveryCount: 1234,
      pendingDeliveryAmount: 456789.25,
      monthDeliveredAmount: 98000,
      activeCustomerCount: 112,
      lowStockCount: 8,
    },
  );
});

test("rejects invalid numeric fields", () => {
  assert.throws(
    () => normalizeDashboardSnapshot({ today_order_count: "invalid" }),
    /today_order_count/,
  );
});

test("rejects a delayed group with its group name", async () => {
  await assert.rejects(
    withDeadline(
      "stock",
      5,
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    ),
    (error) => error instanceof DashboardTimeoutError && error.group === "stock",
  );
});

test("passes an abort signal to the operation", async () => {
  let receivedSignal;
  const result = await withDeadline("fast", 50, async (signal) => {
    receivedSignal = signal;
    return "ok";
  });

  assert.equal(result, "ok");
  assert.equal(receivedSignal instanceof AbortSignal, true);
  assert.equal(receivedSignal.aborted, false);
});

test("reports paths but not values for unequal results", () => {
  assert.deepEqual(
    compareDashboardResults(
      { kpi: { pendingDeliveryCount: 1001 }, recentOrders: [] },
      { kpi: { pendingDeliveryCount: 1000 }, recentOrders: [] },
    ),
    { equal: false, mismatches: ["kpi.pendingDeliveryCount"] },
  );
});

test("creates payload-free timing events", () => {
  assert.deepEqual(createDashboardTimingEvent("aggregate", 123.456, "ok"), {
    group: "aggregate",
    durationMs: 123.5,
    outcome: "ok",
  });
});
