"use client";

import Image from "next/image";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useLiff } from "@/components/liff-provider";
import {
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  Download,
  History,
  Info,
  Link2,
  Loader2,
  Lock,
  MapPin,
  Minus,
  Package,
  Phone,
  Search,
  Plus,
  Share2,
  ShoppingCart,
  Star,
  Store,
  UserPlus,
  X,
} from "lucide-react";
import type { Database } from "@/types/database";
import {
  getCustomerByLineId,
  registerLineCustomer,
  submitNewCustomerInquiry,
  getFrequentlyOrderedProducts,
  getCustomerOrders,
  createOrder,
  updateCustomerOrder,
} from "./actions";

// Types

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductImage = Database["public"]["Tables"]["product_images"]["Row"];
export type ProductWithImage = Product & {
  categoryIds: string[];
  categoryNames: string[];
  min_order_qty: number;
  product_id: string;
  product_images?: ProductImage[];
  product_sale_unit_id: string;
  sale_unit_label: string;
  sale_unit_ratio: number;
  step_order_qty: number | null;
};

// ─── Order window: 00:00 – 16:59 Bangkok time ────────────────────────────────

const ORDER_OPEN_HOUR = 0;   // 00:00
const ORDER_CLOSE_HOUR = 17; // 17:00

function getBangkokHour(): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: "Asia/Bangkok" })
      .format(new Date()),
    10,
  );
}

function calcIsOrderOpen(hour: number): boolean {
  return hour >= ORDER_OPEN_HOUR && hour < ORDER_CLOSE_HOUR;
}

function OrderStatusBanner({ isOpen }: { isOpen: boolean }) {
  if (isOpen) {
    return (
      <div
        className="flex items-center gap-3 border-b px-4 py-3"
        style={{ background: "#f0f6ff", borderColor: "#c7dcf5", borderLeft: "4px solid #003366" }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "#003366" }}>
          <Clock className="h-5 w-5 text-white" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-bold leading-snug" style={{ color: "#003366" }}>
            เปิดรับออเดอร์อยู่
          </p>
          <p className="text-sm font-medium" style={{ color: "#3a5f8a" }}>
            รับออเดอร์ถึง 17.00 น. วันนี้
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold" style={{ background: "#dcfce7", color: "#15803d" }}>
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" style={{ boxShadow: "0 0 6px #22c55e" }} />
          เปิด
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 border-b px-4 py-3"
      style={{ background: "#fff7f0", borderColor: "#fdd9b5", borderLeft: "4px solid #c2410c" }}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "#c2410c" }}>
        <Lock className="h-5 w-5 text-white" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold leading-snug" style={{ color: "#9a3412" }}>
          ปิดรับออเดอร์แล้ว
        </p>
        <p className="text-sm font-medium leading-snug" style={{ color: "#b45309" }}>
          เปิดรับอีกครั้งเที่ยงคืนนี้
        </p>
      </div>
      <span className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold" style={{ background: "#fee2e2", color: "#b91c1c" }}>
        <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
        ปิด
      </span>
    </div>
  );
}

// Receipt types

type ReceiptItem = {
  name: string;
  saleUnitLabel: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type LastOrderMeta = {
  orderNumber: string;
  totalAmount: number;
  orderDate: string;
  capturedAt: string;
  receiptItems: ReceiptItem[];
};

// OrderReceiptCard
// 360 px wide fits unknown mobile screen without scrolling.
// Saved PNG at scale 2.5 -> 900 x ~1400 px (high-res).

const RECEIPT_EXPORT_WIDTH = 360;
const RECEIPT_DISPLAY_MAX_WIDTH = 620;

function OrderReceiptCard({
  receiptRef,
  orderNumber,
  orderDate,
  storeName,
  items,
  totalAmount,
}: {
  receiptRef?: React.RefObject<HTMLDivElement | null>;
  orderNumber: string;
  orderDate: string;
  storeName: string;
  items: ReceiptItem[];
  totalAmount: number;
}) {
  void totalAmount;
  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat("th-TH", {
      day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Bangkok",
    }).format(new Date(iso));

  const fmtTime = (iso: string) =>
    new Intl.DateTimeFormat("th-TH", {
      hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok", hour12: false,
    }).format(new Date(iso));

  const FONT = "'Sarabun','Noto Sans Thai',sans-serif";
  const COL = "minmax(0,1fr) 54px 48px";
  const SIDE_PADDING = "clamp(16px, 4vw, 24px)";
  const RULE_MARGIN = "0 clamp(14px, 4vw, 20px)";
  const LINE: React.CSSProperties = { borderTop: "1px solid #cccccc", margin: RULE_MARGIN };
  const LINE_THICK: React.CSSProperties = { borderTop: "2px solid #000000", margin: RULE_MARGIN };

  return (
    <div
      ref={receiptRef}
      style={{
        width: "100%",
        minWidth: 0,
        maxWidth: `min(calc(100vw - 24px), ${RECEIPT_DISPLAY_MAX_WIDTH}px)`,
        flexShrink: 0,
        boxSizing: "border-box",
        backgroundColor: "#ffffff",
        fontFamily: FONT,
        color: "#000000",
        boxShadow: "0 4px 20px rgba(0,0,0,0.10)",
        margin: "0 auto",
      }}
    >
      {/* Row 1: logo only */}
      <div style={{ textAlign: "right", padding: "4px 8px 0" }}>
        <Image
          src="/ty-noodles-logo.png"
          alt="T&Y Noodle"
          width={56}
          height={56}
          sizes="56px"
          style={{ objectFit: "contain", display: "inline-block", width: "56px", height: "auto" }}
        />
      </div>

      {/* Row 2+: centered header */}
      <div style={{ textAlign: "center", padding: `0px ${SIDE_PADDING} 10px` }}>
        <div style={{ fontSize: "12px", lineHeight: 1.6 }}>
          T&amp;Y Noodle - ใบยืนยันคำสั่งซื้อ
        </div>
        <div style={{ fontSize: "16px", fontWeight: 800, lineHeight: 1.3, marginTop: "2px" }}>
          เลขที่ออเดอร์: {orderNumber}
        </div>
        <div style={{ fontSize: "13px", marginTop: "4px", lineHeight: 1.6 }}>
          {fmtDate(orderDate)} | {fmtTime(orderDate)}
        </div>
      </div>

      {/* Separator below header */}
      <div style={LINE_THICK} />

      {/* Store */}
      <div style={{ padding: `10px ${SIDE_PADDING} 12px` }}>
        <span style={{ fontWeight: 700, fontSize: "14px" }}>ร้านค้า:</span>
        <span style={{ fontSize: "14px" }}> {storeName}</span>
      </div>

      {/* Column headers */}
      <div style={{ display: "grid", gridTemplateColumns: COL, padding: `6px ${SIDE_PADDING}`, gap: "0 8px" }}>
        {(["สินค้า", "จำนวน", "หน่วย"] as const).map((label, i) => (
          <span key={label} style={{ fontSize: "14px", fontWeight: 800, textAlign: i === 0 ? "left" : i === 1 ? "center" : "right" }}>
            {label}
          </span>
        ))}
      </div>

      {/* same-width line below column headers */}
      <div style={LINE} />

      {/* Items */}
      {items.map((item, i) => (
        <div key={i}>
          <div style={{ display: "grid", gridTemplateColumns: COL, padding: `10px ${SIDE_PADDING}`, gap: "0 8px", alignItems: "center" }}>
            <div style={{ fontSize: "13px", lineHeight: 1.5, whiteSpace: "nowrap" }}>{item.name}</div>
            <div style={{ fontSize: "14px", textAlign: "center" }}>{item.quantity.toLocaleString("th-TH")}</div>
            <div style={{ fontSize: "14px", textAlign: "right" }}>{item.saleUnitLabel}</div>
          </div>
          <div style={LINE} />
        </div>
      ))}

      {/* Footer */}
      <div style={{ padding: `36px ${SIDE_PADDING} 32px`, textAlign: "center" }}>
        <div style={{ fontSize: "14px", fontWeight: 800, lineHeight: 1.6 }}>เส้นรังนก T&amp;Y Noodle</div>
        <div style={{ fontSize: "13px", marginTop: "2px", lineHeight: 1.6 }}>ขอบคุณสำหรับการสนับสนุนครับ</div>
      </div>
    </div>
  );
}

function getConstraintError(qty: number, min: number, step: number | null): string | null {
  if (qty <= 0) return null;
  if (qty < min) return `สั่งขั้นต่ำ ${min} ${step !== null ? `(เช่น ${min}, ${min + step}...)` : ""}`;
  if (step !== null && (qty - min) % step !== 0) {
    return `เพิ่ม/ลดทีละ ${step} (เช่น ${min}, ${min + step}, ${min + step * 2}...)`;
  }
  return null;
}

type Customer = { id: string; name: string; customer_code: string | null };
type FrequentProductSummary = {
  productId: string;
  productSaleUnitId: string | null;
  totalQuantity: number;
  orderCount: number;
  lastOrderedAt: string;
};
type CustomerOrderItem = {
  id?: string;
  product_sale_unit_id?: string | null;
  sale_unit_label?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  line_total?: number | string | null;
  products?: {
    id?: string;
    name?: string | null;
  } | null;
};
type CustomerOrderRow = {
  id?: string;
  order_number?: string | null;
  order_date?: string | null;
  created_at?: string | null;
  total_amount?: number | string | null;
  order_items?: CustomerOrderItem[] | null;
};
type ViewState = "loading" | "login" | "register" | "new_inquiry" | "inquiry_done" | "catalog" | "cart" | "success" | "profile" | "history" | "edit_order";
type GeoOption = { code: number; label: string; postalCode?: number };

function getDisplayUnit(unit: string | null | undefined) {
  return unit === "kg" ? "กก." : unit || "หน่วย";
}

function getBangkokOrderEditMeta(orderDate: string) {
  const nowParts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = part.value;
      return acc;
    }, {});

  const today = `${nowParts.year}-${nowParts.month}-${nowParts.day}`;
  const hour = Number(nowParts.hour ?? "0");
  const isEditable = orderDate === today && hour < 17;

  return {
    cutoffLabel: `${orderDate.split("-").reverse().join("/")} 17:00`,
    isEditable,
  };
}

