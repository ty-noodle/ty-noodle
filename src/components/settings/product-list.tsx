"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { GripVertical, Package2, Pencil, Plus, Power } from "lucide-react";
import { setProductActive, updateProductOrder } from "@/app/dashboard/settings/actions";
import { DeleteProductButton } from "@/components/settings/delete-product-button";
import { ProductCostHistoryButton } from "@/components/settings/product-cost-history-button";
import { ProductImagePreview } from "@/components/settings/product-image-preview";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";
import type { SettingsProduct } from "@/lib/settings/admin";

// Drag & Drop Imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';

type ProductListProps = {
  baseListHref?: string;
  products: SettingsProduct[];
};

function formatCost(value: number) {
  return value.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Sortable Mobile Card ──────────────────────────────────────────────────
function SortableMobileCard({ 
  product, 
  editHref, 
  deleteFormId, 
  defaultUnit 
}: { 
  product: SettingsProduct; 
  editHref: string; 
  deleteFormId: string; 
  defaultUnit: { effectiveCostPrice: number } | null | undefined; 
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : (product.isActive ? 1 : 0.7),
    backgroundColor: isDragging ? '#f8fafc' : (product.isActive ? 'white' : '#f8fafc/30'),
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`w-full px-4 py-6 shadow-none transition-colors relative ${isDragging ? 'shadow-lg' : ''}`}
    >
      <div className="flex items-start gap-4">
        {/* Drag Handle - Specific target for mobile touch */}
        <div 
          {...attributes} 
          {...listeners} 
          className="cursor-grab p-2 text-slate-400 hover:text-slate-600 active:cursor-grabbing flex items-center justify-center border border-slate-200 rounded-lg bg-slate-50"
          aria-label="ลากเพื่อย้ายลำดับ"
        >
          <GripVertical className="h-5 w-5" />
        </div>

        <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white border border-slate-100">
          {product.imageUrls[0] ? (
            <ProductImagePreview src={product.imageUrls[0]} alt={product.name} thumbnailSizes="112px" />
          ) : (
            <Package2 className="h-9 w-9 text-slate-300" strokeWidth={1.5} />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[#003366]/40">
            {product.sku}
          </p>
          <p className="mt-0.5 text-lg font-black leading-tight text-slate-950">
            {product.name}
          </p>
          
          <div className="mt-3">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-400 mb-1.5 ml-1">ต้นทุน / หน่วย</p>
            {defaultUnit ? (
              <div className="flex items-center justify-between rounded-xl px-3 py-2 text-sm bg-[#003366]/5 border border-[#003366]/10">
                <span className="font-bold text-[#003366]">
                  {product.baseUnit}
                </span>
                <span className="font-black text-[#003366]">
                  {formatCost(defaultUnit.effectiveCostPrice)} บาท
                </span>
              </div>
            ) : null}
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
                product.isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-100 text-slate-500 border border-slate-200"
              }`}
            >
              {product.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100">
        <div className="grid grid-cols-4 gap-2">
          <Link
            href={editHref}
            scroll={false}
            className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
          >
            <Pencil className="h-4 w-4 text-[#003366]" strokeWidth={2.5} />
            แก้ไข
          </Link>

          <ProductCostHistoryButton 
            productId={product.id} 
            productName={product.name} 
            triggerClassName="w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
          />

          <form action={setProductActive}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="nextState" value={product.isActive ? "false" : "true"} />
            <button
              type="submit"
              className="w-full flex flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95"
            >
              <Power className="h-4 w-4 text-emerald-600" strokeWidth={2.5} />
              {product.isActive ? "ปิด" : "เปิด"}
            </button>
          </form>

          <div className="relative">
            <form id={deleteFormId} className="hidden">
              <input type="hidden" name="productId" value={product.id} />
            </form>
            <DeleteProductButton 
              formId={deleteFormId} 
              productName={product.name}
              triggerClassName="w-full h-full flex flex-col items-center justify-center gap-1.5 rounded-xl border border-rose-100 bg-rose-50/50 py-2.5 text-[11px] font-bold text-rose-600 transition hover:bg-rose-50 active:scale-95"
            />
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Sortable Desktop Row ──────────────────────────────────────────────────
function SortableDesktopRow({ 
  product, 
  editHref, 
  deleteFormId, 
  defaultUnit 
}: { 
  product: SettingsProduct; 
  editHref: string; 
  deleteFormId: string; 
  defaultUnit: { effectiveCostPrice: number } | null | undefined; 
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : (product.isActive ? 1 : 0.6),
    backgroundColor: isDragging ? '#f8fafc' : 'transparent',
    zIndex: isDragging ? 50 : 1,
  };

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`${product.isActive ? "hover:bg-slate-50/50" : "bg-slate-100/50"} ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Drag Handle */}
      <td className="border-r border-slate-300 px-3 py-5 text-center align-middle">
        <div 
          {...attributes} 
          {...listeners} 
          className="cursor-grab p-2 text-slate-400 hover:text-slate-600 active:cursor-grabbing inline-flex border border-slate-200 rounded-lg bg-slate-50"
          aria-label="ลากเพื่อย้ายลำดับ"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      </td>

      {/* รหัสสินค้า */}
      <td className="border-r border-slate-300 px-6 py-5 text-center align-middle text-base font-bold text-slate-900">
        {product.sku}
      </td>

      {/* รายการสินค้า */}
      <td className="border-r border-slate-300 px-6 py-5 align-middle">
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 border border-slate-100">
            {product.imageUrls[0] ? (
              <ProductImagePreview src={product.imageUrls[0]} alt={product.name} thumbnailSizes="64px" />
            ) : (
              <Package2 className="h-7 w-7 text-slate-300" strokeWidth={1.5} />
            )}
          </div>
          <p className="text-base font-black text-slate-950 tracking-tight">{product.name}</p>
        </div>
      </td>

      {/* หน่วยขาย */}
      <td className="border-r border-slate-300 p-0 align-middle">
        <div className="flex min-h-[3.25rem] items-center px-5 py-2.5">
          <span className="text-base font-bold text-slate-800">{product.baseUnit}</span>
        </div>
      </td>

      {/* ต้นทุน / หน่วย */}
      <td className="border-r border-slate-300 p-0 align-middle">
        {defaultUnit ? (
          <div className="flex min-h-[3.25rem] items-center px-5 py-2.5">
            <p className="text-base font-black text-slate-950">
              {formatCost(defaultUnit.effectiveCostPrice)} บาท
            </p>
          </div>
        ) : null}
      </td>

      {/* สถานะ */}
      <td className="border-r border-slate-300 px-6 py-5 text-center align-middle">
        <span
          className={`inline-flex rounded-full px-4 py-1.5 text-xs font-black leading-none ${
            product.isActive ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-slate-100 text-slate-500 border border-slate-200"
          }`}
        >
          {product.isActive ? "ใช้งาน" : "ปิดใช้งาน"}
        </span>
      </td>

      {/* จัดการ */}
      <td className="px-6 py-5 text-center align-middle">
        <div className="flex items-center justify-center gap-2">
          <Link
            href={editHref}
            scroll={false}
            className="action-touch-safe inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 active:scale-95"
          >
            <Pencil className="h-3.5 w-3.5 text-[#003366]" strokeWidth={2.5} />
            แก้ไข
          </Link>

          <ProductCostHistoryButton productId={product.id} productName={product.name} />

          <form action={setProductActive}>
            <input type="hidden" name="productId" value={product.id} />
            <input type="hidden" name="nextState" value={product.isActive ? "false" : "true"} />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 active:scale-95"
            >
              <Power className="h-3.5 w-3.5 text-emerald-600" strokeWidth={2.5} />
              {product.isActive ? "ปิด" : "เปิด"}
            </button>
          </form>

          <div className="ml-1">
            <form id={deleteFormId} className="hidden">
              <input type="hidden" name="productId" value={product.id} />
            </form>
            <DeleteProductButton formId={deleteFormId} productName={product.name} />
          </div>
        </div>
      </td>
    </tr>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────
export function ProductList({ products, baseListHref = "/settings/products" }: ProductListProps) {
  const [localProducts, setLocalProducts] = useState(products);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalProducts(products);
  }, [products]);

  const createHref = `${baseListHref}${baseListHref.includes("?") ? "&" : "?"}create=1`;
  const editHref = (id: string) =>
    `${baseListHref}${baseListHref.includes("?") ? "&" : "?"}edit=${id}`;

  // DnD Sensors
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement to start drag on desktop
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250, // Press and hold for 250ms to start drag on mobile (like professional apps)
        tolerance: 5, // Allow 5px movement during the delay
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      let updatedItems: typeof localProducts = [];
      
      setLocalProducts((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        
        updatedItems = arrayMove(items, oldIndex, newIndex);
        return updatedItems;
      });
      
      // Call server action to persist order OUTSIDE of state setter
      startTransition(async () => {
        try {
          await updateProductOrder(updatedItems.map(i => i.id));
        } catch (error) {
          console.error("Failed to update product order:", error);
          // Revert on error if needed, but optimistic update is usually fine for UI
        }
      });
    }
  }

  return (
    <>
    {/* Floating add button */}
    <Link
      href={createHref}
      scroll={false}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+6.75rem)] left-4 z-50 inline-flex items-center gap-2 rounded-full bg-[#003366] px-5 py-3.5 text-sm font-semibold text-white shadow-[0_8px_32px_rgba(0,51,102,0.35)] transition hover:bg-[#002244] active:scale-95 md:bottom-8 md:left-auto md:right-8"
    >
      <Plus className="h-4 w-4" strokeWidth={2.5} />
      เพิ่มสินค้า
    </Link>

    <SettingsPanel className="sm:rounded-xl sm:border sm:border-slate-200 sm:shadow-sm rounded-none border-none shadow-none bg-transparent sm:bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-6 py-5 md:flex-row md:items-center md:justify-between sm:rounded-t-xl">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-950">รายการสินค้า</h2>
            {isPending && (
              <span className="text-xs font-semibold text-[#003366] animate-pulse">
                (กำลังบันทึกลำดับ...)
              </span>
            )}
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            ดูสินค้าและจัดการสินค้าได้ที่นี่ แตะค้างที่ปุ่มจับลากเพื่อย้ายลำดับ
          </p>
        </div>
      </div>

      <SettingsPanelBody className="p-0">
        {localProducts.length > 0 ? (
          <DndContext
            id="settings-product-list"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext 
              items={localProducts.map(p => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {/* Mobile cards - Full Width */}
              <div className="grid grid-cols-1 divide-y divide-slate-200 px-0 py-0 sm:hidden">
                {localProducts.map((product) => {
                  const deleteFormId = `delete-product-${product.id}`;
                  const defaultUnit = product.saleUnits.find((u) => u.isDefault) || product.saleUnits[0];

                  return (
                    <SortableMobileCard 
                      key={product.id}
                      product={product}
                      editHref={editHref(product.id)}
                      deleteFormId={deleteFormId}
                      defaultUnit={defaultUnit}
                    />
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <table className="min-w-full border-collapse border border-slate-300 text-left">
                  <thead>
                    <tr style={{ backgroundColor: "#003366" }}>
                      <th
                        style={{ color: "white" }}
                        className="border-b border-r border-white/20 px-3 py-5 text-center text-base font-bold uppercase tracking-[0.16em] w-16"
                      >
                        ลำดับ
                      </th>
                      <th
                        style={{ color: "white" }}
                        className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                      >
                        รหัสสินค้า
                      </th>
                      <th
                        style={{ color: "white" }}
                        className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                      >
                        รายการสินค้า
                      </th>
                      <th
                        style={{ color: "white" }}
                        className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                      >
                        หน่วยขาย
                      </th>
                      <th
                        style={{ color: "white" }}
                        className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                      >
                        ต้นทุน / หน่วย
                      </th>
                      <th
                        style={{ color: "white" }}
                        className="border-b border-r border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                      >
                        สถานะ
                      </th>
                      <th
                        style={{ color: "white" }}
                        className="border-b border-white/20 px-6 py-5 text-center text-base font-bold uppercase tracking-[0.16em]"
                      >
                        จัดการ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {localProducts.map((product) => {
                      const deleteFormId = `delete-product-table-${product.id}`;
                      const defaultUnit = product.saleUnits.find((u) => u.isDefault) || product.saleUnits[0];

                      return (
                        <SortableDesktopRow 
                          key={product.id}
                          product={product}
                          editHref={editHref(product.id)}
                          deleteFormId={deleteFormId}
                          defaultUnit={defaultUnit}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="p-6">
            <SettingsEmptyState className="py-14">
              {'ยังไม่มีสินค้าในระบบ กดปุ่ม "เพิ่มสินค้า" เพื่อเริ่มสร้างรายการแรก'}
            </SettingsEmptyState>
          </div>
        )}
      </SettingsPanelBody>
    </SettingsPanel>
    </>
  );
}
