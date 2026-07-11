"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListTree, PencilLine, Store } from "lucide-react";
import { updateCustomerOrderAction } from "@/app/settings/customers/actions";
import { CustomerDeleteButton } from "@/components/settings/customer-delete-button";
import { CustomerVehicleSelect } from "@/components/settings/customer-vehicle-select";
import {
  SettingsEmptyState,
  SettingsPanel,
  SettingsPanelBody,
} from "@/components/settings/settings-ui";
import { moveCustomerId } from "@/lib/settings/customer-order.mjs";
import type { SettingsCustomer, SettingsVehicle } from "@/lib/settings/admin";

const CUSTOMER_PAGE_SIZE = 25;
const MOBILE_SCROLL_EDGE = 300;
const MOBILE_SCROLL_BOTTOM_RESERVED = 126;

type CustomerListPanelProps = {
  customers: SettingsCustomer[];
  reorderEnabled?: boolean;
  searchTerm?: string;
  vehicles: SettingsVehicle[];
};

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, [query]);

  return matches;
}

function useMobileDragAutoScroll(active: boolean) {
  const pointerPosition = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef<number | null>(null);
  const previousOverscroll = useRef("");

  const getScrollContainer = useCallback((x: number, y: number) => {
    const element = document.elementFromPoint(x, y);
    let current: HTMLElement | null = element instanceof HTMLElement ? element : null;

    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      if (
        ["auto", "scroll"].includes(style.overflowY) &&
        current.scrollHeight > current.clientHeight
      ) {
        return current;
      }
      current = current.parentElement;
    }

    return document.scrollingElement;
  }, []);

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const runFrameRef = useRef<() => void>(() => undefined);
  const runFrame = useCallback(() => {
    const position = pointerPosition.current;
    if (!position) {
      stopFrame();
      return;
    }

    const height = window.innerHeight;
    const bottomEdge = height - MOBILE_SCROLL_BOTTOM_RESERVED;
    let speed = 0;
    if (position.y < MOBILE_SCROLL_EDGE) {
      speed = -Math.min(27, 5 + ((MOBILE_SCROLL_EDGE - position.y) / MOBILE_SCROLL_EDGE) * 22);
    } else if (position.y > bottomEdge - MOBILE_SCROLL_EDGE && position.y < bottomEdge) {
      speed = Math.min(
        27,
        5 + ((position.y - (bottomEdge - MOBILE_SCROLL_EDGE)) / MOBILE_SCROLL_EDGE) * 22,
      );
    }

    if (speed !== 0) {
      const target = getScrollContainer(position.x, position.y);
      target?.scrollBy({ top: speed, behavior: "auto" });
    }

    frameRef.current = requestAnimationFrame(() => runFrameRef.current());
  }, [getScrollContainer, stopFrame]);

  useEffect(() => {
    runFrameRef.current = runFrame;
  }, [runFrame]);

  useEffect(() => {
    if (!active) {
      pointerPosition.current = null;
      stopFrame();
      return;
    }

    const updatePointer = (event: PointerEvent | TouchEvent) => {
      const point = "touches" in event ? event.touches[0] : event;
      if (!point) return;
      pointerPosition.current = { x: point.clientX, y: point.clientY };
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(() => runFrameRef.current());
      }
    };

    previousOverscroll.current = document.body.style.overscrollBehaviorY;
    document.body.style.overscrollBehaviorY = "contain";
    document.addEventListener("pointermove", updatePointer, true);
    document.addEventListener("touchmove", updatePointer, { capture: true, passive: true });

    return () => {
      document.body.style.overscrollBehaviorY = previousOverscroll.current;
      document.removeEventListener("pointermove", updatePointer, true);
      document.removeEventListener("touchmove", updatePointer, true);
      pointerPosition.current = null;
      stopFrame();
    };
  }, [active, stopFrame]);
}

function DragHandle({
  attributes,
  disabled,
  listeners,
  setActivatorNodeRef,
}: {
  attributes: object;
  disabled?: boolean;
  listeners: object | undefined;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
}) {
  if (disabled) return null;

  return (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      className="touch-none cursor-grab rounded-lg border border-slate-200 bg-slate-50 p-2 text-slate-400 transition hover:text-slate-600 active:cursor-grabbing"
      aria-label="ลากเพื่อเปลี่ยนลำดับร้านค้า"
    >
      <GripVertical className="h-5 w-5" strokeWidth={2.2} />
    </button>
  );
}

