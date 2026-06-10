"use client";

import Image from "next/image";
import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
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
  Download,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Package,
  Phone,
  RotateCcw,
  Search,
  ShoppingCart,
  Star,
  Store,
  UserPlus,
  X,
} from "lucide-react";
import { CatalogView } from "@/app/order/customer/components/catalog-view";
import { CatalogCategoryDrawer } from "@/app/order/customer/components/catalog-category-drawer";
import { OrderBottomShell } from "@/app/order/customer/components/order-bottom-shell";
import { OrderCartView } from "@/app/order/customer/components/order-cart-view";
import { RECEIPT_EXPORT_WIDTH } from "@/app/order/customer/components/order-receipt-constants";
import { OrderStatusBanner } from "@/app/order/customer/components/order-status-banner";
import { formatDisplayUnit } from "@/app/order/customer/unit-label";
import type { ProductWithImage } from "@/app/order/customer/types";
import type {
  Customer,
  CustomerOrderItem,
  CustomerOrderRow,
  FrequentProductSummary,
  GeoOption,
  LastOrderMeta,
  ReceiptItem,
  SessionCustomer,
  ViewState,
} from "@/app/order/customer/order-client-types";
import {
  getCustomerByLineId,
  registerLineCustomer,
  continueExistingLineCustomer,
  createPendingLineOrderAction,
  submitNewCustomerInquiry,
  getFrequentlyOrderedProducts,
  getCustomerOrders,
  createOrder,
  updateCustomerOrder,
} from "./actions";
import {
  formatOrderCutoffLabel,
  isCustomerOrderEditableAtTime,
  isOrderOpenAtMinutes,
} from "@/lib/order-window";
import { maskLineUserId, reportOrderDebugClient, summarizeError } from "@/lib/order-debug";

const EditOrderProductSheet = dynamic(() =>
  import("@/app/order/customer/components/order-edit-view").then(
    (mod) => mod.EditOrderProductSheet,
  ),
);
const OrderEditView = dynamic(() =>
  import("@/app/order/customer/components/order-edit-view").then((mod) => mod.OrderEditView),
);
const OrderHistoryView = dynamic(() =>
  import("@/app/order/customer/components/order-history-view").then(
    (mod) => mod.OrderHistoryView,
  ),
);
const OrderProfileView = dynamic(() =>
  import("@/app/order/customer/components/order-profile-view").then(
    (mod) => mod.OrderProfileView,
  ),
);
const OrderReceiptModals = dynamic(() =>
  import("@/app/order/customer/components/order-receipt-modals").then(
    (mod) => mod.OrderReceiptModals,
  ),
);
const OrderSuccessView = dynamic(() =>
  import("@/app/order/customer/components/order-success-view").then(
    (mod) => mod.OrderSuccessView,
  ),
);
const ProductDetailModal = dynamic(() =>
  import("@/app/order/customer/components/product-detail-modal").then(
    (mod) => mod.ProductDetailModal,
  ),
);

function extractCustomerLinePictureUrl(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const metadata = "metadata" in value ? value.metadata : null;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const lineProfile = "lineProfile" in metadata ? metadata.lineProfile : null;
  if (!lineProfile || typeof lineProfile !== "object" || Array.isArray(lineProfile)) {
    return null;
  }

  const pictureUrl = "pictureUrl" in lineProfile ? lineProfile.pictureUrl : null;
  return typeof pictureUrl === "string" && pictureUrl.trim() ? pictureUrl.trim() : null;
}

function normalizeLinkedCustomer(value: unknown): Customer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const id = "id" in value && typeof value.id === "string" ? value.id : "";
  const name = "name" in value && typeof value.name === "string" ? value.name : "";
  const customerCode =
    "customer_code" in value && typeof value.customer_code === "string"
      ? value.customer_code
      : null;

  if (!id || !name) {
    return null;
  }

  return {
    customer_code: customerCode,
    id,
    linePictureUrl: extractCustomerLinePictureUrl(value),
    name,
  };
}

// ─── Order window: 00:00 – 16:59 Bangkok time ────────────────────────────────

function getBangkokTimeParts() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const year = parts.find(p => p.type === "year")?.value ?? "";
  const month = parts.find(p => p.type === "month")?.value ?? "";
  const day = parts.find(p => p.type === "day")?.value ?? "";
  const hour = parts.find(p => p.type === "hour")?.value ?? "0";
  const minute = parts.find(p => p.type === "minute")?.value ?? "0";

  return {
    date: `${year}-${month}-${day}`,
    hour: Number(hour),
    minute: Number(minute),
    minutes: Number(hour) * 60 + Number(minute),
  };
}

function getBangkokDateKey(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find(p => p.type === "year")?.value ?? "";
  const month = parts.find(p => p.type === "month")?.value ?? "";
  const day = parts.find(p => p.type === "day")?.value ?? "";

  return `${year}-${month}-${day}`;
}

function calcIsOrderOpen({
  allowOrderAfterCutoff,
  closeTime,
  openTime,
}: {
  allowOrderAfterCutoff: boolean;
  closeTime: string;
  openTime: string;
}) {
  const bangkokTime = getBangkokTimeParts();
  return isOrderOpenAtMinutes({
    allowOrderAfterCutoff,
    closeTime,
    currentMinutes: bangkokTime.minutes,
    openTime,
  });
}

function getConstraintError(qty: number, min: number, step: number | null): string | null {
  if (qty <= 0) return null;
  if (qty < min) return `สั่งขั้นต่ำ ${min} ${step !== null ? `(เช่น ${min}, ${min + step}...)` : ""}`;
  if (step !== null && (qty - min) % step !== 0) {
    return `เพิ่ม/ลดทีละ ${step} (เช่น ${min}, ${min + step}, ${min + step * 2}...)`;
  }
  return null;
}

function getDisplayUnit(unit: string | null | undefined) {
  return formatDisplayUnit(unit);
}

function getBangkokOrderEditMeta({
  allowOrderAfterCutoff,
  closeTime,
  orderDate,
  status,
}: {
  allowOrderAfterCutoff: boolean;
  closeTime: string;
  orderDate: string;
  status: string | null | undefined;
}) {
  const bangkokTime = getBangkokTimeParts();
  const isEditable = isCustomerOrderEditableAtTime({
    allowOrderAfterCutoff,
    closeTime,
    currentDate: bangkokTime.date,
    currentMinutes: bangkokTime.minutes,
    orderDate,
    status,
  });

  return {
    cutoffLabel: formatOrderCutoffLabel(orderDate, closeTime),
    isEditable,
  };
}

const ERROR_TRANSLATIONS: Record<string, string> = {
  "EDIT_TIMEOUT": "คำสั่งซื้อนี้หมดเวลาแก้ไขแล้ว",
  "ORDER_NOT_FOUND": "ไม่พบคำสั่งซื้อที่ต้องการแก้ไข",
  "INCOMPLETE_DATA": "ข้อมูลไม่ครบถ้วน หรือไม่มีสินค้าในคำสั่งซื้อ",
  "DELETE_ITEMS_FAILED": "ไม่สามารถลบรายการสินค้าเดิมได้",
  "INSERT_ITEMS_FAILED": "ไม่สามารถบันทึกรายการที่แก้ไขได้",
  "UPDATE_ORDER_FAILED": "ไม่สามารถบันทึกคำสั่งซื้อที่แก้ไขได้",
  "ORDER_CLOSED": "ขณะนี้ปิดรับออเดอร์แล้ว",
  "ORDER_NUMBER_FAILED": "ไม่สามารถสร้างเลขออเดอร์ได้",
  "CREATE_ORDER_FAILED": "ไม่สามารถสร้างคำสั่งซื้อได้",
};

