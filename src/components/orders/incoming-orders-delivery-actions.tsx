"use client";

import { AllStoresDeliveryButton } from "@/components/orders/pending-orders-section";

type IncomingOrdersDeliveryActionsProps = {
  date: string;
  endDate?: string;
  stores: {
    customerId: string;
    customerName: string;
    customerCode: string;
    orderDate: string;
    orderIds?: string[];
    orderNumbers?: string[];
    deliveryNoteIds?: string[];
    orderRounds: number;
    totalAmount: number;
    vehicleId?: string | null;
    vehicleName?: string | null;
  }[];
};

export function IncomingOrdersDeliveryActions({ date, endDate, stores }: IncomingOrdersDeliveryActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <AllStoresDeliveryButton date={date} endDate={endDate} stores={stores} />
    </div>
  );
}
