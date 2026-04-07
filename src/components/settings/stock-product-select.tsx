"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import { useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, Package2, Search } from "lucide-react";
import { settingsInputClass } from "@/components/settings/settings-ui";
import type { StockProductOption } from "@/lib/stock/admin";

type StockProductSelectProps = {
  id?: string;
  onChange: (productId: string) => void;
  products: StockProductOption[];
  value: string;
};

const MAX_VISIBLE_OPTIONS = 60;

function getOptionLabel(product: StockProductOption) {
  return `${product.sku} ${product.name}`;
}

export function StockProductSelect({
  id,
  onChange,
  products,
  value,
}: StockProductSelectProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const deferredQuery = useDeferredValue(query);

  const selectedProduct = products.find((product) => product.id === value) ?? null;
  const inputValue = isOpen ? query : (selectedProduct ? getOptionLabel(selectedProduct) : query);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLocaleLowerCase("th");

    if (!normalizedQuery) {
      return products.slice(0, MAX_VISIBLE_OPTIONS);
    }

    return products
      .filter((product) =>
        `${product.sku} ${product.name}`.toLocaleLowerCase("th").includes(normalizedQuery),
      )
      .slice(0, MAX_VISIBLE_OPTIONS);
  }, [deferredQuery, products]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!isOpen || !inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: "fixed",
      top: rect.bottom + 6,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
        <Search className="h-4 w-4" strokeWidth={2} />
      </div>

      <input
        ref={inputRef}
        id={inputId}
        value={inputValue}
        onFocus={() => {
          setQuery(selectedProduct ? getOptionLabel(selectedProduct) : "");
          setIsOpen(true);
        }}
        onChange={(event) => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          setIsOpen(true);

          if (!nextQuery.trim()) {
            onChange("");
          }
        }}
        className={`${settingsInputClass} pl-10 pr-10`}
        placeholder="ค้นหาจากรหัสหรือชื่อสินค้า"
        autoComplete="off"
      />

      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
        <ChevronUp className={`h-4 w-4 transition ${isOpen ? "rotate-180" : ""}`} strokeWidth={2} />
      </div>

      {isOpen
        ? createPortal(
            <div
              style={dropdownStyle}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
            >
              <div className="max-h-72 overflow-y-auto p-2">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((product) => {
                    const availableQuantity = product.onHandQuantity - product.reservedQuantity;

                    return (
                      <button
                        key={product.id}
                        type="button"
                        onMouseDown={(event) => {
                          event.preventDefault();
                          onChange(product.id);
                          setQuery(getOptionLabel(product));
                          setIsOpen(false);
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition ${
                          product.id === value
                            ? "bg-sky-50 text-sky-700"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                          {product.imageUrl ? (
                            <Image
                              src={product.imageUrl}
                              alt={product.name}
                              fill
                              sizes="44px"
                              className="object-contain bg-white p-1"
                            />
                          ) : (
                            <Package2 className="h-5 w-5 text-slate-400" strokeWidth={2.2} />
                          )}
                        </div>

                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{product.name}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {product.sku} · พร้อมขาย {availableQuantity.toLocaleString("th-TH")}{" "}
                            {product.unit}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <div className="px-3 py-4 text-sm text-slate-500">ไม่พบสินค้าที่ค้นหา</div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