function SortableMobileCustomerCard({
  customer,
  disabled = false,
  vehicles,
}: {
  customer: SettingsCustomer;
  disabled?: boolean;
  vehicles: SettingsVehicle[];
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: customer.id, disabled });

  return (
    <article
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.12 : 1,
        zIndex: isDragging ? 2 : 1,
      }}
      className="w-full border-b border-slate-100 px-4 py-5"
    >
      <div className="flex items-start gap-3">
        <DragHandle
          attributes={attributes}
          disabled={disabled}
          listeners={listeners}
          setActivatorNodeRef={setActivatorNodeRef}
        />
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/[0.08]">
          <Store className="h-6 w-6 text-[#003366]" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="text-lg font-bold leading-snug text-slate-950">{customer.name}</p>
            <p className="font-mono text-sm text-slate-400">{customer.code}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 pt-1">
          <Link
            href={`/settings/customers?edit=${customer.id}`}
            scroll={false}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#003366] transition hover:bg-slate-50 active:scale-95"
            aria-label={`แก้ไข ${customer.name}`}
          >
            <PencilLine className="h-3.5 w-3.5" strokeWidth={2.2} />
          </Link>
          <CustomerDeleteButton customerId={customer.id} customerName={customer.name} customerCode={customer.code} />
        </div>
      </div>

      {customer.address ? (
        <p className="mt-3 w-full break-words text-sm leading-6 text-slate-600">{customer.address}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">
          ผูกราคา {customer.pricingCount} รายการ
        </span>
      </div>
      <CustomerVehicleSelect
        className="mt-3 w-full"
        customerId={customer.id}
        currentVehicleId={customer.defaultVehicleId}
        currentVehicleName={customer.defaultVehicleName}
        vehicles={vehicles}
      />
    </article>
  );
}

function MobileCustomerOverlay({ customer }: { customer: SettingsCustomer }) {
  return (
    <article className="w-[min(92vw,520px)] scale-[1.035] rounded-2xl border border-[#003366]/20 bg-white px-4 py-5 shadow-2xl">
      <div className="flex items-center gap-3">
        <GripVertical className="h-5 w-5 shrink-0 text-[#003366]" strokeWidth={2.2} />
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/[0.08]">
          <Store className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-950">{customer.name}</p>
          <p className="font-mono text-sm text-slate-400">{customer.code}</p>
        </div>
      </div>
    </article>
  );
}

function SortableDesktopCustomerRow({
  customer,
  disabled = false,
  vehicles,
  index,
}: {
  customer: SettingsCustomer;
  disabled?: boolean;
  index: number;
  vehicles: SettingsVehicle[];
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: customer.id, disabled });

  return (
    <tr
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        backgroundColor: isDragging ? "#F3E5F5" : undefined,
        position: "relative",
        zIndex: isDragging ? 50 : 1,
      }}
      className="align-middle transition-colors hover:bg-slate-50/70"
    >
      <td className="w-20 px-3 py-4 text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm font-semibold tabular-nums text-slate-400">{index + 1}</span>
          <DragHandle
            attributes={attributes}
            disabled={disabled}
            listeners={listeners}
            setActivatorNodeRef={setActivatorNodeRef}
          />
        </div>
      </td>
      <td className="px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#003366]/[0.08]">
            <Store className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
          </div>
          <p className="text-base font-semibold text-slate-950">{customer.name}</p>
        </div>
      </td>
      <td className="px-5 py-4 font-mono text-sm text-slate-600">{customer.code}</td>
      <td className="max-w-xs px-5 py-4 text-sm leading-6 text-slate-500 xl:max-w-sm">
        {customer.address || <span className="text-slate-300">-</span>}
      </td>
      <td className="px-5 py-4">
        <span className="inline-flex rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">
          {customer.pricingCount} รายการ
        </span>
      </td>
      <td className="min-w-[220px] px-5 py-4 text-sm text-slate-600">
        <CustomerVehicleSelect
          customerId={customer.id}
          currentVehicleId={customer.defaultVehicleId}
          currentVehicleName={customer.defaultVehicleName}
          vehicles={vehicles}
        />
      </td>
      <td className="px-4 py-4 text-right">
        <div className="inline-flex items-center justify-end gap-2">
          <Link
            href={`/settings/customers?edit=${customer.id}`}
            scroll={false}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#003366] transition hover:bg-slate-50 active:scale-95"
            aria-label={`แก้ไข ${customer.name}`}
          >
            <PencilLine className="h-3.5 w-3.5" strokeWidth={2.2} />
          </Link>
          <CustomerDeleteButton customerId={customer.id} customerName={customer.name} customerCode={customer.code} />
        </div>
      </td>
    </tr>
  );
}

