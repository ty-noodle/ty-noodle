import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { IncomingOrdersInfiniteList } from "@/components/orders/incoming-orders-infinite-list";

const order = {
  id: "o1", customerId: "c1", customerCode: "TYS001", customerName: "Shop",
  channelLabel: "manual", orderDate: "2026-10-17", createdAt: "10:00", orderNumber: "ORD1",
  notes: null, productCount: 1, totalAmount: 100, vehicleId: null, vehicleName: null,
  status: "submitted", fulfillmentStatus: "pending", sortOrder: 1,
};
window.qaExtra = { ...order, id: "o2", orderNumber: "ORD2", customerName: "Second", totalAmount: 75 };
window.qaDetail = { id: "o1", totalAmount: 100, notes: null, items: [{ productId: "p1", quantity: 1 }] };
window.qaSave = (amount) => {
  window.qaDetail = { ...window.qaDetail, totalAmount: amount, items: [{ productId: "p1", quantity: amount / 100 }] };
  window.dispatchEvent(new CustomEvent("incoming-order-updated", {
    detail: { id: "o1", totalAmount: amount, notes: null, productCount: 1 },
  }));
};
window.IntersectionObserver = class {
  constructor(callback) { window.qaIntersect = () => callback([{ isIntersecting: true }]); }
  observe() {}
  disconnect() {}
};

function App() {
  const [rows, setRows] = useState([order]);
  const [initialDetail, setInitialDetail] = useState(null);
  useEffect(() => {
    window.qaRefresh = (amount) => setRows([{ ...order, totalAmount: amount }]);
    window.qaSetInitialDetail = () => setInitialDetail(structuredClone(window.qaDetail));
  }, []);
  return (
    <IncomingOrdersInfiniteList
      orders={rows} hasMore={true} billedByCustomerDate={{}} deliveryByCustomerId={{}}
      initialExpandedDetail={initialDetail} initialExpandedOrderId={initialDetail ? "o1" : ""}
      endDate="2026-10-17" orderDate="2026-10-17" products={[]} searchTerm=""
      selectedCustomerIds={[]} vehicles={[]}
    />
  );
}
createRoot(document.getElementById("root")).render(<App />);
