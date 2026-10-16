"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { fetchOrderModalDataAction } from "@/app/(workspace)/orders/incoming/actions";
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
  const pathname = usePathname();
  const [modalPathname, setModalPathname] = useState(pathname);
  const [dataPathname, setDataPathname] = useState(pathname);
  const [isOpen, setIsOpen] = useState(false);
  const [initialCustomerId, setInitialCustomerId] = useState<string | undefined>();
  const [loadedData, setData] = useState<CreateOrderData | null>(null);
  const data = dataPathname === pathname ? loadedData : null;
  const [isPending, startTransition] = useTransition();
  const loadInFlightRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const [previousPathname, setPreviousPathname] = useState(pathname);

  useEffect(() => () => {
    requestIdRef.current += 1;
    loadInFlightRef.current = null;
  }, [pathname]);

  if (previousPathname !== pathname) {
    setPreviousPathname(pathname);
    setIsOpen(false);
    setInitialCustomerId(undefined);
    setData(null);
  }

  const open = useCallback((customerId?: string) => {
    setModalPathname(pathname);
    setInitialCustomerId(customerId);
    setIsOpen(true);
    
    // Side effects must not run inside a state updater: React may execute an
    // updater while rendering, which previously caused a transition loop.
    if (data || loadInFlightRef.current === pathname) return;

    loadInFlightRef.current = pathname;
    const requestId = ++requestIdRef.current;
    startTransition(async () => {
      try {
        const result = await fetchOrderModalDataAction();
        if (requestId === requestIdRef.current) {
          setData(result);
          setDataPathname(pathname);
        }
      } catch (error) {
        console.error("Failed to fetch order modal data:", error);
      } finally {
        if (requestId === requestIdRef.current) loadInFlightRef.current = null;
      }
    });
  }, [data, pathname]);

  const close = useCallback(() => {
    setIsOpen(false);
    setInitialCustomerId(undefined);
  }, []);

  return (
    <Ctx.Provider
      value={{
        isOpen: isOpen && modalPathname === pathname,
        open,
        close,
        data,
        isLoading: isPending,
        initialCustomerId: modalPathname === pathname ? initialCustomerId : undefined,
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
