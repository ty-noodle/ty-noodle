"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { usePathname } from "next/navigation";

type MobileSearchCtx = {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  hasSearch: boolean;
  /** Called by MobileSearchDrawer on mount/unmount to register/unregister itself */
  _register: () => () => void;
};

const Ctx = createContext<MobileSearchCtx | null>(null);

export function MobileSearchProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState(0);
  const pathname = usePathname();

  // Reset isOpen when pathname changes (navigation)
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setIsOpen(false);
  }

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const _register = useCallback(() => {
    setCount((n) => n + 1);
    return () => setCount((n) => n - 1);
  }, []);

  return (
    <Ctx.Provider value={{ isOpen, open, close, hasSearch: count > 0, _register }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMobileSearch() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMobileSearch must be used inside MobileSearchProvider");
  return ctx;
}
