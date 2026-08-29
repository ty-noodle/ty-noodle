"use client";

import { createContext, useCallback, useContext, useState, useTransition } from "react";
import { fetchOrderModalDataAction } from "@/app/orders/incoming/actions";
import type { OrderCustomerOption, OrderProductOption } from "@/lib/orders/manage";

type CreateOrderData = {
  customers: OrderCustomerOption[];
  products: OrderProductOption[];
  today: string;
};

type CreateOrderCtx = {
  isOpen: boolean;
  open: (customerId?: string) => void;
  close: () => void;
  data: CreateOrderData | null;
  isLoading: boolean;
  initialCustomerId?: string;
};

const Ctx = createContext<CreateOrderCtx | null>(null);

export function CreateOrderProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialCustomerId, setInitialCustomerId] = useState<string | undefined>();
  const [data, setData] = useState<CreateOrderData | null>(null);
  const [isPending, startTransition] = useTransition();

  const open = useCallback((customerId?: string) => {
    setInitialCustomerId(customerId);
    setIsOpen(true);
    
    // Fetch data on-demand if it hasn't been loaded yet
    setData((currentData) => {
      if (!currentData && !isPending) {
        startTransition(async () => {
          try {
            const result = await fetchOrderModalDataAction();
            setData(result);
          } catch (error) {
            console.error("Failed to fetch order modal data:", error);
          }
        });
      }
      return currentData;
    });
  }, [isPending]);

  const close = useCallback(() => {
    setIsOpen(false);
    setInitialCustomerId(undefined);
  }, []);

  return (
    <Ctx.Provider
      value={{
        isOpen,
        open,
        close,
        data,
        isLoading: isPending,
        initialCustomerId,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCreateOrder() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCreateOrder must be used inside CreateOrderProvider");
  return ctx;
}