const CatalogProductGrid = memo(function CatalogProductGrid({
  products,
  cart,
  favorites,
  onOpenProduct,
  onToggleFavorite,
}: {
  products: ProductWithImage[];
  cart: Record<string, number>;
  favorites: Record<string, boolean>;
  onOpenProduct: (productId: string) => void;
  onToggleFavorite: (productId: string) => void;
}) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-3.5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-5 lg:grid-cols-4 lg:gap-x-5 xl:grid-cols-5 2xl:grid-cols-6">
      {products.map((product) => {
        const qty = cart[product.id] || 0;
        const imageUrl =
          product.product_images?.[0]?.public_url || "/placeholders/product-placeholder.svg";

        return (
          <article
            key={product.id}
            className="flex flex-col overflow-hidden rounded-2xl transition-transform active:scale-98 md:rounded-[1.35rem]"
            onClick={() => onOpenProduct(product.id)}
            style={{ contain: "layout paint" }}
          >
            <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-2xl bg-slate-100 md:rounded-[1.35rem]">
              <Image
                src={imageUrl}
                alt={product.name}
                fill
                sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1535px) 25vw, 17vw"
                className="absolute inset-0 h-full w-full object-cover object-center"
              />

              {qty > 0 && (
                <div className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-[#003366] px-1.5 text-[10px] font-bold text-white shadow-lg ring-2 ring-white md:h-[1.65rem] md:min-w-[1.65rem]">
                  {qty}
                </div>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(product.id);
                }}
                className={`absolute right-2 top-2 rounded-xl bg-white/90 p-2 shadow-sm backdrop-blur-sm transition-colors active:scale-90 md:p-1.5 ${
                  favorites[product.id]
                    ? "text-amber-500"
                    : "text-slate-400 hover:text-amber-400"
                }`}
                aria-label={`สลับรายการโปรด ${product.name}`}
              >
                <Star
                  className="h-4 w-4 md:h-3.5 md:w-3.5"
                  fill={favorites[product.id] ? "currentColor" : "none"}
                  strokeWidth={2}
                />
              </button>
            </div>

            <div className="flex min-w-0 flex-grow items-start justify-between gap-2 px-0 pb-3 pt-3 pr-0 md:gap-2.5 md:pt-3.5">
              <div className="min-h-[2.5rem] flex-1 md:min-h-[2.75rem]">
                <h3 className="text-left text-[0.84rem] font-bold leading-5 text-slate-900 line-clamp-2 md:text-[0.82rem] md:leading-[1.35rem]">
                  {product.name}
                </h3>
              </div>
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#003366] text-white shadow-md transition-transform active:scale-90 md:h-8 md:w-8">
                <Plus className="h-4 w-4 md:h-4 md:w-4" strokeWidth={3} />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
});

const ModalQuantityStepper = memo(function ModalQuantityStepper({
  quantity,
  unitLabel,
  onDecrease,
  onIncrease,
}: {
  quantity: number;
  unitLabel: string;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div
      className="flex items-center rounded-[1.35rem] border border-slate-200 bg-white p-1.5 shadow-[0_16px_30px_rgba(15,23,42,0.08)] touch-manipulation"
    >
      <button
        onClick={onDecrease}
        className={`flex h-11 w-11 items-center justify-center rounded-xl transition-all active:scale-95 ${
          quantity > 0
            ? "border border-slate-200/70 bg-slate-50 text-slate-900 shadow-sm"
            : "pointer-events-none text-slate-300"
        }`}
        aria-label="ลดจำนวนสินค้า"
      >
        <Minus className="h-5 w-5" strokeWidth={2.5} />
      </button>

      <div className="flex w-[84px] select-none flex-col items-center justify-center">
        <span className="text-[18px] font-black leading-none text-slate-900 [font-variant-numeric:tabular-nums]">
          {quantity}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          {unitLabel}
        </span>
      </div>

      <button
        onClick={onIncrease}
        className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#003366] text-white shadow-md shadow-blue-900/15 transition-all active:scale-95 touch-manipulation"
        aria-label="เพิ่มจำนวนสินค้า"
      >
        <Plus className="h-5 w-5" strokeWidth={2.5} />
      </button>
    </div>
  );
});

// Component

export default function OrderClient({
  initialProducts,
  organizationId,
  orgPhone,
}: {
  initialProducts: ProductWithImage[];
  organizationId: string;
  orgPhone: string;
}) {
  const { isReady, profile, login, logout } = useLiff();
  const cartButtonRef = useRef<HTMLButtonElement | null>(null);

  // Order window state — updates every minute
  const [isOrderOpen, setIsOrderOpen] = useState(() => calcIsOrderOpen(getBangkokHour()));
  useEffect(() => {
    const tick = () => setIsOrderOpen(calcIsOrderOpen(getBangkokHour()));
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // Core cart state
  const [products] = useState<ProductWithImage[]>(initialProducts ?? []);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pendingSelection, setPendingSelection] = useState<Record<string, number>>({});
  const [pendingInput, setPendingInput] = useState<Record<string, string>>({});
  const [pendingInputError, setPendingInputError] = useState<Record<string, string>>({});
  const [lastOrder, setLastOrder] = useState<
    { productId: string; productSaleUnitId: string; quantity: number }[]
  >([]);
  void pendingInputError;
  void lastOrder;
  const [lastOrderMeta, setLastOrderMeta] = useState<LastOrderMeta | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<CustomerOrderRow | null>(null);
  const [isSavingImage, setIsSavingImage] = useState(false);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const receiptCardRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductCategory, setSelectedProductCategory] = useState<"all" | string>("all");

  // View state
  const [currentView, setCurrentView] = useState<ViewState>("loading");
  const [activeCategory, setActiveCategory] = useState<"all" | "favorites" | "recent">("all");
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  // Product detail modal state
  const [selectedProductIndex, setSelectedProductIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingModalQty, setPendingModalQty] = useState(0);
  const [modalImageIndexes, setModalImageIndexes] = useState<Record<string, number>>({});
  const [modalRecommendationIndex, setModalRecommendationIndex] = useState(0);
  const [modalRecommendationPageCount, setModalRecommendationPageCount] = useState(1);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");

  const modalCartBtnRef = useRef<HTMLButtonElement>(null);
  const modalStepperRef = useRef<HTMLDivElement>(null);
  const modalRecommendationsRef = useRef<HTMLDivElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const closeModalTimerRef = useRef<number | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchCurrentXRef = useRef<number | null>(null);

  // Swipe logic for modal images
  const minSwipeDistance = 32;

  const onTouchStart = (e: React.TouchEvent) => {
    const startX = e.targetTouches[0].clientX;
    touchStartXRef.current = startX;
    touchCurrentXRef.current = startX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchCurrentXRef.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (touchStartXRef.current === null || touchCurrentXRef.current === null) {
      return;
    }

    const distance = touchStartXRef.current - touchCurrentXRef.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    if (selectedProduct && selectedProductImages.length > 1) {
      if (isLeftSwipe) navigateModalImage(selectedProduct.id, selectedProductImages.length, "next");
      if (isRightSwipe) navigateModalImage(selectedProduct.id, selectedProductImages.length, "prev");
    }
    touchStartXRef.current = null;
    touchCurrentXRef.current = null;
  };

  const closeProductModal = () => {
    setIsModalOpen(false);
    setIsShareMenuOpen(false);
    setShareFeedback("");
    if (closeModalTimerRef.current !== null) {
      window.clearTimeout(closeModalTimerRef.current);
    }
    // Don't reset selectedProductIndex immediately to avoid content jump during exit animation
    closeModalTimerRef.current = window.setTimeout(() => {
      setSelectedProductIndex(null);
      closeModalTimerRef.current = null;
    }, 500);
  };

  const setModalImageIndex = (productId: string, nextIndex: number) => {
    setModalImageIndexes((prev) => ({
      ...prev,
      [productId]: Math.max(0, nextIndex),
    }));
  };

  const navigateModalImage = (productId: string, imageCount: number, direction: "prev" | "next") => {
    if (imageCount <= 1) return;

    setModalImageIndexes((prev) => {
      const currentIndex = prev[productId] ?? 0;
      const nextIndex =
        direction === "next"
          ? (currentIndex + 1) % imageCount
          : (currentIndex - 1 + imageCount) % imageCount;

      return {
        ...prev,
        [productId]: nextIndex,
      };
    });
  };

  useEffect(() => {
    return () => {
      if (closeModalTimerRef.current !== null) {
        window.clearTimeout(closeModalTimerRef.current);
      }
    };
  }, []);

  // Reset pending qty to 0 when swiping to a different product in the modal
  useEffect(() => {
    setPendingModalQty(0);
  }, [selectedProductIndex]);

  useEffect(() => {
    if (!isShareMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!shareMenuRef.current?.contains(event.target as Node)) {
        setIsShareMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isShareMenuOpen]);

  // Customer state
  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null);

  // Self-registration form state
  const [regName, setRegName] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regAddress, setRegAddress] = useState("");
  const [regProvinceCode, setRegProvinceCode] = useState<number | null>(null);
  const [regProvinceName, setRegProvinceName] = useState("");
  const [regDistrictCode, setRegDistrictCode] = useState<number | null>(null);
  const [regDistrictName, setRegDistrictName] = useState("");
  const [regSubdistrictCode, setRegSubdistrictCode] = useState<number | null>(null);
  const [regSubdistrictName, setRegSubdistrictName] = useState("");
  const [regPostalCode, setRegPostalCode] = useState("");
  const [provinces, setProvinces] = useState<GeoOption[]>([]);
  const [districts, setDistricts] = useState<GeoOption[]>([]);
  const [subdistricts, setSubdistricts] = useState<GeoOption[]>([]);
  const [isLoadingGeo, setIsLoadingGeo] = useState(false);
  const [regError, setRegError] = useState("");
  const [regFormOpen, setRegFormOpen] = useState(false);

  // New-customer inquiry state
  const [inquiryName, setInquiryName] = useState("");
  const [inquiryPhone, setInquiryPhone] = useState("");
  const [isPending, startTransition] = useTransition();
  const [orderHistory, setOrderHistory] = useState<CustomerOrderRow[]>([]);
  const [frequentProducts, setFrequentProducts] = useState<FrequentProductSummary[]>([]);
  const [editingOrder, setEditingOrder] = useState<CustomerOrderRow | null>(null);
  const [editCart, setEditCart] = useState<Record<string, number>>({});
  const [highlightedHistoryOrderId, setHighlightedHistoryOrderId] = useState<string | null>(null);

  // Auto-detect login and linked customer

  useEffect(() => {
    if (!isReady) return;

    startTransition(async () => {
      if (!profile) {
        setCurrentView("login");
        return;
      }

      const result = await getCustomerByLineId(profile.userId);

      if (result.success && result.data) {
        setLinkedCustomer(result.data as Customer);
        setCurrentView("catalog");
      } else {
        setRegFormOpen(false);
        setCurrentView("register");
      }
    });
  }, [isReady, profile]);

  // Geography cascade: load provinces when entering register view
  useEffect(() => {
    if (currentView !== "register" || provinces.length > 0) return;
    setIsLoadingGeo(true);
    fetch("/api/geography?level=provinces")
      .then((r) => r.json())
      .then((d) => setProvinces(d.options ?? []))
      .catch(() => {})
      .finally(() => setIsLoadingGeo(false));
  }, [currentView, provinces.length]);

  // Load districts when province selected
  useEffect(() => {
    if (!regProvinceCode) { setDistricts([]); setSubdistricts([]); return; }
    setIsLoadingGeo(true);
    fetch(`/api/geography?level=districts&provinceCode=${regProvinceCode}`)
      .then((r) => r.json())
      .then((d) => setDistricts(d.options ?? []))
      .catch(() => {})
      .finally(() => setIsLoadingGeo(false));
  }, [regProvinceCode]);

  // Load subdistricts when district selected
  useEffect(() => {
    if (!regProvinceCode || !regDistrictCode) { setSubdistricts([]); return; }
    setIsLoadingGeo(true);
    fetch(`/api/geography?level=subdistricts&provinceCode=${regProvinceCode}&districtCode=${regDistrictCode}`)
      .then((r) => r.json())
      .then((d) => setSubdistricts(d.options ?? []))
      .catch(() => {})
      .finally(() => setIsLoadingGeo(false));
  }, [regProvinceCode, regDistrictCode]);

  useEffect(() => {
    if (!linkedCustomer) {
      setFrequentProducts([]);
      setFavorites({});
      return;
    }

    try {
      const savedFavs = localStorage.getItem(`ty_favorites_${linkedCustomer.id}`);
      if (savedFavs) {
        setFavorites(JSON.parse(savedFavs));
      }
    } catch (e) {
      console.error(e);
    }

    let isActive = true;

    void (async () => {
      const result = await getFrequentlyOrderedProducts(linkedCustomer.id);
      if (!isActive) return;

      if (result.success) {
        setFrequentProducts(result.data);
      } else {
        setFrequentProducts([]);
      }
    })();

    void (async () => {
      const result = await getCustomerOrders(linkedCustomer.id);
      if (!isActive) return;
      if (result.success) {
        setOrderHistory((result.data ?? []) as CustomerOrderRow[]);
      }
    })();

    return () => {
      isActive = false;
    };
  }, [linkedCustomer]);

  // Cart helpers

  const toggleFavorite = useCallback((productId: string) => {
    if (!linkedCustomer) return;
    setFavorites((prev) => {
      const next = { ...prev, [productId]: !prev[productId] };
      try {
        localStorage.setItem(`ty_favorites_${linkedCustomer.id}`, JSON.stringify(next));
      } catch (e) {
        console.error(e);
      }
      return next;
    });
  }, [linkedCustomer]);

  const updateQuantity = (productId: string, direction: "increase" | "decrease" | "remove") => {
    if (direction === "increase" && !isOrderOpen) return;
    setCart((prev) => {
      const currentQty = prev[productId] || 0;
      const product = productsById.get(productId);
      const minQty = product?.min_order_qty ?? 1;
      const stepQty = product?.step_order_qty ?? 1;

      let next = currentQty;
      if (direction === "remove") {
        next = 0;
      } else if (direction === "increase") {
        next = currentQty === 0 ? minQty : currentQty + stepQty;
      } else {
        const reduced = currentQty - stepQty;
        next = reduced < minQty ? 0 : reduced;
      }

      const newCart = { ...prev };
      if (next === 0) delete newCart[productId];
      else newCart[productId] = next;
      return newCart;
    });
  };

  const updateEditQuantity = (productId: string, nextQuantity: number) => {
    setEditCart((prev) => {
      const next = Math.max(0, nextQuantity);
      const draft = { ...prev };
      if (next === 0) delete draft[productId];
      else draft[productId] = next;
      return draft;
    });
  };

  const buildCartFromOrder = (order: CustomerOrderRow | null) => {
    const draft: Record<string, number> = {};
    const orderItems = order?.order_items ?? [];

    orderItems.forEach((item) => {
      const orderItem = item as CustomerOrderItem;
      const catalogProduct = productsByLookupKey.get(
        `${orderItem.products?.id ?? ""}::${orderItem.product_sale_unit_id ?? ""}`,
      );
      if (!catalogProduct) return;
      draft[catalogProduct.id] = Number(orderItem.quantity) || 0;
    });

    return draft;
  };

  const openOrderHistory = (highlightOrderId?: string | null) => {
    setHighlightedHistoryOrderId(highlightOrderId ?? null);
    setCurrentView("history");
  };

  const openEditOrder = (order: CustomerOrderRow) => {
    const editMeta = getBangkokOrderEditMeta(order.order_date ?? "");
    if (!editMeta.isEditable) {
      alert("หมดเวลาแก้ไขแล้ว");
      return;
    }

    setEditingOrder(order);
    setEditCart(buildCartFromOrder(order));
    setHighlightedHistoryOrderId(order.id ?? null);
    setCurrentView("edit_order");
  };

  const setPendingSelectionValue = (productId: string, value: number) => {
    setPendingSelection((prev) => {
      const next = Math.max(0, value);
      const draft = { ...prev };
      if (next === 0) delete draft[productId];
      else draft[productId] = next;
      return draft;
    });
    setPendingInput((prev) => ({ ...prev, [productId]: value > 0 ? String(value) : "0" }));
    setPendingInputError((prev) => ({ ...prev, [productId]: "" }));
  };

  const handlePendingInputChange = (productId: string, rawValue: string) => {
    if (!/^\d*\.?\d*$/.test(rawValue)) return;

    setPendingInput((prev) => ({ ...prev, [productId]: rawValue }));

    if (rawValue === "") {
      setPendingInputError((prev) => ({ ...prev, [productId]: "" }));
      setPendingSelection((prev) => {
        const draft = { ...prev };
        delete draft[productId];
        return draft;
      });
      return;
    }

    const parsedValue = Number(rawValue);
    const product = productsById.get(productId);
    const minQty = product?.min_order_qty ?? 1;
    const stepQty = product?.step_order_qty ?? null;
    const error = getConstraintError(parsedValue, minQty, stepQty) ?? "";
    setPendingInputError((prev) => ({ ...prev, [productId]: error }));

    if (!error) {
      setPendingSelection((prev) => ({
        ...prev,
        [productId]: parsedValue,
      }));
    }
  };

  const validatePendingInput = (productId: string) => {
    const rawValue = pendingInput[productId] ?? "";
    if (rawValue === "") return;

    const parsedValue = Number(rawValue);
    const product = productsById.get(productId);
    const minQty = product?.min_order_qty ?? 1;
    const stepQty = product?.step_order_qty ?? null;
    const error = getConstraintError(parsedValue, minQty, stepQty) ?? "";

    if (error) {
      setPendingInputError((prev) => ({ ...prev, [productId]: error }));
      return;
    }

    setPendingSelectionValue(productId, parsedValue);
  };
  void handlePendingInputChange;
  void validatePendingInput;

  const animateProductToCart = useCallback((sourceImage: HTMLImageElement | null) => {
    if (
      !sourceImage ||
      !cartButtonRef.current ||
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const sourceRect = sourceImage.getBoundingClientRect();
    const cartRect = cartButtonRef.current.getBoundingClientRect();
    const flyingImage = sourceImage.cloneNode(true) as HTMLImageElement;

    Object.assign(flyingImage.style, {
      position: "fixed",
      top: `${sourceRect.top}px`,
      left: `${sourceRect.left}px`,
      width: `${sourceRect.width}px`,
      height: `${sourceRect.height}px`,
      borderRadius: "18px",
      objectFit: "cover",
      pointerEvents: "none",
      zIndex: "9999",
      opacity: "1",
      willChange: "transform, opacity",
      boxShadow: "0 18px 40px rgba(15, 23, 42, 0.18)",
      transition:
        "transform 720ms cubic-bezier(0.22, 1, 0.36, 1), opacity 720ms ease",
    });

    document.body.appendChild(flyingImage);

    const translateX =
      cartRect.left + cartRect.width / 2 - (sourceRect.left + sourceRect.width / 2);
    const translateY =
      cartRect.top + cartRect.height / 2 - (sourceRect.top + sourceRect.height / 2);

    requestAnimationFrame(() => {
      flyingImage.style.transform = `translate(${translateX}px, ${translateY}px) scale(0.18)`;
      flyingImage.style.opacity = "0.18";
    });

    cartButtonRef.current.animate(
      [
        { transform: "scale(1)" },
        { transform: "scale(1.12)" },
        { transform: "scale(1)" },
      ],
      {
        duration: 380,
        delay: 420,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    );

    window.setTimeout(() => {
      flyingImage.remove();
    }, 760);
  }, []);

  const addProductToCart = useCallback((
    productId: string,
    quantityToAdd: number,
    sourceImage?: HTMLImageElement | null,
  ) => {
    if (quantityToAdd <= 0) return;
    if (!isOrderOpen) return;

    setCart((prev) => ({
      ...prev,
      [productId]: (prev[productId] || 0) + quantityToAdd,
    }));
    animateProductToCart(sourceImage ?? null);
  }, [animateProductToCart, isOrderOpen]);

  const addPendingSelectionToCart = (
    productId: string,
    sourceImage?: HTMLImageElement | null,
  ) => {
    const quantityToAdd = pendingSelection[productId] || 0;
    if (quantityToAdd <= 0) return;

    addProductToCart(productId, quantityToAdd, sourceImage);

    setPendingSelection((prev) => {
      const draft = { ...prev };
      delete draft[productId];
      return draft;
    });
    setPendingInput((prev) => {
      const draft = { ...prev };
      delete draft[productId];
      return draft;
    });
    setPendingInputError((prev) => {
      const draft = { ...prev };
      delete draft[productId];
      return draft;
    });
  };
  void addPendingSelectionToCart;

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const productsByLookupKey = useMemo(
    () =>
      new Map(
        products.map((product) => [
          `${product.product_id}::${product.product_sale_unit_id}`,
          product,
        ]),
      ),
    [products],
  );

  const recentOrderKeys = useMemo(() => {
    const latestOrder = orderHistory[0];
    if (!latestOrder?.order_items) return new Set<string>();

    return new Set(
      latestOrder.order_items.map(
        (item) => `${item.products?.id ?? ""}::${item.product_sale_unit_id ?? ""}`,
      ),
    );
  }, [orderHistory]);

  const totalItems = useMemo(() => Object.values(cart).reduce((sum, qty) => sum + qty, 0), [cart]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.replace(/\s+/g, "").toLowerCase();
    if (!normalizedQuery) return products;

    return products.filter((p) => {
      const normalizedName = p.name.replace(/\s+/g, "").toLowerCase();
      const normalizedSku = (p.sku ?? "").replace(/\s+/g, "").toLowerCase();
      const normalizedCategories = (p.categoryNames ?? [])
        .join("")
        .replace(/\s+/g, "")
        .toLowerCase();
      return (
        normalizedName.includes(normalizedQuery) ||
        normalizedSku.includes(normalizedQuery) ||
        normalizedCategories.includes(normalizedQuery)
      );
    });
  }, [deferredSearchQuery, products]);

  const categoryOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const product of products) {
      for (let i = 0; i < product.categoryIds.length; i++) {
        const id = product.categoryIds[i];
        const name = product.categoryNames[i];
        if (id && name && !seen.has(id)) seen.set(id, name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

  const gridProducts = useMemo(() => {
    return filteredProducts.filter((p) => {
      if (selectedProductCategory !== "all" && !p.categoryIds.includes(selectedProductCategory)) return false;
      if (activeCategory === "all") return true;
      if (activeCategory === "favorites") return favorites[p.id];
      if (activeCategory === "recent") {
        return recentOrderKeys.has(`${p.product_id}::${p.product_sale_unit_id}`);
      }
      return true;
    });
  }, [activeCategory, favorites, filteredProducts, recentOrderKeys, selectedProductCategory]);

  const gridProductIndexById = useMemo(
    () => new Map(gridProducts.map((product, index) => [product.id, index])),
    [gridProducts],
  );

  const selectedProduct = useMemo(
    () => (selectedProductIndex === null ? null : gridProducts[selectedProductIndex] ?? null),
    [gridProducts, selectedProductIndex],
  );

  const selectedProductImages = selectedProduct?.product_images ?? [];
  const selectedProductImageIndex = selectedProduct
    ? Math.min(
        modalImageIndexes[selectedProduct.id] ?? 0,
        Math.max(selectedProductImages.length - 1, 0),
      )
    : 0;
  const selectedProductImageUrl =
    selectedProductImages[selectedProductImageIndex]?.public_url ??
    "/placeholders/product-placeholder.svg";

  const buildProductShareUrl = useCallback((productId: string) => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("product", productId);
    return url.toString();
  }, []);

  const openProductModal = useCallback((productId: string) => {
    const index = gridProductIndexById.get(productId);
    if (index === undefined) return;

    if (closeModalTimerRef.current !== null) {
      window.clearTimeout(closeModalTimerRef.current);
      closeModalTimerRef.current = null;
    }

    setPendingModalQty(0);
    setIsShareMenuOpen(false);
    setShareFeedback("");
    setSelectedProductIndex(index);
    setIsModalOpen(true);
  }, [gridProductIndexById]);

  const navigateProduct = useCallback((direction: "prev" | "next") => {
    setSelectedProductIndex((prev) => {
      if (prev === null || gridProducts.length === 0) return prev;
      if (gridProducts.length === 1) return 0;

      const delta = direction === "next" ? 1 : -1;
      return (prev + delta + gridProducts.length) % gridProducts.length;
    });
  }, [gridProducts.length]);
  void navigateProduct;

  const jumpToProduct = useCallback((index: number) => {
    if (index < 0 || index >= gridProducts.length) return;
    setIsShareMenuOpen(false);
    setShareFeedback("");
    setSelectedProductIndex(index);
  }, [gridProducts.length]);

  useEffect(() => {
    if (!selectedProduct) return;

    setModalImageIndexes((prev) => {
      if (prev[selectedProduct.id] !== undefined) return prev;
      return { ...prev, [selectedProduct.id]: 0 };
    });
  }, [selectedProduct]);

  const frequentProductCards = useMemo(
    () =>
      frequentProducts
        .map((summary) => {
          const product = productsByLookupKey.get(
            `${summary.productId}::${summary.productSaleUnitId}`,
          );
          return product ? { ...summary, product } : null;
        })
        .filter(
          (item): item is FrequentProductSummary & { product: ProductWithImage } => item !== null,
        ),
    [frequentProducts, productsByLookupKey],
  );

  const relatedUnitProducts = useMemo(
    () =>
      selectedProduct
        ? products.filter((product) => product.product_id === selectedProduct.product_id)
        : [],
    [products, selectedProduct],
  );

  const modalRecommendations = useMemo(
    () =>
      selectedProduct
        ? gridProducts
            .filter((product) => product.product_id !== selectedProduct.product_id)
            .slice(0, 5)
        : [],
    [gridProducts, selectedProduct],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    if (selectedProduct && isModalOpen) {
      url.searchParams.set("product", selectedProduct.id);
      window.history.replaceState({}, "", url.toString());
      return;
    }

    if (url.searchParams.has("product")) {
      url.searchParams.delete("product");
      window.history.replaceState({}, "", url.toString());
    }
  }, [isModalOpen, selectedProduct]);

  useEffect(() => {
    if (typeof window === "undefined" || currentView !== "catalog") return;

    const productId = new URL(window.location.href).searchParams.get("product");
    if (!productId) return;

    const index = gridProductIndexById.get(productId);
    if (index === undefined) return;

    setSelectedProductIndex(index);
    setIsModalOpen(true);
  }, [currentView, gridProductIndexById]);

  const syncRecommendationIndicator = useCallback((rail: HTMLDivElement | null) => {
    if (!rail) {
      setModalRecommendationPageCount(1);
      setModalRecommendationIndex(0);
      return;
    }

    const firstChild = rail.firstElementChild as HTMLElement | null;
    if (!firstChild) {
      setModalRecommendationPageCount(1);
      setModalRecommendationIndex(0);
      return;
    }

    const styles = window.getComputedStyle(rail);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "0") || 0;
    const pitch = firstChild.offsetWidth + gap;
    if (pitch <= 0) {
      setModalRecommendationPageCount(1);
      setModalRecommendationIndex(0);
      return;
    }

    const maxScroll = Math.max(rail.scrollWidth - rail.clientWidth, 0);
    const maxReachableIndex = Math.max(0, Math.round(maxScroll / pitch));
    const pageCount = Math.max(1, maxReachableIndex + 1);
    const activeIndex = Math.max(0, Math.min(maxReachableIndex, Math.round(rail.scrollLeft / pitch)));

    setModalRecommendationPageCount((prev) => (prev === pageCount ? prev : pageCount));
    setModalRecommendationIndex((prev) => (prev === activeIndex ? prev : activeIndex));
  }, []);

  useEffect(() => {
    const rail = modalRecommendationsRef.current;
    if (!rail) {
      setModalRecommendationPageCount(1);
      setModalRecommendationIndex(0);
      return;
    }

    rail.scrollTo({ left: 0, behavior: "auto" });

    const rafId = window.requestAnimationFrame(() => {
      syncRecommendationIndicator(rail);
    });

    const handleResize = () => syncRecommendationIndicator(rail);
    window.addEventListener("resize", handleResize);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
    };
  }, [selectedProduct?.id, syncRecommendationIndicator]);

  const handleRecommendationScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    syncRecommendationIndicator(event.currentTarget);
  }, [syncRecommendationIndicator]);

  const copyShareLink = useCallback(async () => {
    if (!selectedProduct) return;

    const url = buildProductShareUrl(selectedProduct.id);
    if (!url) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement("textarea");
        input.value = url;
        input.setAttribute("readonly", "true");
        input.style.position = "absolute";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }
      setShareFeedback("คัดลอกลิงก์แล้ว");
      window.setTimeout(() => setShareFeedback(""), 1800);
      setIsShareMenuOpen(false);
    } catch (error) {
      console.error(error);
      alert("คัดลอกลิงก์ไม่สำเร็จ");
    }
  }, [buildProductShareUrl, selectedProduct]);

  const openShareWindow = useCallback((target: "line" | "facebook") => {
    if (!selectedProduct) return;

    const url = buildProductShareUrl(selectedProduct.id);
    if (!url) return;

    const encodedUrl = encodeURIComponent(url);
    const shareUrl =
      target === "line"
        ? `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`
        : `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;

    window.open(shareUrl, "_blank", "noopener,noreferrer");
    setIsShareMenuOpen(false);
  }, [buildProductShareUrl, selectedProduct]);

  const formatOrderTimestamp = (value: string) => {
    const date = new Date(value);
    const datePart = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Bangkok" }).format(date);
    const [y, m, d] = datePart.split("-");
    const time = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok", hour12: false }).format(date);
    return `${d}/${m}/${parseInt(y, 10) + 543} ${time}`;
  };
  void formatOrderTimestamp;

  // Receipt

  const saveReceiptAsImage = async () => {
    if (!receiptCardRef.current || isSavingImage) return;
    setIsSavingImage(true);
    setReceiptImageUrl(null);
    let cloneHost: HTMLDivElement | null = null;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const target = receiptCardRef.current;
      const OUTER_PAD = 24; // white padding around the receipt in the saved image

      cloneHost = document.createElement("div");
      cloneHost.style.cssText = [
        "position:fixed",
        "left:-10000px",
        "top:0",
        `padding:${OUTER_PAD}px`,
        "margin:0",
        "background:#ffffff",
        "z-index:-1",
        "overflow:visible",
        `width:${RECEIPT_EXPORT_WIDTH + OUTER_PAD * 2}px`,
        "box-sizing:border-box",
      ].join(";");

      const clone = target.cloneNode(true) as HTMLDivElement;
      // Always capture at the fixed receipt width regardless of viewport size
      clone.style.width = `${RECEIPT_EXPORT_WIDTH}px`;
      clone.style.minWidth = `${RECEIPT_EXPORT_WIDTH}px`;
      clone.style.maxWidth = "none";
      clone.style.margin = "0";
      clone.style.transform = "none";

      cloneHost.appendChild(clone);
      document.body.appendChild(cloneHost);

      const captureWidth = RECEIPT_EXPORT_WIDTH + OUTER_PAD * 2;
      const captureHeight = Math.ceil(cloneHost.scrollHeight);

      const canvas = await html2canvas(cloneHost, {
        scale: 3,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        width: captureWidth,
        height: captureHeight,
        windowWidth: captureWidth,
        windowHeight: captureHeight,
        scrollX: 0,
        scrollY: 0,
      });
      const receiptOrderMeta = receiptOrder as { order_number?: string } | null;
      const fileName = `TYNoodle-${lastOrderMeta?.orderNumber ?? receiptOrderMeta?.order_number ?? "order"}.png`;
      const objectUrl = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.href = objectUrl;
      downloadLink.download = fileName;
      downloadLink.rel = "noopener";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    } catch (err) {
      console.error("[saveReceiptAsImage]", err);
    } finally {
      if (cloneHost && document.body.contains(cloneHost)) {
        document.body.removeChild(cloneHost);
      }
      setIsSavingImage(false);
    }
  };

  // Handlers

  const handleRegister = () => {
    if (!profile) return;
    setRegError("");

    if (!regName.trim()) { setRegError("กรุณากรอกชื่อร้านค้า"); return; }
    if (!regProvinceName) { setRegError("กรุณาเลือกจังหวัด"); return; }
    if (!regDistrictName) { setRegError("กรุณาเลือกอำเภอ/เขต"); return; }
    if (!regSubdistrictName) { setRegError("กรุณาเลือกตำบล/แขวง"); return; }

    startTransition(async () => {
      const result = await registerLineCustomer({
        organizationId,
        lineUserId: profile.userId,
        name: regName,
        phone: regPhone || undefined,
        address: regAddress || undefined,
        province: regProvinceName,
        district: regDistrictName,
        subdistrict: regSubdistrictName,
        postalCode: regPostalCode || undefined,
      });
      if (result.success) {
        setLinkedCustomer(result.data as Customer);
        setCurrentView("catalog");
      } else {
        setRegError(result.error);
      }
    });
  };

  const handleNewInquiry = () => {
    if (!inquiryName.trim() || !inquiryPhone.trim()) return;
    startTransition(async () => {
      await submitNewCustomerInquiry(inquiryName, inquiryPhone);
      setCurrentView("inquiry_done");
    });
  };

  const handleCheckout = () => {
    if (!profile || !linkedCustomer) { login(); return; }
    if (totalItems === 0) { alert("กรุณาเลือกสินค้าก่อนยืนยันสั่งซื้อ"); return; }

    const items = Object.entries(cart)
      .map(([catalogProductId, quantity]) => {
        const product = productsById.get(catalogProductId);
        if (!product) {
          return null;
        }

        return {
          productId: product.product_id,
          productSaleUnitId: product.product_sale_unit_id,
          quantity,
        };
      })
      .filter(
        (item): item is { productId: string; productSaleUnitId: string; quantity: number } =>
          item !== null,
      );

    startTransition(async () => {
      const result = await createOrder(organizationId, linkedCustomer.id, items);
      if (result.success) {
        setLastOrder(items);
        const resData = result.data as CustomerOrderRow;
        setLastOrderMeta({
          orderNumber: resData.order_number ?? "-",
          totalAmount: Number(resData.total_amount) || 0,
          orderDate: resData.order_date ?? new Date().toISOString().slice(0, 10),
          capturedAt: resData.created_at ?? new Date().toISOString(),
          receiptItems: (resData.order_items ?? []).map((item) => ({
            name: item.products?.name ?? "-",
            saleUnitLabel: item.sale_unit_label ?? "",
            quantity: Number(item.quantity) || 0,
            unitPrice: Number(item.unit_price) || 0,
            lineTotal: Number(item.line_total) || 0,
          })),
        });
        setCart({});
        setOrderHistory((prev) => [resData, ...prev]);
        setHighlightedHistoryOrderId(resData.id ?? null);
        setReceiptImageUrl(null);
        setEditingOrder(null);
        setEditCart({});
        setCurrentView("success");
      } else {
        alert(result.error);
      }
    });
  };

  const handleReorder = (order: CustomerOrderRow) => {
    const nextItems = (order.order_items ?? [])
      .map((item) => ({
        productId: item.products?.id ?? "",
        productSaleUnitId: item.product_sale_unit_id ?? "",
        quantity: Number(item.quantity) || 0,
      }))
      .filter(
        (item: { productId: string; productSaleUnitId: string; quantity: number }) =>
          item.productId && item.productSaleUnitId && item.quantity > 0,
      );

    if (nextItems.length === 0) {
      alert("ไม่พบรายการสินค้าที่สามารถสั่งซ้ำได้");
      return;
    }

    setCart((prev) => {
      const draft = { ...prev };
      for (const item of nextItems) {
        draft[item.productId] = (draft[item.productId] || 0) + item.quantity;
      }
      return draft;
    });

    setPendingSelection({});
    setPendingInput({});
    setPendingInputError({});
    setCurrentView("cart");
  };

  const handleSaveEditedOrder = () => {
    if (!linkedCustomer || !editingOrder) return;

    const items = Object.entries(editCart)
      .map(([catalogProductId, quantity]) => {
        const product = productsById.get(catalogProductId);
        if (!product) return null;

        return {
          productId: product.product_id,
          productSaleUnitId: product.product_sale_unit_id,
          quantity,
        };
      })
      .filter(
        (item): item is { productId: string; productSaleUnitId: string; quantity: number } =>
          item !== null && item.quantity > 0,
      );

    if (items.length === 0) {
      alert("กรุณาเหลือสินค้าอย่างน้อย 1 รายการ");
      return;
    }

    startTransition(async () => {
      const result = await updateCustomerOrder(
        organizationId,
        linkedCustomer.id,
        editingOrder.id ?? "",
        items,
      );

      if (!result.success) {
        alert(result.error);
        return;
      }

      const resData = result.data as CustomerOrderRow;
      setOrderHistory((prev) =>
        prev.map((orderRow) =>
          orderRow.id === resData.id ? resData : orderRow,
        ),
      );
      setEditingOrder(resData);
      setEditCart(buildCartFromOrder(resData));
      setHighlightedHistoryOrderId(resData.id ?? null);
      setReceiptOrder(null);
      alert("บันทึกการแก้ไขคำสั่งซื้อแล้ว");
      setCurrentView("history");
    });
  };

  const handleLogout = () => {
    logout();
    window.location.reload();
  };

  // Render

  // 1. LIFF initialising
  if (currentView === "loading" || (!isReady)) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-gray-500 min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-blue-500" />
        <p>กำลังเตรียมระบบ...</p>
      </div>
    );
  }

  // 2. Not logged in
  if (currentView === "login") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white px-6">
        <div className="-translate-y-8">
        <div className="flex w-full max-w-md flex-col items-center justify-center text-center">
        <Image
          src="/ty-noodles-logo-cropped.png"
          alt="T&Y Noodles logo"
          width={384}
          height={384}
          priority
          className="animate-gentle-drop-in mb-2 w-84 max-w-full object-contain sm:w-96"
        />
        <div className="animate-gentle-drop-in-delay-1">
        <h1 className="text-2xl font text-slate-900 mb-2">เส้นรังนก T&amp;Y Noodle</h1>
        <p className="text-slate-500 mb-10 text-sm leading-relaxed">
          กรุณากดเข้าสู่ระบบด้วย LINE เพื่อสั่งสินค้า
        </p>
        </div>
        <button
          onClick={login}
          className="animate-gentle-drop-in-delay-2 flex w-full max-w-xs items-center justify-center gap-3 rounded-2xl bg-[#06C755] py-4 text-lg font-bold text-white shadow-lg shadow-green-200 transition-all hover:bg-[#05b34d] active:scale-[0.98]"
        >
          <svg className="w-7 h-7" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.627.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.070 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
          </svg>
          เข้าสู่ระบบด้วย LINE
          <Store className="h-5 w-5" strokeWidth={2.2} />
        </button>
        </div>
        </div>
      </div>
    );
  }

  // ─── 3. Self-registration / choice screen ─────────────────────────────────
  if (currentView === "register") {
    const selectClass =
      "w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3.5 pr-10 text-base text-slate-800 outline-none transition focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10 disabled:bg-slate-50 disabled:text-slate-400";
    const inputClass =
      "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10";

    return (
      <div className="min-h-screen bg-[linear-gradient(160deg,#eef4fa_0%,#f8fafc_60%,#fff_100%)]">
        {/* Header */}
        <header className="border-b border-slate-100 bg-white/95 px-5 py-6 text-center backdrop-blur-sm">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0f2f56] shadow-md">
            <Store className="h-7 w-7 text-white" strokeWidth={1.8} />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight text-[#003366]">ยินดีต้อนรับ</h1>
          <p className="mt-1 text-sm text-slate-500">คุณเคยเป็นลูกค้า T&Y Noodle มาก่อนหรือเปล่า?</p>
        </header>

        <main className="mx-auto w-full max-w-md px-4 py-6">

          {/* Choice buttons */}
          <div className="flex flex-col gap-3 mb-4">
            {/* ลูกค้าเก่า */}
            <button
              type="button"
              onClick={() => setRegFormOpen(true)}
              className={`flex w-full items-center gap-4 rounded-2xl border-2 px-5 py-4 transition active:scale-[0.98] ${
                regFormOpen
                  ? "border-[#003366] bg-[#003366] text-white shadow-lg"
                  : "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-[#003366]/40"
              }`}
            >
              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${regFormOpen ? "bg-white/15" : "bg-slate-100"}`}>
                <Store className={`h-5 w-5 ${regFormOpen ? "text-white" : "text-[#003366]"}`} strokeWidth={1.8} />
              </div>
              <div className="text-left">
                <div className="text-base font-extrabold">ลูกค้าเก่า</div>
                <div className={`text-xs font-normal ${regFormOpen ? "text-blue-200" : "text-slate-400"}`}>เคยสั่งกับ T&Y Noodle มาก่อน</div>
              </div>
              <ChevronDown className={`ml-auto h-4 w-4 shrink-0 transition-transform duration-300 ${regFormOpen ? "rotate-180 text-white/70" : "text-slate-300"}`} strokeWidth={2.5} />
            </button>

            {/* ลูกค้าใหม่ */}
            <button
              type="button"
              onClick={() => setCurrentView("new_inquiry")}
              className="flex w-full items-center gap-4 rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 text-slate-700 shadow-sm transition hover:border-amber-300 active:scale-[0.98]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-50">
                <UserPlus className="h-5 w-5 text-amber-500" strokeWidth={1.8} />
              </div>
              <div className="text-left">
                <div className="text-base font-extrabold">ลูกค้าใหม่</div>
                <div className="text-xs font-normal text-slate-400">ยังไม่เคยสั่งสินค้า</div>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-300" strokeWidth={2.5} />
            </button>
          </div>

          {/* Registration form — smooth slide down via CSS grid trick */}
          <div
            className="grid transition-[grid-template-rows] duration-400 ease-in-out"
            style={{ gridTemplateRows: regFormOpen ? "1fr" : "0fr" }}
          >
            <div className="overflow-hidden">
              <div className="rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-[0_8px_30px_rgba(15,47,86,0.08)]">
                <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-slate-400">กรอกข้อมูลร้านค้า</p>

                {/* ชื่อร้านค้า */}
                <div className="mb-5">
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    ชื่อร้านค้า <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Store className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                    <input
                      type="text"
                      placeholder="ชื่อร้านของคุณ"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                </div>

                {/* เบอร์โทรศัพท์ */}
                <div className="mb-5">
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    เบอร์โทรศัพท์ <span className="text-slate-400 font-normal text-xs">(ถ้ามี)</span>
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                    <input
                      type="tel"
                      placeholder="0xx-xxx-xxxx"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      className={`${inputClass} pl-10`}
                    />
                  </div>
                </div>

                {/* ที่อยู่ */}
                <div className="mb-5">
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    ที่อยู่ <span className="text-slate-400 font-normal text-xs">(บ้านเลขที่ / ถนน / ซอย)</span>
                  </label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3.5 top-4 h-4 w-4 text-slate-400" strokeWidth={2} />
                    <textarea
                      placeholder="บ้านเลขที่ ถนน ซอย"
                      rows={2}
                      value={regAddress}
                      onChange={(e) => setRegAddress(e.target.value)}
                      className={`${inputClass} resize-none pl-10`}
                    />
                  </div>
                </div>

                {/* จังหวัด */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    จังหวัด <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={regProvinceCode ?? ""}
                      disabled={isLoadingGeo && provinces.length === 0}
                      onChange={(e) => {
                        const code = Number(e.target.value);
                        const opt = provinces.find((p) => p.code === code);
                        setRegProvinceCode(code || null);
                        setRegProvinceName(opt?.label ?? "");
                        setRegDistrictCode(null); setRegDistrictName("");
                        setRegSubdistrictCode(null); setRegSubdistrictName("");
                        setRegPostalCode("");
                      }}
                      className={selectClass}
                    >
                      <option value="">— เลือกจังหวัด —</option>
                      {provinces.map((p) => (
                        <option key={p.code} value={p.code}>{p.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                  </div>
                </div>

                {/* อำเภอ */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    อำเภอ / เขต <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={regDistrictCode ?? ""}
                      disabled={!regProvinceCode || (isLoadingGeo && districts.length === 0)}
                      onChange={(e) => {
                        const code = Number(e.target.value);
                        const opt = districts.find((d) => d.code === code);
                        setRegDistrictCode(code || null);
                        setRegDistrictName(opt?.label ?? "");
                        setRegSubdistrictCode(null); setRegSubdistrictName("");
                        setRegPostalCode("");
                      }}
                      className={selectClass}
                    >
                      <option value="">— เลือกอำเภอ/เขต —</option>
                      {districts.map((d) => (
                        <option key={d.code} value={d.code}>{d.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                  </div>
                </div>

                {/* ตำบล */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-sm font-bold text-slate-700">
                    ตำบล / แขวง <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <select
                      value={regSubdistrictCode ?? ""}
                      disabled={!regDistrictCode || (isLoadingGeo && subdistricts.length === 0)}
                      onChange={(e) => {
                        const code = Number(e.target.value);
                        const opt = subdistricts.find((s) => s.code === code);
                        setRegSubdistrictCode(code || null);
                        setRegSubdistrictName(opt?.label ?? "");
                        setRegPostalCode(opt?.postalCode ? String(opt.postalCode) : "");
                      }}
                      className={selectClass}
                    >
                      <option value="">— เลือกตำบล/แขวง —</option>
                      {subdistricts.map((s) => (
                        <option key={s.code} value={s.code}>{s.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" strokeWidth={2} />
                  </div>
                </div>

                {/* รหัสไปรษณีย์ — auto */}
                {regPostalCode && (
                  <div className="mb-5">
                    <label className="mb-1.5 block text-sm font-bold text-slate-700">รหัสไปรษณีย์</label>
                    <div className="flex items-center gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3.5">
                      <MapPin className="h-4 w-4 shrink-0 text-emerald-500" strokeWidth={2} />
                      <span className="text-base font-bold text-slate-700">{regPostalCode}</span>
                      <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">อัตโนมัติ</span>
                    </div>
                  </div>
                )}

                {/* Error */}
                {regError && (
                  <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
                    {regError}
                  </p>
                )}

                {/* Submit */}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleRegister}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0f2f56] px-6 py-4 text-base font-bold text-white shadow-md transition active:scale-[0.97] disabled:opacity-60"
                >
                  {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <BadgeCheck className="h-5 w-5" strokeWidth={2} />}
                  {isPending ? "กำลังบันทึก..." : "ยืนยันข้อมูลร้านค้า"}
                </button>
              </div>
            </div>
          </div>

        </main>
      </div>
    );
  }

  // ─── 4. New customer inquiry ────────────────────────────────────────────────
  if (currentView === "new_inquiry") {
    const inputClass =
      "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#003366] focus:ring-2 focus:ring-[#003366]/10";

    return (
      <div className="min-h-screen bg-[linear-gradient(160deg,#fffbeb_0%,#f8fafc_60%,#fff_100%)]">
        <header className="border-b border-slate-100 bg-white/95 px-5 py-5 backdrop-blur-sm">
          <button
            type="button"
            onClick={() => { setRegFormOpen(false); setCurrentView("register"); }}
            className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-slate-500"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
            กลับ
          </button>
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400 shadow-md">
              <UserPlus className="h-7 w-7 text-white" strokeWidth={1.8} />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-800">สมัครเป็นลูกค้าใหม่</h1>
            <p className="mt-1 text-sm text-slate-500">ฝากชื่อและเบอร์ไว้ เราจะติดต่อกลับโดยด่วน</p>
          </div>
        </header>

        <main className="mx-auto w-full max-w-md px-4 py-6">
          <div className="rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-[0_8px_30px_rgba(15,47,86,0.06)]">
            <div className="mb-5">
              <label className="mb-1.5 block text-sm font-bold text-slate-700">
                ชื่อ - นามสกุล <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="ชื่อของคุณ"
                value={inquiryName}
                onChange={(e) => setInquiryName(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="mb-6">
              <label className="mb-1.5 block text-sm font-bold text-slate-700">
                เบอร์โทรศัพท์ <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                placeholder="0xx-xxx-xxxx"
                value={inquiryPhone}
                onChange={(e) => setInquiryPhone(e.target.value)}
                className={inputClass}
              />
            </div>

            <button
              type="button"
              disabled={isPending || !inquiryName.trim() || !inquiryPhone.trim()}
              onClick={handleNewInquiry}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 py-4 text-base font-bold text-white shadow-md transition active:scale-[0.97] disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" strokeWidth={2} />}
              {isPending ? "กำลังส่งข้อมูล..." : "ส่งข้อมูลให้ทีมงาน"}
            </button>
          </div>

          {/* Shop contact */}
          {orgPhone && (
            <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-amber-700">ติดต่อเราได้โดยตรง</p>
              <div className="flex items-center gap-2">
                <Phone className="h-4.5 w-4.5 shrink-0 text-amber-600" strokeWidth={2} />
                <span className="text-lg font-extrabold tracking-wide text-amber-900">{orgPhone}</span>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ─── 5. Inquiry submitted ───────────────────────────────────────────────────
  if (currentView === "inquiry_done") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(160deg,#fffbeb_0%,#fff_100%)] px-5 text-center">
        <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-400 shadow-lg">
          <BadgeCheck className="h-10 w-10 text-white" strokeWidth={1.8} />
        </div>
        <h1 className="mb-2 text-2xl font-extrabold text-slate-800">ส่งข้อมูลเรียบร้อย!</h1>
        <p className="mb-1 text-base text-slate-600">ทีมงาน T&Y Noodle ได้รับข้อมูลของคุณแล้ว</p>
        <p className="text-sm text-slate-500">เราจะติดต่อกลับหาคุณโดยด่วน</p>
        {orgPhone && (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-700">หรือโทรหาเรา</p>
            <p className="mt-1 text-xl font-extrabold text-amber-900">{orgPhone}</p>
          </div>
        )}
      </div>
    );
  }

  // Catalog + Cart + Success

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC] text-slate-900 font-sans pb-32 overflow-x-clip">
      <style>{`
        @keyframes slideInRight {
          0% { opacity: 0.5; transform: translateX(100vw); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.35s cubic-bezier(0.25, 1, 0.5, 1) forwards;
        }
      `}</style>

      <div key={currentView} className="flex-1 flex flex-col animate-slide-in-right overflow-x-clip">
        {/* Header */}
      {currentView === "catalog" ? (
        <header className="relative bg-white shadow-sm">
          {/* ── Blurred profile banner (LINE / Spotify style) ── */}
          <div className="relative">

            {/* Banner — clipped container */}
            <div className="relative h-52 overflow-hidden md:h-60">

              {/* Layer 1: blurred brand logo — same for every user */}
              <Image
                src="/brand/original.jpg"
                alt=""
                fill
                sizes="100vw"
                className="object-cover object-center"
                style={{  }}
                aria-hidden
                priority
              />
              {/* fallback color in case logo hasn't loaded */}
              <div className="absolute inset-0 -z-10 bg-[#003366]" />

              {/* Layer 2: dark vignette overlay */}
              <div className="absolute inset-0 bg-black/45" />

              {/* Layer 3: cart button — safe-area aware */}
              <div className="absolute right-4 top-[max(0.75rem,env(safe-area-inset-top))] z-10">
                <button
                  aria-label="Shopping Cart"
                  ref={cartButtonRef}
                  className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white shadow-md backdrop-blur-sm transition active:scale-95"
                  onClick={() => setCurrentView("cart")}
                >
                  <ShoppingCart className="h-5 w-5" />
                  {totalItems > 0 && (
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow">
                      {totalItems}
                    </span>
                  )}
                </button>
              </div>

              {/* Layer 3: store name at bottom-center */}
              <p className="absolute bottom-3 left-0 right-0 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">
                เส้นรังนก T&amp;Y Noodle
              </p>
            </div>

            {/* Avatar — straddles banner/white boundary (translate-y-1/2 = half overflows down) */}
            <div className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-1/2">
              <div className="relative h-[88px] w-[88px] overflow-hidden rounded-full shadow-xl ring-4 ring-white md:h-[96px] md:w-[96px]">
                {profile?.pictureUrl ? (
                  <Image
                    src={profile.pictureUrl}
                    alt={profile.displayName ?? "โปรไฟล์"}
                    fill
                    sizes="96px"
                    className="object-cover"
                    priority
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#003d7a] to-[#003366]">
                    <svg viewBox="0 0 24 24" className="h-12 w-12 text-white/80" fill="currentColor">
                      <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                    </svg>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── White section: names only ── */}
          {/* pt-14 = 56px ≈ half of 88px avatar + a little breathing room */}
          <div className="bg-white px-4 pb-5 pt-14 md:pt-16">
            <div className="text-center">
              {linkedCustomer && (
                <p className="text-[1.15rem] font-extrabold leading-snug tracking-tight text-slate-900 md:text-xl">
                  {linkedCustomer.name}
                </p>
              )}
              {profile?.displayName && (
                <p className="mt-1 text-sm text-slate-400">{profile.displayName}</p>
              )}
            </div>
          </div>
        </header>
      ) : currentView === "cart" ? (
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 bg-white/80 px-4 py-3 backdrop-blur-md">
          <button
            aria-label="Go back"
            className="p-2 -ml-2 text-slate-600 flex items-center justify-center transition-transform active:scale-90"
            onClick={() => setCurrentView("catalog")}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold tracking-tight">รายการที่เลือก</h1>
          <div className="w-10" />
        </header>
      ) : (
        /* success header */
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <button
            aria-label="Close"
            className="p-2 -ml-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            onClick={() => {
              if (currentView === "edit_order") {
                openOrderHistory(editingOrder?.id ?? null);
                return;
              }
              setCurrentView("catalog");
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <Image
              src="/brand/logo.png"
              alt="Logo"
              width={48}
              height={48}
              priority
              className="w-12 h-12 object-contain rounded-lg"
            />
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">T&Y Noodle</h1>
          </div>
          <div className="w-10" />
        </header>
      )}

      {/* ── Sticky search + category pills + tabs (catalog only) ── */}
      {currentView === "catalog" && (
        <div className="sticky top-0 z-30 bg-white shadow-sm">
          {/* Order status banner */}
          <OrderStatusBanner isOpen={isOrderOpen} />
          {/* Search bar */}
          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5">
                <Search className="h-[18px] w-[18px] text-slate-400" />
              </span>
              <input
                aria-label="Search products"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition-all focus:border-[#003366] focus:bg-white focus:ring-2 focus:ring-[#003366]/10 md:text-base"
                placeholder="ค้นหาสินค้า..."
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Category pills */}
          {categoryOptions.length > 0 && (
            <div
              className="flex gap-2 overflow-x-auto px-4 pb-2"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" } as React.CSSProperties}
            >
              <button
                onClick={() => setSelectedProductCategory("all")}
                className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-all ${
                  selectedProductCategory === "all"
                    ? "bg-[#003366] text-white shadow-md"
                    : "border border-slate-200 bg-white text-slate-500 active:bg-slate-50"
                }`}
              >
                ทั้งหมด
              </button>
              {categoryOptions.map(({ id, name }) => (
                <button
                  key={id}
                  onClick={() => setSelectedProductCategory(id)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-all ${
                    selectedProductCategory === id
                      ? "bg-[#003366] text-white shadow-md"
                      : "border border-slate-200 bg-white text-slate-500 active:bg-slate-50"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          {/* Tabs: สินค้า / รายการโปรด / ล่าสุด */}
          <div className="border-t border-slate-100">
            <div className="relative flex w-full">
              <button
                onClick={() => setActiveCategory("all")}
                className={`relative flex-1 pb-3 pt-2.5 text-center text-[13px] font-bold transition-colors flex items-center justify-center gap-1.5 ${
                  activeCategory === "all" ? "text-[#003366] drop-shadow-sm" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <Package className="h-4 w-4" />
                สินค้า
              </button>
              <button
                onClick={() => setActiveCategory("favorites")}
                className={`relative flex-1 pb-3 pt-2.5 text-center text-[13px] font-bold transition-colors flex items-center justify-center gap-1.5 ${
                  activeCategory === "favorites" ? "text-[#003366] drop-shadow-sm" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <Star className="h-4 w-4" />
                รายการโปรด
              </button>
              <button
                onClick={() => setActiveCategory("recent")}
                className={`relative flex-1 pb-3 pt-2.5 text-center text-[13px] font-bold transition-colors flex items-center justify-center gap-1.5 ${
                  activeCategory === "recent" ? "text-[#003366] drop-shadow-sm" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <History className="h-4 w-4" />
                ล่าสุด
              </button>

              {/* Sliding underline indicator */}
              <div
                className="absolute bottom-[-1px] left-3 h-[4px] w-[calc((100%-1.5rem)/3)] transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
                style={{
                  transform: `translateX(${
                    activeCategory === "all" ? "0%" : activeCategory === "favorites" ? "100%" : "200%"
                  })`,
                }}
              >
                <div
                  className="mx-auto h-full w-[80%] bg-[#003366] shadow-[0_-1px_15px_rgba(0,51,102,0.6),0_0_25px_rgba(0,51,102,0.35)]"
                  style={{ clipPath: "polygon(4% 0, 96% 0, 100% 100%, 0 100%)" }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className={
        currentView === "catalog"
          ? "mx-auto flex-1 w-full max-w-[1600px] px-3 pt-2 pb-6 sm:px-5 md:px-6 lg:px-8 xl:px-10"
          : currentView === "success"
            ? "mx-auto w-full max-w-xl px-4 pb-32 sm:px-6 flex-1"
            : "max-w-md mx-auto w-full pb-48 flex-1"
      }>
        {currentView === "catalog" ? (
          filteredProducts.length === 0 ? (
            <div className="text-center text-slate-500 py-10">ไม่พบสินค้าที่คุณค้นหา</div>
          ) : (
            <div>
              {frequentProductCards.length > 0 ? (
                <section className="-mx-3 space-y-2 px-3 py-0.5 md:mx-0 md:px-0">
                  <div className="px-1 md:px-0">
                    <h2 className="text-base font-bold text-slate-900">{"\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32\u0e17\u0e35\u0e48\u0e2a\u0e31\u0e48\u0e07\u0e0b\u0e37\u0e49\u0e2d\u0e1a\u0e48\u0e2d\u0e22"}</h2>
                  </div>
                  <div className="overflow-x-auto pb-1 snap-x snap-mandatory [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden">
                    <div className="flex gap-0">
                      {frequentProductCards.map(({ product }) => {
                        const imageUrl =
                          product.product_images?.[0]?.public_url ||
                          "/placeholders/product-placeholder.svg";

                        return (
                          <article
                            key={`frequent-${product.id}`}
                            className="-mr-5 relative flex h-[5.1rem] w-[17.5rem] shrink-0 snap-start items-center pr-0 last:mr-0"
                          >
                            <div className="absolute inset-y-0 left-[2.3rem] right-8 rounded-lg bg-slate-100/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]" />
                            <div className="relative z-10 h-[5.1rem] w-[5.1rem] shrink-0 overflow-hidden rounded-lg bg-slate-100">
                              <div className="absolute left-1.5 top-1.5 z-10 inline-flex items-center gap-1 rounded-full bg-[#003366]/92 px-1.5 py-0.5 text-[8px] font-bold text-white shadow-[0_8px_16px_rgba(0,51,102,0.22)] backdrop-blur-sm">
                                <Star className="h-2.5 w-2.5 fill-current" strokeWidth={2.3} />
                                {"\u0e0b\u0e37\u0e49\u0e2d\u0e1a\u0e48\u0e2d\u0e22"}
                              </div>
                              <Image
                                src={imageUrl}
                                alt={product.name}
                                fill
                                sizes="82px"
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="relative z-10 ml-[-0.1rem] min-w-0 flex-1 self-stretch px-3 pt-2 pb-1.5">
                              <div className="flex h-full min-w-0 flex-col justify-between gap-2 pr-10">
                                <div className="min-w-0">
                                  <p className="truncate pt-0.5 text-[0.82rem] font-semibold leading-[1.25rem] text-slate-900">
                                    {product.name}
                                  </p>
                                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                                    {"\u0e2b\u0e19\u0e48\u0e27\u0e22"} {getDisplayUnit(product.sale_unit_label)}
                                  </p>
                                </div>
                              </div>
                              <button
                                onClick={(event) =>
                                  addProductToCart(
                                    product.id,
                                    product.min_order_qty ?? 1,
                                    event.currentTarget.closest("article")?.querySelector("img"),
                                  )
                                }
                                aria-label={`${"\u0e40\u0e1e\u0e34\u0e48\u0e21"} ${product.name} ${"\u0e43\u0e2a\u0e48\u0e15\u0e30\u0e01\u0e23\u0e49\u0e32"}`}
                                className="absolute bottom-2 right-11 flex h-8 w-8 items-center justify-center rounded-lg bg-[#003366] text-white shadow-[0_8px_18px_rgba(0,51,102,0.22)] transition-all hover:bg-[#0a437d] active:scale-[0.95]"
                              >
                                <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </section>
              ) : null}

              <CatalogProductGrid
                products={gridProducts}
                cart={cart}
                favorites={favorites}
                onOpenProduct={openProductModal}
                onToggleFavorite={toggleFavorite}
              />

            </div>
          )
        ) : currentView === "success" ? (
          <>
            <section className="flex flex-col items-center text-center mt-8 mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <div className="w-11 h-11 bg-green-500 rounded-full flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
              <h2 className="mb-1 whitespace-nowrap text-[17px] font-bold tracking-tight text-slate-900 sm:text-xl">เราได้รับคำสั่งซื้อของคุณเรียบร้อยแล้ว</h2>
              <p className="text-slate-500 text-sm">สามารถบันทึกใบสั่งซื้อไว้อ้างอิงได้</p>
            </section>

            {lastOrderMeta && (
              <>
                <button
                  onClick={saveReceiptAsImage}
                  disabled={isSavingImage}
                  className="mb-4 w-full rounded-2xl border border-[#003366] bg-[#003366] px-4 py-3.5 text-left text-white shadow-[0_12px_24px_rgba(0,51,102,0.2)] transition-all hover:bg-[#0a437d] hover:border-[#0a437d] active:scale-[0.98] disabled:opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 shadow-sm">
                      {isSavingImage ? (
                        <Loader2 className="h-5 w-5 animate-spin text-white" />
                      ) : (
                        <Download className="h-5 w-5 text-white" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold">
                        {isSavingImage ? "กำลังบันทึกรูป..." : "บันทึกรูป"}
                      </div>
                      <div className="mt-0.5 text-xs font-medium text-white/80">
                        เก็บใบสั่งซื้อไว้ในเครื่องของคุณ
                      </div>
                    </div>
                  </div>
                </button>

                <div className="mb-4 flex w-full justify-center">
                  <OrderReceiptCard
                    receiptRef={receiptCardRef}
                    orderNumber={lastOrderMeta.orderNumber}
                    orderDate={lastOrderMeta.capturedAt}
                    storeName={linkedCustomer?.name ?? ""}
                    items={lastOrderMeta.receiptItems}
                    totalAmount={lastOrderMeta.totalAmount}
                  />
                </div>

                <button
                  onClick={() => openOrderHistory(highlightedHistoryOrderId)}
                  className="mb-3 w-full rounded-2xl border border-[#003366]/15 bg-white px-4 py-3.5 text-left text-[#003366] shadow-sm transition-all hover:border-[#003366]/25 hover:bg-[#f8fbff] active:scale-[0.98]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-extrabold">ดูและแก้ไขคำสั่งซื้อ</div>
                      <div className="mt-0.5 text-xs font-medium text-slate-500">
                        หากต้องการปรับจำนวนสินค้า ให้เข้าไปที่ประวัติการสั่งซื้อ
                      </div>
                    </div>
                    <History className="h-5 w-5 shrink-0" />
                  </div>
                </button>

              </>
            )}

            <button
              onClick={() => setCurrentView("catalog")}
              className="w-full mb-8 border border-[#003366]/15 bg-[#eef4fa] text-[#003366] py-4 px-6 rounded-2xl flex items-center justify-center gap-2 font-semibold text-base transition-all hover:bg-[#e4eef8] active:scale-[0.98]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              กลับไปหน้าหลัก
            </button>
          </>
        ) : currentView === "history" ? (
          /* Order History View */
          <section className="p-4 space-y-4">
            <h2 className="text-xl font-bold text-slate-900 px-2 mt-2">ประวัติการสั่งซื้อ</h2>
            {isPending && orderHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <Loader2 className="w-8 h-8 animate-spin mb-3" />
                <p>กำลังโหลดประวัติ...</p>
              </div>
            ) : orderHistory.length === 0 ? (
              <div className="text-center text-slate-500 py-10 bg-white rounded-[2.5rem] border border-slate-50 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-slate-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                <p className="font-medium">ยังไม่มีประวัติการสั่งซื้อ</p>
              </div>
            ) : (
              orderHistory.map((order) => {
                const editMeta = getBangkokOrderEditMeta(order.order_date ?? "");
                const isHighlighted = highlightedHistoryOrderId === order.id;

                return (
                  <article
                    key={order.id}
                    className={`-mx-4 rounded-none border p-5 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] ${
                      isHighlighted ? "border-[#003366]/25 bg-[#f8fbff]" : "border-slate-50 bg-white"
                    }`}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                          เลขออเดอร์
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-900">
                          {order.order_number || "-"}
                        </p>
                        <p className="mt-1 text-xs font-medium text-[#003366]/70">
                          รายการทั้งหมด {(order.order_items ?? []).length} รายการ
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          onClick={() => {
                            setReceiptOrder(order);
                            setReceiptImageUrl(null);
                          }}
                          className="inline-flex items-center rounded-full bg-green-50 px-3 py-2 text-xs font-bold text-green-700 transition-all hover:bg-green-100 active:scale-[0.98]"
                        >
                          ดูใบสั่ง
                        </button>
                        <button
                          onClick={() => handleReorder(order)}
                          className="inline-flex items-center rounded-full bg-[#eef4fa] px-3 py-2 text-xs font-bold text-[#003366] transition-all hover:bg-[#e4eef8] active:scale-[0.98]"
                        >
                          สั่งอีกครั้ง
                        </button>
                      </div>
                    </div>

                    <div className="mb-4">
                      {editMeta.isEditable ? (
                        <button
                          onClick={() => openEditOrder(order)}
                          className="w-full rounded-2xl border border-[#003366]/15 bg-[#eef4fa] px-4 py-3 text-sm font-bold text-[#003366] transition-all hover:bg-[#e4eef8] active:scale-[0.98]"
                        >
                          แก้ไขคำสั่งซื้อนี้
                        </button>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
                          หมดเวลาแก้ไขแล้ว
                        </div>
                      )}
                    </div>

                    <div className="divide-y divide-slate-300">
                      {(order.order_items ?? []).map((item, index) => {
                        const fallbackProduct = productsByLookupKey.get(
                          `${item.products?.id ?? ""}::${item.product_sale_unit_id ?? ""}`,
                        );
                        const imageUrl =
                          fallbackProduct?.product_images?.[0]?.public_url ??
                          "/placeholders/product-placeholder.svg";
                        const itemName = item.products?.name ?? fallbackProduct?.name ?? "-";
                        const itemUnit = item.sale_unit_label ?? fallbackProduct?.sale_unit_label ?? "";

                        return (
                          <div
                            key={item.id ?? `${order.id ?? "order"}-${index}`}
                            className="flex items-center gap-3 px-3 py-3"
                          >
                            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                              <Image
                                src={imageUrl}
                                alt={itemName}
                                fill
                                sizes="64px"
                                className="h-full w-full object-cover"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{itemName}</p>
                              <p className="mt-1 text-sm text-slate-500">{itemUnit}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })
            )}
          </section>
        ) : currentView === "edit_order" ? (
          <section className="p-4 space-y-4">
            <div className="rounded-[2rem] border border-[#003366]/10 bg-[linear-gradient(180deg,#ffffff_0%,#f7fbff_100%)] p-5 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#003366]/60">
                แก้ไขคำสั่งซื้อ
              </div>
              <h2 className="mt-2 text-xl font-bold text-slate-900">
                {editingOrder?.order_number ?? "-"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                ปรับจำนวนหรือลบรายการได้ก่อนเวลา 17:00 น. แล้วกดบันทึกการแก้ไข
              </p>
            </div>

            {Object.entries(editCart).length === 0 ? (
              <div className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
                ไม่มีรายการสินค้าในคำสั่งซื้อนี้
              </div>
            ) : (
              Object.entries(editCart).map(([productId, quantity]) => {
                const product = productsById.get(productId);
                if (!product) return null;
                const imageUrl = product.product_images?.[0]?.public_url || "/placeholders/product-placeholder.svg";
                const minQty = product.min_order_qty ?? 1;
                const stepQty = product.step_order_qty ?? 1;

                return (
                  <article key={product.id} className="bg-white rounded-[2rem] p-4 flex gap-4 border border-slate-50 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
                    <div className="relative w-24 h-24 bg-slate-100 rounded-3xl overflow-hidden flex-shrink-0">
                      <Image
                        src={imageUrl}
                        alt={product.name}
                        fill
                        sizes="96px"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0">
                          <h2 className="font-bold text-slate-900 leading-tight line-clamp-2">{product.name}</h2>
                          <p className="text-xs text-slate-400 mt-1 font-medium">
                            หน่วย {getDisplayUnit(product.sale_unit_label)}
                          </p>
                        </div>
                        <button
                          onClick={() => updateEditQuantity(product.id, 0)}
                          className="text-sm font-bold text-red-500"
                        >
                          ลบ
                        </button>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <div className="flex items-center bg-[#F1F5F9] rounded-2xl p-1">
                          <button
                            onClick={() => {
                              const nextQty = quantity - stepQty;
                              if (nextQty < minQty) {
                                updateEditQuantity(product.id, 0);
                                return;
                              }
                              updateEditQuantity(product.id, nextQty);
                            }}
                            className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white rounded-xl transition-all active:scale-90"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="px-3 text-sm font-bold min-w-12 text-center text-slate-800">{quantity}</span>
                          <button
                            onClick={() => updateEditQuantity(product.id, quantity === 0 ? minQty : quantity + stepQty)}
                            className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white rounded-xl transition-all active:scale-90"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}

            <div className="grid grid-cols-1 gap-3 pb-6">
              <button
                onClick={handleSaveEditedOrder}
                disabled={isPending}
                className="w-full rounded-2xl bg-[#003366] px-6 py-4 text-base font-bold text-white shadow-[0_12px_24px_rgba(0,51,102,0.2)] transition-all active:scale-[0.98] disabled:opacity-60"
              >
                {isPending ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
              </button>
              <button
                onClick={() => openOrderHistory(editingOrder?.id ?? null)}
                className="w-full rounded-2xl border border-[#003366]/15 bg-[#eef4fa] px-6 py-4 text-base font-semibold text-[#003366] transition-all active:scale-[0.98]"
              >
                กลับไปประวัติการสั่งซื้อ
              </button>
            </div>
          </section>
        ) : currentView === "profile" ? (
          /* Profile View */
          <section className="p-6">
            <div className="bg-white rounded-[2.5rem] p-8 border border-slate-50 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] flex flex-col items-center">
              <div className="relative w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-xl mb-4">
                <Image
                  src={profile?.pictureUrl || "/placeholders/profile-placeholder.svg"}
                  alt="Profile"
                  fill
                  sizes="96px"
                  className="w-full h-full object-cover"
                />
              </div>
              <h2 className="text-xl font-bold text-slate-900">{profile?.displayName || "ลูกค้า"}</h2>

              <div className="w-full h-px bg-slate-100 my-6" />

              <div className="w-full space-y-4">
                <div className="flex items-center gap-3 text-slate-600">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eef4fa]">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-[#003366]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">ร้านค้าที่ผูกไว้</p>
                    <p className="font-bold text-slate-800">{linkedCustomer?.name || "-"}</p>
                    <p className="text-xs text-slate-500">{linkedCustomer?.customer_code}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="mt-10 w-full py-4 rounded-2xl border border-red-100 text-red-500 font-bold text-sm bg-red-50/30 hover:bg-red-50 transition-colors"
              >
                ออกจากระบบ
              </button>
            </div>

            <div className="mt-8 p-4 text-center">
              <p className="text-xs text-slate-300">LINE ID: {profile?.userId}</p>
            </div>
          </section>
        ) : (
          /* Cart View fallback */
          <section className="p-4 space-y-4">
            {Object.entries(cart).length === 0 ? (
              <div className="text-center text-slate-500 py-10 bg-white rounded-[2.5rem] border border-slate-50 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
                <ShoppingCart className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                <p className="font-medium">ตะกร้าสินค้าว่างเปล่า</p>
                <button
                  onClick={() => setCurrentView("catalog")}
                  className="mt-4 rounded-full bg-[#eef4fa] px-6 py-2 text-sm font-bold text-[#003366]"
                >
                  กลับไปเลือกสินค้า
                </button>
              </div>
            ) : (
              Object.entries(cart).map(([productId, quantity]) => {
                const product = productsById.get(productId);
                if (!product) return null;
                const imageUrl = product.product_images?.[0]?.public_url || "/placeholders/product-placeholder.svg";

                return (
                  <article key={product.id} className="bg-white rounded-[2.5rem] p-4 flex gap-4 border border-slate-50 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)]">
                    <div className="relative w-24 h-24 bg-slate-100 rounded-3xl overflow-hidden flex-shrink-0">
                      <Image
                        src={imageUrl}
                        alt={product.name}
                        fill
                        sizes="96px"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 flex flex-col justify-between py-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <h2 className="font-bold text-slate-900 leading-tight line-clamp-2 pr-2">{product.name}</h2>
                          <p className="text-xs text-slate-400 mt-1 font-medium">{product.sku}</p>
                        </div>
                        <button
                          onClick={() => updateQuantity(product.id, "remove")}
                          aria-label="Remove item"
                          className="text-slate-300 hover:text-red-500 transition-colors"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                      <div className="flex justify-end">
                        <div className="flex items-center bg-[#F1F5F9] rounded-2xl p-1">
                          <button onClick={() => updateQuantity(product.id, "decrease")} className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white rounded-xl transition-all active:scale-90">
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="px-3 text-sm font-bold w-10 text-center text-slate-800">{quantity}</span>
                          <button onClick={() => updateQuantity(product.id, "increase")} className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white rounded-xl transition-all active:scale-90">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        )}

      </main>
      </div>

      {/* History receipt modal */}
      {receiptOrder && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setReceiptOrder(null);
              setReceiptImageUrl(null);
            }
          }}
        >
          <div className="flex items-center justify-between bg-black/30 px-4 py-3">
            <button
              onClick={() => {
                setReceiptOrder(null);
                setReceiptImageUrl(null);
              }}
              className="p-2 text-white/80 transition-colors hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            <span className="text-base font-bold text-white">ใบสั่งซื้อ</span>
            <button
              onClick={saveReceiptAsImage}
              disabled={isSavingImage}
              className="flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-white/30 active:scale-95 disabled:opacity-60"
            >
              {isSavingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              บันทึก
            </button>
          </div>
          <div className="flex flex-1 items-start justify-center overflow-y-auto px-4 py-4 sm:px-6 md:px-8">
            <OrderReceiptCard
              receiptRef={receiptCardRef}
              orderNumber={receiptOrder.order_number ?? "-"}
              orderDate={receiptOrder.created_at ?? new Date().toISOString()}
              storeName={linkedCustomer?.name ?? ""}
              items={(receiptOrder.order_items ?? []).map((item) => ({
                name: item.products?.name ?? "-",
                saleUnitLabel: item.sale_unit_label ?? "",
                quantity: Number(item.quantity) || 0,
                unitPrice: Number(item.unit_price) || 0,
                lineTotal: Number(item.line_total) || 0,
              }))}
              totalAmount={Number(receiptOrder.total_amount) || 0}
            />
          </div>
        </div>
      )}

      {/* ─── Receipt Image Preview Modal ─── */}
      {receiptImageUrl && (
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/80 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setReceiptImageUrl(null); }}
        >
          <div className="flex items-center justify-between bg-black/30 px-4 py-3">
            <button
              onClick={() => setReceiptImageUrl(null)}
              className="p-2 text-white/80 transition-colors hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>
            <span className="text-base font-bold text-white">บันทึกรูปภาพ</span>
            <a
              href={receiptImageUrl}
              download={`TYNoodle-${receiptOrder?.order_number ?? "order"}.png`}
              className="flex items-center gap-1.5 rounded-full bg-white/20 px-4 py-2 text-sm font-bold text-white hover:bg-white/30"
            >
              <Download className="h-4 w-4" />
              ดาวน์โหลด
            </a>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-5">
            <Image
              src={receiptImageUrl}
              width={340}
              height={480}
              sizes="(max-width: 640px) 100vw, 340px"
              alt="ใบสั่งซื้อ"
              style={{ maxWidth: "340px", width: "100%", borderRadius: "16px" }}
              className="shadow-2xl"
            />
            <p className="text-center text-sm text-white/70">
              กดค้างที่รูปเพื่อบันทึกลงเครื่อง
            </p>
          </div>
        </div>
      )}

      {/* Floating Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none">
        {totalItems > 0 && currentView === "cart" && (
          <div className="pointer-events-auto border-t border-slate-100 bg-white/90 p-6 pb-4 backdrop-blur-xl">
            <div className="mx-auto max-w-md">
              <button
                onClick={handleCheckout}
              className="flex w-full items-center justify-center gap-2 rounded-[2rem] bg-[#003366] py-4 text-lg font-bold text-white shadow-[0_8px_30px_rgba(0,51,102,0.2)] transition-all active:scale-[0.98]"
              >
                ยืนยันการสั่งซื้อ
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        )}
        {/* Bottom Navigation */}
        <nav className="bg-white border-t border-slate-100 shadow-[0_-4px_20px_rgba(0,0,0,0.03)] px-2 py-3 pointer-events-auto">
          <div className="max-w-md mx-auto flex justify-between items-center">
            <button
              onClick={() => setCurrentView("catalog")}
              className={`flex flex-1 flex-col items-center gap-1.5 transition-colors ${currentView === "catalog" ? "text-[#003366]" : "text-slate-400"}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={currentView === "catalog" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-[11px] font-semibold">หน้าหลัก</span>
            </button>
            <button
              onClick={() => setCurrentView("cart")}
              className={`flex flex-1 flex-col items-center gap-1.5 transition-colors ${currentView === "cart" ? "text-[#003366]" : "text-slate-400"}`}
            >
              <div className="relative">
                <ShoppingCart className="h-6 w-6" />
                {totalItems > 0 && currentView !== "cart" && (
                  <span className="absolute -top-1 -right-1 bg-red-500 w-3 h-3 rounded-full border-2 border-white" />
                )}
              </div>
              <span className="text-[11px] font-semibold">ตะกร้า</span>
            </button>
            <button
              onClick={() => openOrderHistory(highlightedHistoryOrderId)}
              className={`flex flex-1 flex-col items-center gap-1.5 transition-colors ${currentView === "history" || currentView === "edit_order" ? "text-[#003366]" : "text-slate-400"}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={currentView === "history" || currentView === "edit_order" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-[11px] font-semibold">ประวัติ</span>
            </button>
            <button
              onClick={() => setCurrentView("profile")}
              className={`flex flex-1 flex-col items-center gap-1.5 transition-colors ${currentView === "profile" ? "text-[#003366]" : "text-slate-400"}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={currentView === "profile" ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-[11px] font-semibold">โปรไฟล์</span>
            </button>
          </div>
        </nav>
      </div>

      {isModalOpen && selectedProduct && (
        <div className="fixed inset-0 z-[100] flex min-h-0 flex-col bg-white">
          {/* Top Navigation Bar - Formal & Clean */}
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#00264d] bg-[#003366] px-4 py-3 text-white shadow-[0_10px_30px_rgba(0,51,102,0.22)]">
            <button 
              onClick={closeProductModal}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-all active:scale-90 hover:bg-white/10"
            >
              <X className="h-6 w-6" strokeWidth={2} />
            </button>
            <h2 className="max-w-[200px] truncate text-[15px] font-bold text-white">
              รายละเอียดสินค้า
            </h2>
            <div ref={shareMenuRef} className="relative flex gap-1">
              <button
                onClick={() => {
                  setShareFeedback("");
                  setIsShareMenuOpen((prev) => !prev);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 transition-all active:scale-90 hover:bg-white/10"
                aria-label="แชร์สินค้า"
              >
                <Share2 className="h-5.5 w-5.5" strokeWidth={2} />
              </button>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(selectedProduct.id);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/75 transition-all active:scale-90 hover:bg-white/10"
              >
                <Star 
                  className="h-5.5 w-5.5" 
                  fill={favorites[selectedProduct.id] ? "#f59e0b" : "none"} 
                  stroke={favorites[selectedProduct.id] ? "#f59e0b" : "currentColor"}
                  strokeWidth={2}
                />
              </button>
              <button
                ref={modalCartBtnRef}
                onClick={() => { closeProductModal(); setCurrentView("cart"); }}
                className="relative flex h-10 w-10 items-center justify-center rounded-full text-white transition-all active:scale-90 hover:bg-white/10"
              >
                <ShoppingCart className="h-5.5 w-5.5" strokeWidth={2} />
                {totalItems > 0 && (
                  <span className="absolute top-1 right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#003366] text-[9px] font-black text-white shadow-sm ring-2 ring-white">
                    {totalItems}
                  </span>
                )}
              </button>
              {isShareMenuOpen && (
                <div className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 shadow-[0_20px_40px_rgba(15,23,42,0.18)]">
                  <button
                    type="button"
                    onClick={() => void copyShareLink()}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50"
                  >
                    <Link2 className="h-4.5 w-4.5 text-[#003366]" strokeWidth={2} />
                    <span>คัดลอกลิงก์</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openShareWindow("line")}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50"
                  >
                    <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#06C755] text-[9px] font-black text-white">
                      L
                    </span>
                    <span>แชร์ไป LINE</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openShareWindow("facebook")}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50"
                  >
                    <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#1877F2] text-[9px] font-black text-white">
                      f
                    </span>
                    <span>แชร์ไป Facebook</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          {shareFeedback ? (
            <div className="border-b border-[#d9e4f0] bg-[#eef4fa] px-4 py-2 text-center text-xs font-semibold text-[#003366]">
              {shareFeedback}
            </div>
          ) : null}

          <div
            id="product-modal-carousel"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            className="relative flex-1 min-h-0 overflow-y-auto bg-slate-50 pb-6 no-scrollbar"
            style={{ touchAction: "pan-y" }}
          >
            <div
              key={selectedProduct.id}
              className="min-h-full"
              style={{ contentVisibility: "auto", containIntrinsicSize: "900px" }}
            >

              {/* ── Section 1: รูปสินค้า + ชื่อสินค้า ── */}
              <div className="bg-white px-4 pb-6 pt-4 shadow-[0_16px_38px_rgba(15,23,42,0.10)]">
                <div className="mx-auto flex max-w-[520px] flex-col gap-3">
                  {/* Image */}
                  <div className="relative overflow-hidden rounded-[1.5rem]">
                    <div className="relative aspect-square w-full">
                      <Image
                        src={selectedProductImageUrl}
                        alt={`${selectedProduct.name} - ${selectedProductImageIndex + 1}`}
                        fill
                        priority
                        sizes="(max-width: 767px) 100vw, 520px"
                        className="object-contain"
                      />
                    </div>

                    <div className="absolute right-3 top-3 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-bold text-white">
                      {selectedProductImageIndex + 1}/{Math.max(selectedProductImages.length, 1)}
                    </div>
                  </div>

                  {/* Thumbnail strip */}
                  {selectedProductImages.length > 1 && (
                    <div
                      className="flex gap-2 overflow-x-auto pb-1"
                      onTouchStart={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                      onTouchEnd={(e) => e.stopPropagation()}
                    >
                      {selectedProductImages.map((img, imageIndex) => {
                        const isActiveImage = imageIndex === selectedProductImageIndex;
                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setModalImageIndex(selectedProduct.id, imageIndex)}
                            className={`relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl border-2 bg-white transition ${
                              isActiveImage
                                ? "border-[#003366] shadow-[0_12px_24px_rgba(0,51,102,0.16)]"
                                : "border-slate-200"
                            }`}
                            aria-label={`ดูรูปที่ ${imageIndex + 1}`}
                          >
                            <Image
                              src={img.public_url}
                              alt={`${selectedProduct.name} ${imageIndex + 1}`}
                              fill
                              sizes="72px"
                              className="object-cover"
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Product name + unit badge */}
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center gap-2 text-[13px] font-bold text-slate-800">
                      <Package className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                      <span>ชื่อสินค้า</span>
                    </div>
                    <h1 className="text-[22px] font-extrabold leading-tight text-slate-900">
                      {selectedProduct.name}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-[#eef4fa] px-3 py-1 text-[12px] font-bold text-[#003366]">
                        หน่วย: {selectedProduct.sale_unit_label}
                      </span>
                      {selectedProduct.min_order_qty > 1 && (
                        <span className="text-[12px] font-medium text-slate-400">
                          ขั้นต่ำ {selectedProduct.min_order_qty}{" "}
                          {getDisplayUnit(selectedProduct.sale_unit_label)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Section 2: รายละเอียดสินค้า ── */}
              {(() => {
                const meta = (selectedProduct.metadata ?? {}) as Record<string, string>;
                const brand = meta.brand ?? "";
                const category =
                  selectedProduct.categoryNames.join(", ") || meta.category || "";
                const description = meta.description ?? "";
                const hasContent = brand || category || description;
                if (!hasContent) return null;
                return (
                  <div className="mt-2 bg-white px-6 py-5 shadow-[0_16px_38px_rgba(15,23,42,0.10)]">
                    <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-slate-800">
                      <Info className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                      <span>รายละเอียดสินค้า</span>
                    </h3>
                    <div className="space-y-3">
                      {(brand || category) && (
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                          {brand && (
                            <p className="text-[13px] text-slate-600">
                              <span className="font-semibold text-slate-700">แบรนด์:</span>{" "}
                              {brand}
                            </p>
                          )}
                          {brand && category ? (
                            <span className="h-4 w-px bg-slate-300" aria-hidden="true" />
                          ) : null}
                          {category && (
                            <p className="text-[13px] text-slate-600">
                              <span className="font-semibold text-slate-700">หมวดหมู่:</span>{" "}
                              {category}
                            </p>
                          )}
                        </div>
                      )}
                      {description ? (
                        <div>
                          <p className="whitespace-pre-line text-[14px] leading-relaxed text-slate-600">
                            {description}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })()}

              {/* ── Section 3: ตัวเลือกสินค้า ── */}
              {relatedUnitProducts.length > 0 && (
                <div className="mt-2 bg-white px-6 py-5 shadow-[0_16px_38px_rgba(15,23,42,0.10)]">
                  <h3 className="mb-4 flex items-center gap-2 text-[13px] font-bold text-slate-800">
                    <BadgeCheck className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                    <span>หน่วย</span>
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {relatedUnitProducts.map((unitProduct) => {
                      const isUnitActive = selectedProduct.id === unitProduct.id;
                      return (
                        <button
                          key={unitProduct.id}
                          onClick={() => jumpToProduct(gridProductIndexById.get(unitProduct.id) ?? -1)}
                          className={`flex flex-col items-center justify-center rounded-xl border-2 p-4 transition-all ${
                            isUnitActive
                              ? "border-[#003366] bg-[#eef4fa] text-[#003366]"
                              : "border-slate-100 bg-white text-slate-500 hover:border-slate-200"
                          }`}
                        >
                          <span className="text-[14px] font-bold">
                            {getDisplayUnit(unitProduct.sale_unit_label)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Section 4: สินค้าแนะนำเพิ่มเติม ── */}
              {modalRecommendations.length > 0 && (
                <div className="mt-2 bg-white px-6 py-5 shadow-[0_16px_38px_rgba(15,23,42,0.10)]">
                  <h3 className="mb-5 flex items-center gap-2 text-[13px] font-bold text-slate-800">
                    <Package className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                    <span>สินค้าเพิ่มเติม</span>
                  </h3>
                  <div
                    ref={modalRecommendationsRef}
                    onScroll={handleRecommendationScroll}
                    className="-mx-2 flex gap-4 overflow-x-auto px-2 pb-4 no-scrollbar"
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                  >
                    {modalRecommendations.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => jumpToProduct(gridProductIndexById.get(product.id) ?? -1)}
                        className="group w-28 flex-shrink-0"
                      >
                        <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                          <Image
                            src={
                              product.product_images?.[0]?.public_url ||
                              "/placeholders/product-placeholder.svg"
                            }
                            alt={product.name}
                            fill
                            sizes="112px"
                            className="object-cover"
                          />
                        </div>
                        <p className="line-clamp-2 text-[11px] font-bold leading-tight text-slate-700">
                          {product.name}
                        </p>
                      </button>
                    ))}
                  </div>
                  {modalRecommendationPageCount > 1 && (
                    <div className="mt-1 flex items-center justify-center gap-2">
                      {Array.from({ length: modalRecommendationPageCount }).map((_, index) => {
                        const isActive = index === modalRecommendationIndex;
                        return (
                          <span
                            key={`recommendation-page-${index}`}
                            aria-hidden="true"
                            className={`h-1.5 rounded-full transition-all ${
                              isActive ? "w-6 bg-[#003366]" : "w-3 bg-[#003366]/20"
                            }`}
                          />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer - Stepper + Add to Cart */}
          <div className="z-30 border-t border-slate-100 bg-white px-5 pb-8 pt-4 shadow-[0_-4px_20px_rgba(0,0,0,0.03)]">
            <div className="mx-auto max-w-lg">
              <div className="flex items-center gap-3">
                <div ref={modalStepperRef}>
                  <ModalQuantityStepper
                    quantity={pendingModalQty}
                    unitLabel={getDisplayUnit(selectedProduct.sale_unit_label)}
                    onDecrease={() => {
                      const minQty = selectedProduct.min_order_qty ?? 1;
                      const stepQty = selectedProduct.step_order_qty ?? 1;
                      setPendingModalQty((prev) => {
                        if (prev <= minQty) return 0;
                        return prev - stepQty;
                      });
                    }}
                    onIncrease={() => {
                      if (!isOrderOpen) return;
                      const minQty = selectedProduct.min_order_qty ?? 1;
                      const stepQty = selectedProduct.step_order_qty ?? 1;
                      setPendingModalQty((prev) => (prev === 0 ? minQty : prev + stepQty));
                    }}
                  />
                </div>

              <button
                disabled={!isOrderOpen || pendingModalQty === 0}
                onClick={() => {
                  if (!isOrderOpen) return;
                  setCart((prev) => ({
                    ...prev,
                    [selectedProduct.id]: (prev[selectedProduct.id] || 0) + pendingModalQty,
                  }));
                  setPendingModalQty(0);

                  const stepperEl = modalStepperRef.current;
                  const cartEl = modalCartBtnRef.current;
                  if (!stepperEl || !cartEl) return;

                  const stepperRect = stepperEl.getBoundingClientRect();
                  const cartRect = cartEl.getBoundingClientRect();
                  const SIZE = 48;
                  const startX = stepperRect.left + stepperRect.width / 2 - SIZE / 2;
                  const startY = stepperRect.top + stepperRect.height / 2 - SIZE / 2;
                  const endX = cartRect.left + cartRect.width / 2 - SIZE / 2;
                  const endY = cartRect.top + cartRect.height / 2 - SIZE / 2;

                  const flyEl = document.createElement("div");
                  flyEl.style.cssText = [
                    "position:fixed",
                    `left:${startX}px`,
                    `top:${startY}px`,
                    `width:${SIZE}px`,
                    `height:${SIZE}px`,
                    "border-radius:14px",
                    "overflow:hidden",
                    "box-shadow:0 12px 32px rgba(0,0,0,0.25)",
                    "pointer-events:none",
                    "z-index:9999",
                  ].join(";");

                  const imgNode = document.createElement("img");
                  imgNode.src =
                    selectedProduct.product_images?.[0]?.public_url ??
                    "/placeholders/product-placeholder.svg";
                  imgNode.style.cssText = "width:100%;height:100%;object-fit:cover";
                  flyEl.appendChild(imgNode);
                  document.body.appendChild(flyEl);

                  const dx = endX - startX;
                  const dy = endY - startY;
                  flyEl
                    .animate(
                      [
                        { transform: "translate(0,0) scale(1)", opacity: "1", offset: 0 },
                        { transform: `translate(${dx * 0.6}px,${dy * 0.4}px) scale(0.85)`, opacity: "1", offset: 0.4 },
                        { transform: `translate(${dx}px,${dy}px) scale(0.2)`, opacity: "0", offset: 1 },
                      ],
                      { duration: 550, easing: "cubic-bezier(0.4,0,0.2,1)", fill: "forwards" }
                    )
                    .addEventListener("finish", () => {
                      document.body.removeChild(flyEl);
                    });
                }}
                className={`flex-1 flex items-center justify-center gap-2 h-14 rounded-2xl font-bold transition-all active:scale-95 ${
                  !isOrderOpen
                    ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                    : pendingModalQty > 0
                    ? "bg-[#003366] text-white shadow-md shadow-blue-900/20"
                    : "bg-slate-100 text-slate-300 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {!isOrderOpen ? (
                    <Lock className="h-4 w-4" strokeWidth={2} />
                  ) : (
                    <ShoppingCart className="h-4.5 w-4.5" strokeWidth={2} />
                  )}
                  <span className="text-[14px] font-bold">
                    {!isOrderOpen ? "ปิดรับออเดอร์" : "เพิ่มเข้าตะกร้า"}
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

    </div>
  );
}