function translateError(errorMsg: string | null | undefined): string {
  if (!errorMsg) return "เกิดข้อผิดพลาดที่ไม่รู้จัก";
  const trimmed = errorMsg.trim();
  if (ERROR_TRANSLATIONS[trimmed]) {
    return ERROR_TRANSLATIONS[trimmed];
  }
  return errorMsg;
}


// Component

export default function OrderClient({
  allowOrderAfterCutoff,
  initialProducts,
  initialSessionCustomer,
  initialSessionLineUserId,
  organizationId,
  orderCloseTime,
  orderOpenTime,
  orgPhone,
  previewView,
}: {
  allowOrderAfterCutoff: boolean;
  initialProducts: ProductWithImage[];
  initialSessionCustomer: SessionCustomer | null;
  initialSessionLineUserId: string | null;
  organizationId: string;
  orderCloseTime: string;
  orderOpenTime: string;
  orgPhone: string;
  previewView?: string;
}) {
  const {
    isReady,
    isInClient,
    liffToken,
    profile,
    login,
    logout,
    closeWindow,
    refreshProfile,
  } = useLiff();
  const cartButtonRef = useRef<HTMLButtonElement | null>(null);

  // Order window state — updates every minute
  const [isOrderOpen, setIsOrderOpen] = useState(() =>
    calcIsOrderOpen({
      allowOrderAfterCutoff,
      closeTime: orderCloseTime,
      openTime: orderOpenTime,
    }),
  );
  useEffect(() => {
    const tick = () =>
      setIsOrderOpen(
        calcIsOrderOpen({
          allowOrderAfterCutoff,
          closeTime: orderCloseTime,
          openTime: orderOpenTime,
        }),
      );
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [allowOrderAfterCutoff, orderCloseTime, orderOpenTime]);

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
  const [isReceiptPopupOpen, setIsReceiptPopupOpen] = useState(false);
  const [receiptPopupUrl, setReceiptPopupUrl] = useState<string | null>(null);
  const [receiptBlob, setReceiptBlob] = useState<Blob | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string>("");
  const receiptCardRef = useRef<HTMLDivElement | null>(null);
  const receiptCaptureLockRef = useRef(false);
  const checkoutInFlightRef = useRef(false);
  const [showAddProductSheet, setShowAddProductSheet] = useState(false);
  const [addProductSearch, setAddProductSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductCategory, setSelectedProductCategory] = useState<"all" | string>("all");

  // View state
  const PREVIEW_VIEWS: ViewState[] = ["new_inquiry", "inquiry_done", "register", "login"];
  const initialView: ViewState =
    previewView && (PREVIEW_VIEWS as string[]).includes(previewView)
      ? (previewView as ViewState)
      : initialSessionCustomer
        ? "catalog"
        : "loading";
  const [currentView, setCurrentView] = useState<ViewState>(initialView);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"all" | "favorites" | "recent">("all");
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});

  // Product detail modal state
  const [selectedProductIndex, setSelectedProductIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalImageIndexes, setModalImageIndexes] = useState<Record<string, number>>({});
  const [modalRecommendationIndex, setModalRecommendationIndex] = useState(0);
  const [modalRecommendationPageCount, setModalRecommendationPageCount] = useState(1);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");
  const [loadedModalImageKeys, setLoadedModalImageKeys] = useState<Record<string, true>>({});

  const modalCartBtnRef = useRef<HTMLButtonElement>(null);
  const modalStepperRef = useRef<HTMLDivElement>(null);
  const modalRecommendationsRef = useRef<HTMLDivElement>(null);
  const modalImageViewportRef = useRef<HTMLDivElement>(null);
  const modalImageTrackRef = useRef<HTMLDivElement>(null);
  const shareMenuRef = useRef<HTMLDivElement>(null);
  const closeModalTimerRef = useRef<number | null>(null);
  const recommendationRafRef = useRef<number | null>(null);
  const recommendationScrollElementRef = useRef<HTMLDivElement | null>(null);
  const preloadedModalImageUrlsRef = useRef<Set<string>>(new Set());
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchCurrentXRef = useRef<number | null>(null);
  const isHorizontalImageSwipeRef = useRef(false);
  const isImageDraggingRef = useRef(false);

  // Swipe logic for modal images
  const minSwipeDistance = 24;

  const syncModalImageTrack = useCallback(
    (imageIndex: number, dragDistance = 0, withTransition = true) => {
      const viewport = modalImageViewportRef.current;
      const track = modalImageTrackRef.current;
      if (!viewport || !track) return;
      const viewportWidth = Math.max(viewport.clientWidth, 1);
      const translateX = -imageIndex * viewportWidth + dragDistance;
      track.style.transition = withTransition
        ? "transform 340ms cubic-bezier(0.22, 1, 0.36, 1)"
        : "none";
      track.style.transform = `translate3d(${translateX}px, 0, 0)`;
      track.style.willChange = withTransition ? "auto" : "transform";
    },
    [],
  );

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

  const setModalImageIndex = useCallback((productId: string, nextIndex: number) => {
    setModalImageIndexes((prev) => ({
      ...prev,
      [productId]: Math.max(0, nextIndex),
    }));
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    if (!selectedProduct || selectedProductImages.length <= 1) return;
    touchStartXRef.current = e.targetTouches[0].clientX;
    touchStartYRef.current = e.targetTouches[0].clientY;
    touchCurrentXRef.current = e.targetTouches[0].clientX;
    isHorizontalImageSwipeRef.current = false;
    isImageDraggingRef.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isImageDraggingRef.current || touchStartXRef.current === null || touchStartYRef.current === null) return;
    const deltaX = e.targetTouches[0].clientX - touchStartXRef.current;
    const deltaY = e.targetTouches[0].clientY - touchStartYRef.current;
    if (!isHorizontalImageSwipeRef.current) {
      if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY)) {
        isImageDraggingRef.current = false;
        return;
      }
      isHorizontalImageSwipeRef.current = true;
    }
    touchCurrentXRef.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!isHorizontalImageSwipeRef.current || touchStartXRef.current === null || touchCurrentXRef.current === null) {
      isImageDraggingRef.current = false;
      isHorizontalImageSwipeRef.current = false;
      touchStartXRef.current = null;
      touchStartYRef.current = null;
      touchCurrentXRef.current = null;
      return;
    }
    const distance = touchStartXRef.current - touchCurrentXRef.current;
    if (selectedProduct && selectedProductImages.length > 1 && Math.abs(distance) >= minSwipeDistance) {
      const imageCount = selectedProductImages.length;
      const currentIndex = selectedProductImageIndex;
      const newIndex =
        distance > 0
          ? (currentIndex + 1) % imageCount
          : (currentIndex - 1 + imageCount) % imageCount;
      setModalImageIndex(selectedProduct.id, newIndex);
    }
    isImageDraggingRef.current = false;
    isHorizontalImageSwipeRef.current = false;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchCurrentXRef.current = null;
  };

  useEffect(() => {
    return () => {
      if (closeModalTimerRef.current !== null) {
        window.clearTimeout(closeModalTimerRef.current);
      }
      if (recommendationRafRef.current !== null) {
        window.cancelAnimationFrame(recommendationRafRef.current);
      }
    };
  }, []);

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
  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(
    initialSessionCustomer
      ? {
          customer_code: initialSessionCustomer.customerCode,
          id: initialSessionCustomer.id,
          linePictureUrl: initialSessionCustomer.linePictureUrl ?? null,
          name: initialSessionCustomer.name,
        }
      : null,
  );
  const [sessionLineUserId, setSessionLineUserId] = useState<string | null>(
    initialSessionLineUserId,
  );
  const [canSubmitPendingLineOrder, setCanSubmitPendingLineOrder] = useState(false);
  const [pendingLineOrderId, setPendingLineOrderId] = useState<string | null>(null);
  const hasResolvedAuthRef = useRef(false);

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

  // Sync server session cookie after LIFF login.
  useEffect(() => {
    if (!isReady || !profile?.userId || !liffToken) return;

    let isActive = true;
    void (async () => {
      const startedAt = Date.now();
      try {
        const response = await fetch("/api/order/session", {
          body: JSON.stringify({
            displayName: profile.displayName ?? "",
            idToken: liffToken,
            lineUserId: profile.userId,
            pictureUrl: profile.pictureUrl ?? "",
          }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        });
        if (!response.ok) {
          void reportOrderDebugClient("order_session_sync_http_error", {
            durationMs: Date.now() - startedAt,
            lineUserId: maskLineUserId(profile.userId),
            status: response.status,
          });
          return;
        }
        if (!isActive) return;
        setSessionLineUserId(profile.userId);
        if (profile.pictureUrl) {
          setLinkedCustomer((current) =>
            current ? { ...current, linePictureUrl: profile.pictureUrl } : current,
          );
        }
      } catch (error) {
        console.error("[order-session:sync]", error);
        void reportOrderDebugClient("order_session_sync_fetch_error", {
          error: summarizeError(error),
          lineUserId: maskLineUserId(profile.userId),
        });
      }
    })();

    return () => {
      isActive = false;
    };
  }, [isReady, liffToken, profile?.displayName, profile?.pictureUrl, profile?.userId]);

  // Resolve auth state once on boot with session-first fallback.
  useEffect(() => {
    if (!isReady) return;
    const lineUserId = profile?.userId ?? sessionLineUserId;
    const shouldResolveAgainFromMockLogin =
      process.env.NEXT_PUBLIC_LIFF_MOCK === "true" &&
      currentView === "login" &&
      Boolean(lineUserId);

    if (hasResolvedAuthRef.current && !shouldResolveAgainFromMockLogin) return;

    if (linkedCustomer) {
      hasResolvedAuthRef.current = true;
      setCanSubmitPendingLineOrder(false);
      setCurrentView("catalog");
      return;
    }

    if (!lineUserId) {
      hasResolvedAuthRef.current = true;
      setCurrentView("login");
      return;
    }

    startTransition(async () => {
      try {
        const result = await getCustomerByLineId(lineUserId);

        if (result.success && result.data) {
          setLinkedCustomer(normalizeLinkedCustomer(result.data));
          setCanSubmitPendingLineOrder(false);
          setCurrentView("catalog");
        } else {
          setCanSubmitPendingLineOrder(true);
          setRegFormOpen(false);
          setCurrentView("catalog");
        }
      } catch (error) {
        console.error("[order-auth:bootstrap]", error);
        void reportOrderDebugClient("order_auth_bootstrap_error", {
          error: summarizeError(error),
          lineUserId: maskLineUserId(lineUserId),
        });
        setCurrentView("login");
      } finally {
        hasResolvedAuthRef.current = true;
      }
    });
  }, [currentView, isReady, linkedCustomer, organizationId, profile?.userId, sessionLineUserId]);

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

  // Scroll-to-top visibility
  useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      setShowScrollTop(scrollY > 300);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
    const editMeta = getBangkokOrderEditMeta({
      allowOrderAfterCutoff,
      closeTime: orderCloseTime,
      orderDate: order.order_date ?? "",
      status: order.status,
    });
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

  const addModalItemsToCart = useCallback(
    (productId: string, quantityToAdd: number) => {
      if (!isOrderOpen || quantityToAdd <= 0) return;
      setCart((prev) => ({
        ...prev,
        [productId]: (prev[productId] || 0) + quantityToAdd,
      }));
    },
    [isOrderOpen],
  );

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

  const productsById = useMemo(() => {
    const map = new Map<string, ProductWithImage>();

    for (const product of products) {
      map.set(product.id, product);

      for (const saleUnit of product.product_sale_units ?? []) {
        if (!saleUnit.is_active) continue;

        map.set(`${product.product_id}:${saleUnit.id}`, {
          ...product,
          id: `${product.product_id}:${saleUnit.id}`,
          product_sale_unit_id: saleUnit.id,
          sale_unit_label: saleUnit.unit_label,
          sale_unit_ratio: Number(saleUnit.base_unit_quantity),
          min_order_qty: Number(saleUnit.min_order_qty ?? 1),
          step_order_qty:
            saleUnit.step_order_qty !== null && saleUnit.step_order_qty !== undefined
              ? Number(saleUnit.step_order_qty)
              : null,
        });
      }
    }

    return map;
  }, [products]);

  const productsByLookupKey = useMemo(() => {
    const map = new Map<string, ProductWithImage>();

    for (const product of products) {
      map.set(`${product.product_id}::${product.product_sale_unit_id}`, product);

      for (const saleUnit of product.product_sale_units ?? []) {
        if (!saleUnit.is_active) continue;

        map.set(`${product.product_id}::${saleUnit.id}`, {
          ...product,
          id: `${product.product_id}:${saleUnit.id}`,
          product_sale_unit_id: saleUnit.id,
          sale_unit_label: saleUnit.unit_label,
          sale_unit_ratio: Number(saleUnit.base_unit_quantity),
          min_order_qty: Number(saleUnit.min_order_qty ?? 1),
          step_order_qty:
            saleUnit.step_order_qty !== null && saleUnit.step_order_qty !== undefined
              ? Number(saleUnit.step_order_qty)
              : null,
        });
      }
    }

    return map;
  }, [products]);

  const recentOrderKeys = useMemo(() => {
    const latestOrder = orderHistory[0];
    if (!latestOrder?.order_items) return new Set<string>();

    return new Set(
      latestOrder.order_items.map(
        (item) => `${item.products?.id ?? ""}::${item.product_sale_unit_id ?? ""}`,
      ),
    );
  }, [orderHistory]);

  const yesterdayOrder = useMemo(() => {
    const todayKey = getBangkokDateKey(0);
    return orderHistory.find((order) => {
      const orderDate = order.order_date;
      return typeof orderDate === "string" && orderDate < todayKey;
    }) ?? null;
  }, [orderHistory]);

  const yesterdayOrderKeys = useMemo(() => {
    if (!yesterdayOrder?.order_items) return new Set<string>();

    return new Set(
      yesterdayOrder.order_items.map(
        (item) => `${item.products?.id ?? ""}::${item.product_sale_unit_id ?? ""}`,
      ),
    );
  }, [yesterdayOrder]);

  const totalItems = useMemo(() => Object.values(cart).reduce((sum, qty) => sum + qty, 0), [cart]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = deferredSearchQuery.replace(/\s+/g, "").toLowerCase();
    
    // First, get unique products by product_id
    const uniqueProductMap = new Map<string, ProductWithImage>();
    for (const p of products) {
      if (!uniqueProductMap.has(p.product_id)) {
        uniqueProductMap.set(p.product_id, p);
      }
    }
    const uniqueProducts = Array.from(uniqueProductMap.values());

    if (!normalizedQuery) return uniqueProducts;

    return uniqueProducts.filter((p) => {
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
        const repeatKeys = yesterdayOrderKeys.size > 0 ? yesterdayOrderKeys : recentOrderKeys;
        return Array.from(repeatKeys).some((key) => key.startsWith(`${p.product_id}::`));
      }
      return true;
    });
  }, [
    activeCategory,
    favorites,
    filteredProducts,
    recentOrderKeys,
    selectedProductCategory,
    yesterdayOrderKeys,
  ]);

  const gridProductIndexById = useMemo(
    () => new Map(gridProducts.map((product, index) => [product.id, index])),
    [gridProducts],
  );

  // For the modal, we need to handle the currently selected UNIT of the selected product
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);

  const selectedProductBase = useMemo(
    () => (selectedProductIndex === null ? null : gridProducts[selectedProductIndex] ?? null),
    [gridProducts, selectedProductIndex],
  );

  const selectedProduct = useMemo(() => {
    if (!selectedProductBase) return null;
    
    // If no unit selected yet, use the default one
    const unitId = selectedUnitId || selectedProductBase.product_sale_unit_id;
    const saleUnit = selectedProductBase.product_sale_units?.find(
      (u) => u.id === unitId && u.is_active,
    );
    
    if (!saleUnit) return selectedProductBase;

    return {
      ...selectedProductBase,
      id: `${selectedProductBase.product_id}:${saleUnit.id}`,
      product_sale_unit_id: saleUnit.id,
      sale_unit_label: saleUnit.unit_label,
      sale_unit_ratio: Number(saleUnit.base_unit_quantity),
      min_order_qty: Number(saleUnit.min_order_qty ?? 1),
      step_order_qty: saleUnit.step_order_qty !== null ? Number(saleUnit.step_order_qty) : null,
    } as ProductWithImage;
  }, [selectedProductBase, selectedUnitId]);


  const selectedProductImages = useMemo(
    () => selectedProduct?.product_images ?? [],
    [selectedProduct],
  );
  const selectedProductImageSlides = useMemo(
    () =>
      selectedProductImages.length > 0
        ? selectedProductImages.map((image) => ({
            id: image.id,
            public_url: image.public_url,
          }))
        : [
            {
              id: `${selectedProduct?.id ?? "placeholder"}-placeholder`,
              public_url: "/placeholders/product-placeholder.svg",
            },
          ],
    [selectedProduct?.id, selectedProductImages],
  );
  const selectedProductImageIndex = selectedProduct
    ? Math.min(
        modalImageIndexes[selectedProduct.id] ?? 0,
        Math.max(selectedProductImages.length - 1, 0),
      )
    : 0;
  const selectedProductId = selectedProduct?.id ?? null;

  useLayoutEffect(() => {
    if (!selectedProductId || !isModalOpen) return;
    syncModalImageTrack(selectedProductImageIndex, 0, true);
  }, [
    isModalOpen,
    selectedProductId,
    selectedProductImageIndex,
    selectedProductImages.length,
    syncModalImageTrack,
  ]);

  useEffect(() => {
    if (!selectedProductId || !isModalOpen) return;
    const handleResize = () => syncModalImageTrack(selectedProductImageIndex, 0, false);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [isModalOpen, selectedProductId, selectedProductImageIndex, syncModalImageTrack]);

  useEffect(() => {
    if (!selectedProduct || selectedProductImages.length <= 1) {
      return;
    }

    const imageCount = selectedProductImages.length;
    const nextIndex = (selectedProductImageIndex + 1) % imageCount;
    const prevIndex = (selectedProductImageIndex - 1 + imageCount) % imageCount;
    const urlsToPreload = [
      selectedProductImages[nextIndex]?.public_url,
      selectedProductImages[prevIndex]?.public_url,
    ].filter((url): url is string => Boolean(url));

    for (const imageUrl of urlsToPreload) {
      const image = new window.Image();
      image.decoding = "async";
      image.src = imageUrl;
    }
  }, [selectedProduct, selectedProductImageIndex, selectedProductImages]);

  const markModalImageLoaded = useCallback((loadKey: string) => {
    setLoadedModalImageKeys((previous) => {
      if (previous[loadKey]) return previous;
      return { ...previous, [loadKey]: true };
    });
  }, []);

  const buildProductShareUrl = useCallback((productId: string) => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.href);
    url.searchParams.set("product", productId);
    return url.toString();
  }, []);

  const preloadProductImages = useCallback((imageUrls: string[]) => {
    if (typeof window === "undefined" || imageUrls.length === 0) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetPx = Math.round(window.innerWidth * dpr);
    const steps = [320, 375, 414, 640, 750, 828, 1080, 1200, 1440, 1920];
    const w = steps.find((s) => s >= targetPx) ?? 1920;

    const urls = imageUrls.filter((url): url is string => Boolean(url && !url.startsWith("/")));
    if (urls.length === 0) return;

    const preloadUrl = (url: string) => {
      if (preloadedModalImageUrlsRef.current.has(url)) return;
      preloadedModalImageUrlsRef.current.add(url);
      const img = new window.Image();
      img.decoding = "async";
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = "high";
      img.src = `/_next/image?url=${encodeURIComponent(url)}&w=${w}&q=75`;
    };

    preloadUrl(urls[0]);

    if (urls.length > 1) {
      window.setTimeout(() => {
        for (const url of urls.slice(1)) {
          preloadUrl(url);
        }
      }, 40);
    }
  }, []);

  const openProductModal = useCallback((productId: string) => {
    const index = gridProductIndexById.get(productId);
    if (index === undefined) return;

    // Warm modal-sized images while keeping click -> open responsive.
    const product = gridProducts[index];
    const urls = (product?.product_images ?? [])
      .map((img) => img.public_url)
      .filter((u): u is string => Boolean(u));

    if (closeModalTimerRef.current !== null) {
      window.clearTimeout(closeModalTimerRef.current);
      closeModalTimerRef.current = null;
    }

    setIsShareMenuOpen(false);
    setShareFeedback("");
    setSelectedProductIndex(index);
    setSelectedUnitId(null);
    setIsModalOpen(true);

    preloadProductImages(urls);
  }, [gridProductIndexById, gridProducts, preloadProductImages]);

  const navigateProduct = useCallback((direction: "prev" | "next") => {
    setSelectedProductIndex((prev) => {
      if (prev === null || gridProducts.length === 0) return prev;
      if (gridProducts.length === 1) return 0;

      const delta = direction === "next" ? 1 : -1;
      return (prev + delta + gridProducts.length) % gridProducts.length;
    });
  }, [gridProducts.length]);
  void navigateProduct;

  const jumpToProduct = useCallback((id: string) => {
    const index = gridProductIndexById.get(id);
    if (index !== undefined) {
      setIsShareMenuOpen(false);
      setShareFeedback("");
      setSelectedProductIndex(index);
      setSelectedUnitId(null);
      return;
    }

    // If not in grid, maybe it's a unit of the current product
    if (selectedProductBase) {
      const unit = selectedProductBase.product_sale_units?.find(
        (u) => `${selectedProductBase.product_id}:${u.id}` === id,
      );
      if (unit) {
        setIsShareMenuOpen(false);
        setShareFeedback("");
        setSelectedUnitId(unit.id);
      }
    }
  }, [gridProductIndexById, selectedProductBase]);

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

  const repeatOrderCards = useMemo(
    () =>
      (yesterdayOrder?.order_items ?? [])
        .map((item) => {
          const product = productsByLookupKey.get(
            `${item.products?.id ?? ""}::${item.product_sale_unit_id ?? ""}`,
          );
          const quantity = Number(item.quantity) || 0;
          return product && quantity > 0 ? { product, quantity } : null;
        })
        .filter((item): item is { product: ProductWithImage; quantity: number } => item !== null),
    [productsByLookupKey, yesterdayOrder],
  );

  const repeatYesterdayOrder = useCallback(() => {
    if (!isOrderOpen || repeatOrderCards.length === 0) return;

    setCart((prev) => {
      const next = { ...prev };
      for (const { product, quantity } of repeatOrderCards) {
        next[product.id] = (next[product.id] || 0) + quantity;
      }
      return next;
    });
    setCurrentView("cart");
  }, [isOrderOpen, repeatOrderCards]);

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

    // Search in all products, not just filtered ones
    const product = productsById.get(productId);
    if (!product) return;

    // Find index in original products list to set as selectedProductBase
    const baseIndex = gridProducts.findIndex(p => p.product_id === product.product_id);
    if (baseIndex === -1) return;

    // If the ID contains a unit, set it
    if (productId.includes(":")) {
      setSelectedUnitId(productId.split(":")[1]);
    } else {
      setSelectedUnitId(null);
    }

    setSelectedProductIndex(baseIndex);
    setIsModalOpen(true);
  }, [currentView, gridProducts, productsById]);

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
    recommendationScrollElementRef.current = event.currentTarget;
    if (recommendationRafRef.current !== null) return;

    recommendationRafRef.current = window.requestAnimationFrame(() => {
      recommendationRafRef.current = null;
      syncRecommendationIndicator(recommendationScrollElementRef.current);
    });
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

  // Receipt

  const captureReceiptImage = useCallback(async (): Promise<{ blob: Blob; fileName: string } | null> => {
    if (!receiptCardRef.current || receiptCaptureLockRef.current) return null;

    receiptCaptureLockRef.current = true;
    let cloneHost: HTMLDivElement | null = null;
    try {
      const { default: html2canvas } = await import("html2canvas");
      const target = receiptCardRef.current;
      const outerPadding = 24;

      cloneHost = document.createElement("div");
      cloneHost.style.cssText = [
        "position:fixed",
        "left:-10000px",
        "top:0",
        `padding:${outerPadding}px`,
        "margin:0",
        "background:#ffffff",
        "z-index:-1",
        "overflow:visible",
        `width:${RECEIPT_EXPORT_WIDTH + outerPadding * 2}px`,
        "box-sizing:border-box",
      ].join(";");

      const clone = target.cloneNode(true) as HTMLDivElement;
      clone.style.width = `${RECEIPT_EXPORT_WIDTH}px`;
      clone.style.minWidth = `${RECEIPT_EXPORT_WIDTH}px`;
      clone.style.maxWidth = "none";
      clone.style.margin = "0";
      clone.style.transform = "none";

      cloneHost.appendChild(clone);
      document.body.appendChild(cloneHost);

      const captureWidth = RECEIPT_EXPORT_WIDTH + outerPadding * 2;
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

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 1));
      if (!blob) return null;

      const receiptOrderMeta = receiptOrder as { order_number?: string } | null;
      const fileName = `TYNoodle-${lastOrderMeta?.orderNumber ?? receiptOrderMeta?.order_number ?? "order"}.png`;

      return { blob, fileName };
    } catch (err) {
      console.error("[captureReceiptImage]", err);
      return null;
    } finally {
      if (cloneHost && document.body.contains(cloneHost)) {
        document.body.removeChild(cloneHost);
      }
      receiptCaptureLockRef.current = false;
    }
  }, [lastOrderMeta?.orderNumber, receiptOrder]);

  const saveReceiptAsImage = async () => {
    if (isSavingImage) return;
    setIsSavingImage(true);
    setReceiptImageUrl(null);
    try {
      const captured = await captureReceiptImage();
      if (!captured) return;

      const objectUrl = URL.createObjectURL(captured.blob);
      setReceiptPopupUrl(objectUrl);
      setReceiptBlob(captured.blob);
      setReceiptFileName(captured.fileName);
      setIsReceiptPopupOpen(true);
    } catch (err) {
      console.error("[saveReceiptAsImage]", err);
    } finally {
      setIsSavingImage(false);
    }
  };

  const closeReceiptPopup = () => {
    setIsReceiptPopupOpen(false);
    if (receiptPopupUrl) {
      URL.revokeObjectURL(receiptPopupUrl);
      setReceiptPopupUrl(null);
    }
    setReceiptBlob(null);
    setReceiptFileName("");
  };

  const handleDownloadReceipt = async () => {
    if (!receiptBlob || !receiptPopupUrl) return;

    // Check if iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const file = new File([receiptBlob], receiptFileName, { type: "image/png" });

    if (isIOS && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "ใบเสร็จ",
        });
        closeReceiptPopup();
        return;
      } catch (err) {
        console.error("[WebShare]", err);
        if (err instanceof Error && err.name === "AbortError") {
          return; // Stay on the page if cancelled!
        }
      }
    }

    // Fallback or non-iOS behavior
    const link = document.createElement("a");
    link.href = receiptPopupUrl;
    link.download = receiptFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    closeReceiptPopup();
  };



  // Handlers

  const handleRegister = () => {
    const lineUserId = profile?.userId ?? sessionLineUserId;
    if (!lineUserId) {
      login();
      return;
    }
    setRegError("");

    if (!regName.trim()) { setRegError("กรุณากรอกชื่อร้านค้า"); return; }
    if (!regProvinceName) { setRegError("กรุณาเลือกจังหวัด"); return; }
    if (!regDistrictName) { setRegError("กรุณาเลือกอำเภอ/เขต"); return; }
    if (!regSubdistrictName) { setRegError("กรุณาเลือกตำบล/แขวง"); return; }

    startTransition(async () => {
      const result = await registerLineCustomer({
        organizationId,
        lineUserId,
        lineDisplayName: profile?.displayName ?? undefined,
        linePictureUrl: profile?.pictureUrl ?? undefined,
        name: regName,
        phone: regPhone || undefined,
        address: regAddress || undefined,
        province: regProvinceName,
        district: regDistrictName,
        subdistrict: regSubdistrictName,
        postalCode: regPostalCode || undefined,
      });
      if (result.success) {
        await refreshProfile();
        setLinkedCustomer(normalizeLinkedCustomer(result.data));
        setCanSubmitPendingLineOrder(false);
        setSessionLineUserId(lineUserId);
        setCurrentView("catalog");
      } else {
        setRegError(result.error);
      }
    });
  };

  const handleContinueExistingCustomer = () => {
    const lineUserId = profile?.userId ?? sessionLineUserId;
    if (!lineUserId) {
      login();
      return;
    }

    setRegError("");
    startTransition(async () => {
      const result = await continueExistingLineCustomer({
        displayName: profile?.displayName ?? undefined,
        lineUserId,
        organizationId,
        pictureUrl: profile?.pictureUrl ?? undefined,
      });

      if (!result.success) {
        setRegError(result.error);
        return;
      }

      if (result.data) {
        setLinkedCustomer(normalizeLinkedCustomer(result.data));
        setCanSubmitPendingLineOrder(false);
      } else {
        setCanSubmitPendingLineOrder(true);
      }

      setSessionLineUserId(lineUserId);
      setRegFormOpen(false);
      setCurrentView("catalog");
    });
  };

  const handleNewInquiry = () => {
    if (!inquiryName.trim() || !inquiryPhone.trim()) return;
    startTransition(async () => {
      await submitNewCustomerInquiry(organizationId, inquiryName, inquiryPhone);
      setCurrentView("inquiry_done");
    });
  };

  const handleReturnToLine = () => {
    if (isInClient) {
      closeWindow();
      return;
    }

    alert("หากไม่สามารถกลับไปยัง LINE ได้ กรุณาปิดหน้าต่างนี้หรือกดปุ่มย้อนกลับ");
  };

  const handleCheckout = () => {
    if (checkoutInFlightRef.current || isPending) return;
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

    if (!linkedCustomer) {
      if (!profile && !sessionLineUserId) {
        login();
        return;
      }

      if (!canSubmitPendingLineOrder) {
        setCurrentView("register");
        return;
      }

      checkoutInFlightRef.current = true;
      startTransition(async () => {
        try {
          const result = await createPendingLineOrderAction({
            displayName: profile?.displayName ?? undefined,
            items,
            lineUserId: profile?.userId ?? sessionLineUserId ?? undefined,
            organizationId,
            pictureUrl: profile?.pictureUrl ?? undefined,
          });

          if (result.success) {
            setLastOrder(items);
            setPendingLineOrderId(result.data.pendingOrderId);
            setCart({});
            setCurrentView("pending_success");
          } else {
            alert(translateError(result.error));
          }
        } finally {
          checkoutInFlightRef.current = false;
        }
      });
      return;
    }

    checkoutInFlightRef.current = true;
    startTransition(async () => {
      try {
        const result = await createOrder(
          organizationId,
          linkedCustomer.id,
          items,
        );
        if (result.success) {
          setLastOrder(items);
          const resData = result.data as CustomerOrderRow;
          setLastOrderMeta({
            orderNumber: resData.order_number ?? "-",
            totalAmount: Number(resData.total_amount) || 0,
            orderDate: resData.order_date ?? new Date().toISOString().slice(0, 10),
            capturedAt: resData.created_at ?? new Date().toISOString(),
            receiptPushKey: resData.order_number ?? "-",
            receiptItems: (resData.order_items ?? []).map((item) => ({
              name: item.products?.name ?? "-",
              saleUnitLabel: formatDisplayUnit(item.sale_unit_label),
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
          alert(translateError(result.error));
        }
      } finally {
        checkoutInFlightRef.current = false;
      }
    });
  };

  const handleReorder = (order: CustomerOrderRow) => {
    if (!isOrderOpen) {
      alert("\u0e02\u0e13\u0e30\u0e19\u0e35\u0e49\u0e1b\u0e34\u0e14\u0e23\u0e31\u0e1a\u0e2d\u0e2d\u0e40\u0e14\u0e2d\u0e23\u0e4c\u0e41\u0e25\u0e49\u0e27");
      return;
    }

    const nextCart = buildCartFromOrder(order);

    if (Object.keys(nextCart).length === 0) {
      alert("ไม่พบรายการสินค้าที่สามารถสั่งซ้ำได้");
      return;
    }

    setCart((prev) => {
      const draft = { ...prev };
      for (const [id, qty] of Object.entries(nextCart)) {
        draft[id] = (draft[id] || 0) + qty;
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
        alert(translateError(result.error));
        return;
      }

      const resData = result.data as CustomerOrderRow & { receiptItems?: ReceiptItem[] };
      setOrderHistory((prev) =>
        prev.map((orderRow) =>
          orderRow.id === resData.id ? resData : orderRow,
        ),
      );
      setEditingOrder(resData);
      setEditCart(buildCartFromOrder(resData));
      setHighlightedHistoryOrderId(resData.id ?? null);
      setReceiptImageUrl(null);
      setReceiptOrder(resData);
      setCurrentView("history");
    });
  };

  const handleLogout = () => {
    startTransition(async () => {
      try {
        await fetch("/api/order/session", { method: "DELETE" });
      } catch (error) {
        console.error("[order-session:clear]", error);
      }

      setLinkedCustomer(null);
      setSessionLineUserId(null);
      logout();
      window.location.reload();
    });
  };

  // Render

  if (currentView === "loading") {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-white px-6">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin text-[#003366]" />
          <span className="text-sm font-semibold">กำลังตรวจสอบข้อมูลการเข้าสู่ระบบ...</span>
        </div>
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
          <p className="mt-1 text-sm text-slate-500">กรุณาเลือกประเภทการเริ่มต้นใช้งาน</p>
        </header>

        <main className="mx-auto w-full max-w-md px-4 py-6">

          {/* Choice buttons */}
          <div className="flex flex-col gap-3 mb-4">
              {/* ลูกค้าเก่า / เคยสั่งซื้อแล้ว */}
              <button
                type="button"
                onClick={handleContinueExistingCustomer}
                disabled={isPending}
                className={`flex w-full items-center gap-4 rounded-2xl border-2 px-5 py-4 transition active:scale-[0.98] ${
                  canSubmitPendingLineOrder
                    ? "border-[#003366] bg-[#003366] text-white shadow-lg"
                    : "border-slate-200 bg-white text-slate-700 shadow-sm hover:border-[#003366]/40"
                }`}
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${canSubmitPendingLineOrder ? "bg-white/15" : "bg-slate-100"}`}>
                  <Store className={`h-5 w-5 ${canSubmitPendingLineOrder ? "text-white" : "text-[#003366]"}`} strokeWidth={1.8} />
                </div>
                <div className="text-left">
                  <div className="text-base font-extrabold">ลูกค้าเก่า / เคยสั่งซื้อแล้ว</div>
                  <div className={`text-xs font-normal ${canSubmitPendingLineOrder ? "text-blue-200" : "text-slate-400"}`}>สำหรับลูกค้าที่เคยติดต่อหรือสั่งซื้อกับทางเรามาก่อน</div>
                </div>
                {isPending ? (
                  <Loader2 className="ml-auto h-4 w-4 shrink-0 animate-spin text-slate-300" />
                ) : (
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-300" strokeWidth={2.5} />
                )}
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
                <div className="text-xs font-normal text-slate-400">สำหรับลูกค้าที่ไม่เคยติดต่อหรือสั่งซื้อกับทางเรามาก่อน</div>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-300" strokeWidth={2.5} />
	            </button>
	          </div>

	          {regError ? (
	            <p className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600">
	              {regError}
	            </p>
	          ) : null}
	
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
                    ที่อยู่ตลาดในการจัดส่งสินค้า <span className="text-slate-400 font-normal text-xs">(บ้านเลขที่ / ถนน / ซอย)</span>
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
      "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10";

    return (
      <div className="min-h-screen bg-[linear-gradient(160deg,#f0fdfa_0%,#f8fafc_60%,#fff_100%)]">
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
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-500 shadow-md shadow-teal-200">
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
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 px-6 py-4 text-base font-bold text-white shadow-md shadow-teal-200 transition active:scale-[0.97] disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" strokeWidth={2} />}
              {isPending ? "กำลังส่งข้อมูล..." : "ส่งข้อมูลให้ทีมงาน"}
            </button>
          </div>

          {/* Shop contact */}
          <a
            href={`tel:${(orgPhone || "0819034686").replace(/[-\s]/g, "")}`}
            className="mt-5 flex items-center gap-4 rounded-3xl border border-teal-100 bg-gradient-to-br from-teal-50 to-cyan-50 px-5 py-4 shadow-sm transition active:scale-[0.98]"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-500 shadow-md shadow-teal-200">
              <Phone className="h-5 w-5 text-white" strokeWidth={2} />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-teal-700">สามารถติดต่อเราได้ที่</p>
              <p className="mt-0.5 text-xl font-extrabold tracking-wide text-teal-900">{orgPhone || "081-903-4686"}</p>
            </div>
            <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-teal-400" strokeWidth={2.5} />
          </a>
        </main>
      </div>
    );
  }

  // ─── 5. Inquiry submitted ───────────────────────────────────────────────────
    if (currentView === "inquiry_done") {
      const contactPhone = orgPhone || "081-903-4686";
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(160deg,#f0fdfa_0%,#fff_100%)] px-5 text-center">
        {/* Success icon */}
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-teal-500 shadow-[0_12px_32px_rgba(20,184,166,0.35)]">
          <BadgeCheck className="h-12 w-12 text-white" strokeWidth={1.8} />
        </div>

        <h1 className="mb-2 text-2xl font-extrabold text-slate-800">ส่งข้อมูลเรียบร้อย!</h1>
        <p className="mb-1 text-base text-slate-600">ทีมงาน T&Y Noodle ได้รับข้อมูลของคุณแล้ว</p>
        <p className="text-sm text-slate-500">เราจะติดต่อกลับหาคุณโดยด่วน</p>

        {/* Contact card */}
        <a
          href={`tel:${contactPhone.replace(/[-\s]/g, "")}`}
          className="mt-8 flex w-full max-w-xs items-center gap-4 rounded-3xl border border-teal-100 bg-gradient-to-br from-teal-50 to-cyan-50 px-5 py-4 shadow-sm transition active:scale-[0.98]"
        >
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-500 shadow-md shadow-teal-200">
            <Phone className="h-5 w-5 text-white" strokeWidth={2} />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold uppercase tracking-widest text-teal-700">หรือโทรหาเราได้เลย</p>
            <p className="mt-0.5 text-xl font-extrabold tracking-wide text-teal-900">{contactPhone}</p>
          </div>
          <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-teal-400" strokeWidth={2.5} />
        </a>

        {/* Close button */}
        <button
          type="button"
          onClick={handleReturnToLine}
          className="mt-4 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-[#003366] px-6 py-4 text-base font-bold text-white shadow-md transition active:scale-[0.97]"
        >
          กลับไปยัง LINE
        </button>
      </div>
      );
    }

    if (currentView === "pending_success") {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(160deg,#eff6ff_0%,#ffffff_100%)] px-5 text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-[#003366] shadow-[0_12px_32px_rgba(0,51,102,0.28)]">
            <BadgeCheck className="h-12 w-12 text-white" strokeWidth={1.8} />
          </div>
          <h1 className="mb-2 text-2xl font-extrabold text-slate-900">รับรายการสั่งซื้อแล้ว</h1>
          <p className="max-w-sm text-base leading-7 text-slate-600">
            ทางร้านได้รับการรายการออเดอร์ของคุณแล้ว จะรีบดำเนินการให้เร็วที่สุด ขอบคุณครับ
          </p>
          {pendingLineOrderId ? (
            <p className="mt-4 rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-500">
              รหัสรายการ: {pendingLineOrderId.slice(0, 8)}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setCurrentView("catalog")}
            className="mt-8 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl bg-[#003366] px-6 py-4 text-base font-bold text-white shadow-md transition active:scale-[0.97]"
          >
            กลับไปหน้ารายการสินค้า
          </button>
        </div>
      );
    }
  
    // Catalog + Cart + Success

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC] text-slate-900 font-sans pb-32 overflow-x-clip">
      <style>{`
        @keyframes slideInRight {
          0% { opacity: 0.72; transform: translate3d(100vw, 0, 0); }
          100% { opacity: 1; transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.58s cubic-bezier(0.19, 1, 0.22, 1) forwards;
          will-change: transform, opacity;
        }
        @keyframes modalSlideIn {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes modalSlideOut {
          from { transform: translateY(0); }
          to { transform: translateY(100%); }
        }
      `}</style>

      <div
        key={currentView}
        className={`flex-1 flex flex-col ${
          currentView === "catalog" ? "" : "animate-slide-in-right"
        }`}
      >
        {/* Header */}
      {currentView === "catalog" ? (
        <header className="relative bg-white shadow-sm">
          {/* ── Blurred profile banner (LINE / Spotify style) ── */}
          <div className="relative">

            {/* Banner — clipped container */}
              <div className="relative h-44 overflow-hidden md:h-60">

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
              <p className="absolute bottom-2.5 left-0 right-0 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">
                เส้นรังนก T&amp;Y Noodle
              </p>
            </div>

            {/* Avatar — straddles banner/white boundary (translate-y-1/2 = half overflows down) */}
            <div className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-1/2">
              <div className="relative h-[76px] w-[76px] overflow-hidden rounded-full shadow-xl ring-4 ring-white md:h-[96px] md:w-[96px]">
                {profile?.pictureUrl || linkedCustomer?.linePictureUrl ? (
                  <Image
                    src={
                      profile?.pictureUrl ??
                      linkedCustomer?.linePictureUrl ??
                      "/placeholders/profile-placeholder.svg"
                    }
                    alt={profile?.displayName ?? "โปรไฟล์"}
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
          {/* pt-11 leaves room for the mobile avatar while keeping the header compact. */}
          <div className="bg-white px-4 pb-4 pt-11 md:pb-5 md:pt-16">
            <div className="text-center">
              {!isReady && !linkedCustomer ? (
                <p className="text-sm text-slate-400 animate-pulse">กำลังโหลดข้อมูล...</p>
              ) : (
                <>
                    {linkedCustomer && (
                      <p className="text-[1.15rem] font-extrabold leading-snug tracking-tight text-slate-900 md:text-xl">
                        {linkedCustomer.name}
                      </p>
                    )}
                  {profile?.displayName && (
                    <p className="mt-1 text-sm text-slate-400">{profile.displayName}</p>
                  )}

                  <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[13px] font-bold text-slate-500 md:text-sm">
                    <span>ติดต่อสอบถามราคาได้ที่ :</span>
                    <Phone className="h-4 w-4 text-[#003366] shrink-0" strokeWidth={2.5} />
                    <a
                      href="tel:081-903-4686"
                      className="text-[#003366] hover:underline font-extrabold tracking-tight"
                    >
                      081-903-4686
                    </a>
                  </div>
                </>
              )}
            </div>
          </div>
          {/* Order status banner — scrolls away with header, not pinned */}
          <OrderStatusBanner
            allowOrderAfterCutoff={allowOrderAfterCutoff}
            closeTime={orderCloseTime}
            isOpen={isOrderOpen}
            openTime={orderOpenTime}
          />
        </header>
      ) : currentView === "cart" ? (
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 bg-white/80 px-4 py-3 backdrop-blur-md" style={{ transform: "translateZ(0)" }}>
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
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-100 bg-white px-4 py-3" style={{ transform: "translateZ(0)" }}>
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

      {/* ── Sticky search + category drawer + tabs (catalog only) ── */}
      {currentView === "catalog" && (
        <div className="sticky top-0 z-[80] bg-white shadow-sm">
          {/* Search bar */}
          <div className="px-4 pb-1.5 pt-2">
            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1 rounded-lg border border-slate-200 bg-white shadow-sm">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Search className="h-[17px] w-[17px] text-[#003366]/55" />
                </span>
                <input
                  aria-label="Search products"
                  className="w-full rounded-lg border border-transparent bg-transparent py-1.5 pl-10 pr-9 text-sm font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[#003366]/20 focus:ring-2 focus:ring-[#003366]/10 md:text-base"
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

              <CatalogCategoryDrawer
                categories={categoryOptions}
                selectedCategory={selectedProductCategory}
                onSelectCategory={setSelectedProductCategory}
              />
            </div>
          </div>

          {/* Tabs: สินค้า / รายการโปรด / สั่งซ้ำ */}
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
                <RotateCcw className="h-4 w-4" />
                สั่งซ้ำ
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
          <CatalogView
            activeCategory={activeCategory}
            cart={cart}
            favorites={favorites}
            frequentProductCards={frequentProductCards}
            getDisplayUnit={getDisplayUnit}
            gridProducts={gridProducts}
            isOrderOpen={isOrderOpen}
            onAddFrequentProduct={addProductToCart}
            onOpenProduct={openProductModal}
            onRepeatOrderAll={repeatYesterdayOrder}
            onToggleFavorite={toggleFavorite}
            repeatOrderCards={repeatOrderCards}
          />
        ) : currentView === "success" ? (
          <OrderSuccessView
            highlightedHistoryOrderId={highlightedHistoryOrderId}
            isSavingImage={isSavingImage}
            lastOrderMeta={lastOrderMeta}
            linkedCustomerName={linkedCustomer?.name ?? ""}
            onBackToCatalog={() => setCurrentView("catalog")}
            onOpenOrderHistory={openOrderHistory}
            onSaveReceiptAsImage={saveReceiptAsImage}
            receiptCardRef={receiptCardRef}
          />
        ) : currentView === "history" ? (
          <OrderHistoryView
            customerId={linkedCustomer?.id ?? ""}
            formatOrderTimestamp={formatOrderTimestamp}
            getOrderEditMeta={(orderDate, status) =>
              getBangkokOrderEditMeta({
                allowOrderAfterCutoff,
                closeTime: orderCloseTime,
                orderDate,
                status,
              })
            }
            highlightedHistoryOrderId={highlightedHistoryOrderId}
            isOrderOpen={isOrderOpen}
            isPending={isPending}
            onOpenEditOrder={openEditOrder}
            onReorder={handleReorder}
            onShowReceipt={(order) => {
              setReceiptOrder(order);
              setReceiptImageUrl(null);
            }}
            orderHistory={orderHistory}
            productsByLookupKey={productsByLookupKey}
          />
        ) : currentView === "edit_order" ? (
          <OrderEditView
            editCart={editCart}
            editingOrder={editingOrder}
            getDisplayUnit={getDisplayUnit}
            isPending={isPending}
            onBackToHistory={() => openOrderHistory(editingOrder?.id ?? null)}
            onOpenAddProductSheet={() => {
              setAddProductSearch("");
              setShowAddProductSheet(true);
            }}
            onSaveEditedOrder={handleSaveEditedOrder}
            onUpdateEditQuantity={updateEditQuantity}
            productsById={productsById}
          />
        ) : currentView === "profile" ? (
          <OrderProfileView
            linkedCustomer={linkedCustomer}
            onLogout={handleLogout}
            profile={profile}
          />
        ) : (
          <OrderCartView
            cart={cart}
            onBackToCatalog={() => setCurrentView("catalog")}
            onUpdateQuantity={updateQuantity}
            productsById={productsById}
          />
        )}

      </main>
      </div>

      {showAddProductSheet && (
        <EditOrderProductSheet
          addProductSearch={addProductSearch}
          editCart={editCart}
          getDisplayUnit={getDisplayUnit}
          isOpen={showAddProductSheet}
          onClose={() => setShowAddProductSheet(false)}
          onSetAddProductSearch={setAddProductSearch}
          onUpdateEditQuantity={updateEditQuantity}
          products={products}
        />
      )}

      {(receiptOrder || receiptImageUrl) && (
        <OrderReceiptModals
          isSavingImage={isSavingImage}
          linkedCustomerName={linkedCustomer?.name ?? ""}
          onCloseReceipt={() => {
            setReceiptOrder(null);
            setReceiptImageUrl(null);
          }}
          onCloseReceiptImage={() => setReceiptImageUrl(null)}
          onSaveReceiptAsImage={saveReceiptAsImage}
          receiptCardRef={receiptCardRef}
          receiptImageUrl={receiptImageUrl}
          receiptOrder={receiptOrder}
        />
      )}

      <OrderBottomShell
        currentView={currentView}
        isPending={isPending}
        onCheckout={handleCheckout}
        onGoCatalog={() => setCurrentView("catalog")}
        onGoCart={() => setCurrentView("cart")}
        onGoHistory={() => openOrderHistory(highlightedHistoryOrderId)}
        onGoProfile={() => setCurrentView("profile")}
        onScrollTop={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        showScrollTop={showScrollTop}
        totalItems={totalItems}
      />

      {selectedProduct && (
        <ProductDetailModal
          favorites={favorites}
          getDisplayUnit={getDisplayUnit}
          isModalOpen={isModalOpen}
          isOrderOpen={isOrderOpen}
          isShareMenuOpen={isShareMenuOpen}
          loadedModalImageKeys={loadedModalImageKeys}
          modalCartBtnRef={modalCartBtnRef}
          modalImageTrackRef={modalImageTrackRef}
          modalImageViewportRef={modalImageViewportRef}
          modalRecommendationIndex={modalRecommendationIndex}
          modalRecommendationPageCount={modalRecommendationPageCount}
          modalRecommendations={modalRecommendations}
          modalRecommendationsRef={modalRecommendationsRef}
          modalStepperRef={modalStepperRef}
          onAddToCart={addModalItemsToCart}
          onCloseModal={closeProductModal}
          onCopyShareLink={() => void copyShareLink()}
          onJumpToProduct={jumpToProduct}
          onMarkModalImageLoaded={markModalImageLoaded}
          onOpenCart={() => {
            closeProductModal();
            setCurrentView("cart");
          }}
          onRecommendationScroll={handleRecommendationScroll}
          onSelectImage={(imageIndex) => setModalImageIndex(selectedProduct.id, imageIndex)}
          onShareFacebook={() => openShareWindow("facebook")}
          onShareLine={() => openShareWindow("line")}
          onToggleFavorite={() => toggleFavorite(selectedProduct.id)}
          onToggleShareMenu={() => {
            setShareFeedback("");
            setIsShareMenuOpen((prev) => !prev);
          }}
          onTouchEnd={onTouchEnd}
          onTouchMove={onTouchMove}
          onTouchStart={onTouchStart}
          organizationId={organizationId}
          selectedProduct={selectedProduct}
          selectedProductImageIndex={selectedProductImageIndex}
          selectedProductImageSlides={selectedProductImageSlides}
          selectedProductImages={selectedProductImages}
          shareFeedback={shareFeedback}
          shareMenuRef={shareMenuRef}
          totalItems={totalItems}
        />
      )}

      {/* iOS Receipt Image Popup */}
      {isReceiptPopupOpen && receiptPopupUrl && createPortal(
        <div className="fixed inset-0 z-[500] flex flex-col bg-[#0a0c10] animate-in fade-in duration-300">
          {/* ─── Premium Glassmorphism Header ─── */}
          <div className="sticky top-0 z-50 flex shrink-0 items-center justify-between border-b border-white/5 bg-[#12151c]/80 px-4 py-3 backdrop-blur-xl sm:px-8 sm:py-5">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#003366] text-white shadow-[0_0_20px_rgba(0,51,102,0.4)] sm:h-12 sm:w-12">
                <ImageIcon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black tracking-tight text-white sm:text-xl">ตัวอย่างใบเสร็จ</h3>
                <div className="flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="truncate text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 sm:text-xs">
                    พร้อมบันทึก 1 หน้า
                  </p>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 sm:gap-4">
              <button
                onClick={handleDownloadReceipt}
                className="hidden items-center gap-2.5 rounded-xl bg-white px-5 py-2.5 text-sm font-black text-[#0a0c10] shadow-[0_8px_20px_rgba(255,255,255,0.15)] transition hover:bg-slate-100 active:scale-95 sm:flex"
              >
                <Download className="h-4.5 w-4.5" strokeWidth={3} />
                บันทึกลงเครื่อง
              </button>
              <button
                onClick={closeReceiptPopup}
                className="group flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/50 transition hover:bg-rose-500/10 hover:text-rose-500 active:scale-95 sm:h-12 sm:w-12"
              >
                <X className="h-6 w-6 transition group-hover:rotate-90" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* ─── Scrollable Preview Body ─── */}
          <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_center,rgba(0,51,102,0.05)_0%,transparent_70%)] p-6 sm:p-12">
            <div className="mx-auto flex flex-col items-center gap-12 sm:gap-20">
              <div className="group relative flex flex-col items-center">
                {/* Document Container */}
                <div className="relative overflow-hidden rounded-sm bg-white shadow-[0_40px_100px_rgba(0,0,0,0.6)] ring-1 ring-white/5 transition duration-500 group-hover:scale-[1.02] group-hover:shadow-[0_50px_120px_rgba(0,0,0,0.8)]">
                  <Image
                    src={receiptPopupUrl}
                    alt="Receipt"
                    width={794}
                    height={1123}
                    unoptimized
                    className="h-auto w-full max-w-[210mm] bg-white sm:w-[500px]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
                </div>
              </div>
            </div>
          </div>

          {/* ─── Modern Mobile Navigation ─── */}
          <div className="border-t border-white/5 bg-[#12151c]/90 p-4 pb-safe-offset-4 backdrop-blur-xl sm:hidden">
            <button
              onClick={handleDownloadReceipt}
              className="flex w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 py-4 text-lg font-black text-white shadow-[0_15px_30px_rgba(255,255,255,0.1)] active:scale-95 transition"
            >
              <Download className="h-6 w-6 text-white" strokeWidth={3} />
              บันทึกลงเครื่อง
            </button>
          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