export function CustomerListPanel({
  customers,
  reorderEnabled = true,
  searchTerm = "",
  vehicles,
}: CustomerListPanelProps) {
  const [orderedCustomers, setOrderedCustomers] = useState(customers);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(CUSTOMER_PAGE_SIZE);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isMobile = useMediaQuery("(max-width: 639px)");
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Keep optimistic local order aligned after server navigation/revalidation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrderedCustomers(customers);
    setVisibleCount(CUSTOMER_PAGE_SIZE);
  }, [customers]);

  const q = searchTerm.toLocaleLowerCase("th").trim();
  const filtered = useMemo(
    () =>
      orderedCustomers.filter((customer) =>
        q
          ? [customer.name, customer.code, customer.address].some((value) =>
              value.toLocaleLowerCase("th").includes(q),
            )
          : true,
      ),
    [orderedCustomers, q],
  );
  const canReorder = reorderEnabled && !q && orderedCustomers.length > 1;
  const visibleCustomers = canReorder ? orderedCustomers.slice(0, visibleCount) : filtered;
  const activeCustomer = activeId
    ? orderedCustomers.find((customer) => customer.id === activeId) ?? null
    : null;

  useEffect(() => {
    if (!canReorder || visibleCount >= orderedCustomers.length) return;
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((count) => Math.min(count + CUSTOMER_PAGE_SIZE, orderedCustomers.length));
        }
      },
      { rootMargin: "200px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [canReorder, orderedCustomers.length, visibleCount]);

  useMobileDragAutoScroll(isMobile && canReorder && activeId !== null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragStart(event: DragStartEvent) {
    setSaveError(null);
    setActiveId(String(event.active.id));
    if (isMobile && navigator.vibrate) navigator.vibrate(12);
  }

  function handleDragEnd(event: DragEndEvent) {
    const active = String(event.active.id);
    const over = event.over ? String(event.over.id) : null;
    setActiveId(null);
    if (!canReorder || !over || active === over) return;

    const oldIndex = orderedCustomers.findIndex((customer) => customer.id === active);
    const newIndex = orderedCustomers.findIndex((customer) => customer.id === over);
    if (oldIndex < 0 || newIndex < 0) return;

    const previousOrder = orderedCustomers;
    const customerById = new Map(orderedCustomers.map((customer) => [customer.id, customer]));
    const nextOrder = moveCustomerId(
      orderedCustomers.map((customer) => customer.id),
      active,
      over,
    ).map((customerId) => customerById.get(customerId)!);
    setOrderedCustomers(nextOrder);
    setIsSaving(true);
    setSaveError(null);

    startTransition(async () => {
      const result = await updateCustomerOrderAction(nextOrder.map((customer) => customer.id));
      if (result.error) {
        setOrderedCustomers(previousOrder);
        setSaveError(result.error);
      }
      setIsSaving(false);
    });
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  const content = filtered.length === 0 ? (
    <div className="p-6">
      <SettingsEmptyState className="py-14">
        {q ? "ไม่พบร้านค้าที่ตรงกับการค้นหา" : 'ยังไม่มีร้านค้าในระบบ กดปุ่ม "เพิ่มร้านค้า" เพื่อสร้างรายการแรก'}
      </SettingsEmptyState>
    </div>
  ) : (
    <DndContext
      id="settings-customer-list"
      sensors={canReorder ? sensors : []}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      modifiers={[restrictToVerticalAxis]}
      autoScroll={canReorder && isMobile ? false : { enabled: canReorder }}
    >
      <SortableContext
        items={(canReorder ? orderedCustomers : visibleCustomers).map((customer) => customer.id)}
        strategy={verticalListSortingStrategy}
      >
        {isMobile ? (
          <div className="divide-y divide-slate-100">
            {visibleCustomers.map((customer) => (
              <SortableMobileCustomerCard
                key={customer.id}
                customer={customer}
                disabled={!canReorder}
                vehicles={vehicles}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-3 py-4 text-center text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">ลำดับ</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">ร้านค้า</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">รหัสร้าน</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">ที่อยู่</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">ราคาที่ผูก</th>
                  <th className="px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">รถประจำร้าน</th>
                  <th className="px-4 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleCustomers.map((customer, index) => (
                  <SortableDesktopCustomerRow
                    key={customer.id}
                    customer={customer}
                    disabled={!canReorder}
                    index={index}
                    vehicles={vehicles}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SortableContext>
      <DragOverlay
        dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" }}
      >
        {isMobile && activeCustomer ? <MobileCustomerOverlay customer={activeCustomer} /> : null}
      </DragOverlay>
    </DndContext>
  );

  return (
    <SettingsPanel>
      <div className="border-b border-slate-100 px-5 py-4 md:px-6 md:py-5">
        <div className="flex items-center gap-2">
          <ListTree className="h-5 w-5 text-[#003366]" strokeWidth={2.2} />
          <h2 className="text-xl font-bold text-slate-950">รายการร้านค้า</h2>
          {filtered.length > 0 ? (
            <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-slate-500">
              {filtered.length}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          {q ? "ผลการค้นหาไม่สามารถลากเพื่อเปลี่ยนลำดับได้" : "ลากจากไอคอนจับเพื่อจัดลำดับร้านค้า"}
        </p>
        {isSaving || isPending ? (
          <p className="mt-2 text-sm font-semibold text-[#003366]">กำลังบันทึกลำดับร้านค้า...</p>
        ) : null}
        {saveError ? <p className="mt-2 text-sm font-semibold text-rose-600">{saveError}</p> : null}
      </div>
      <SettingsPanelBody className="p-0">
        {content}
        {canReorder && visibleCount < orderedCustomers.length ? <div ref={loadMoreRef} className="h-8" /> : null}
      </SettingsPanelBody>
    </SettingsPanel>
  );
}
