import React from "react";

export function useRouter() { return { push() {}, replace() {}, refresh() {} }; }
export function IncomingOrderModal() { return null; }
export function IncomingOrderDateButton() { return null; }
export function IncomingOrderVehicleSelect() { return null; }
export function OrderDeliveryActionButton() { return null; }
export function DesktopOrderDetail({ detail }) {
  return <output id="qa-detail">{JSON.stringify(detail)}</output>;
}
export async function fetchIncomingOrderDetailAction() {
  if (window.qaDeferNextFetch) {
    window.qaDeferNextFetch = false;
    return new Promise((resolve) => { window.qaResolveOldFetch = resolve; });
  }
  return { detail: structuredClone(window.qaDetail) };
}
export async function loadMoreIncomingOrdersAction() {
  return { orders: [window.qaExtra], hasMore: false, deliveryByCustomerDate: {}, billedByCustomerDate: {} };
}
