"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Gem,
  Info,
  Link2,
  Package,
  Phone,
  Search,
  Share2,
  Stamp,
  Truck,
  X,
} from "lucide-react";
import { CatalogCategoryDrawer } from "@/app/order/customer/components/catalog-category-drawer";
import { ScrollToTopButton } from "@/components/ui/scroll-to-top-button";
import { formatDisplayUnit } from "@/app/order/customer/unit-label";
import type { ProductWithImage } from "@/app/order/customer/types";

type MenuClientProps = {
  initialProducts: ProductWithImage[];
  orgPhone: string;
  categories: { id: string; name: string }[];
};

export default function MenuClient({
  initialProducts,
  orgPhone,
  categories,
}: MenuClientProps) {
  const searchParams = useSearchParams();

  // Share overlay states
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [shareFeedback, setShareFeedback] = useState("");
  const shareMenuRef = useRef<HTMLDivElement | null>(null);

  // Search and Category states
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductCategory, setSelectedProductCategory] = useState<"all" | string>("all");

  const categoryOptions = useMemo(() => {
    return categories.map((c) => ({ id: c.id, name: c.name }));
  }, [categories]);

  // Filtering products
  const gridProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return initialProducts.filter((product) => {
      // Category filter
      if (selectedProductCategory !== "all" && !product.categoryIds.includes(selectedProductCategory)) {
        return false;
      }
      // Query search
      if (query) {
        const matchName = product.name.toLowerCase().includes(query);
        const matchSku = product.sku?.toLowerCase().includes(query) ?? false;
        return matchName || matchSku;
      }
      return true;
    });
  }, [initialProducts, searchQuery, selectedProductCategory]);

  const gridProductIndexById = useMemo(() => {
    return new Map(gridProducts.map((p, idx) => [p.product_id, idx]));
  }, [gridProducts]);

  // Modal states
  const [selectedProductIndex, setSelectedProductIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const closeModalTimerRef = useRef<number | null>(null);

  // Selected Product Computed
  const selectedProductBase = useMemo(() => {
    return selectedProductIndex === null ? null : gridProducts[selectedProductIndex] ?? null;
  }, [gridProducts, selectedProductIndex]);

  const selectedProduct = useMemo(() => {
    if (!selectedProductBase) return null;
    const unitId = selectedUnitId || selectedProductBase.product_sale_unit_id;
    const saleUnit = selectedProductBase.product_sale_units?.find((u) => u.id === unitId);
    if (!saleUnit) return selectedProductBase;
    return {
      ...selectedProductBase,
      id: `${selectedProductBase.product_id}:${saleUnit.id}`,
      sale_unit_label: saleUnit.unit_label,
      sale_unit_ratio: Number(saleUnit.base_unit_quantity),
      min_order_qty: Number(saleUnit.min_order_qty ?? 1),
      step_order_qty: saleUnit.step_order_qty !== null ? Number(saleUnit.step_order_qty) : null,
    };
  }, [selectedProductBase, selectedUnitId]);

  // Modal Image Swipe
  const [modalImageIndexes, setModalImageIndexes] = useState<Record<string, number>>({});
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const touchCurrentXRef = useRef<number | null>(null);
  const isImageDraggingRef = useRef(false);
  const isHorizontalImageSwipeRef = useRef(false);
  const minSwipeDistance = 56;

  const modalImageViewportRef = useRef<HTMLDivElement | null>(null);
  const modalImageTrackRef = useRef<HTMLDivElement | null>(null);

  const selectedProductImages = useMemo(() => {
    return selectedProduct?.product_images ?? [];
  }, [selectedProduct]);

  const selectedProductImageSlides = useMemo(() => {
    if (selectedProductImages.length > 0) {
      return selectedProductImages.map((image) => ({
        id: image.public_url,
        public_url: image.public_url,
      }));
    }
    return [
      {
        id: `${selectedProduct?.id ?? "placeholder"}-placeholder`,
        public_url: "/placeholders/product-placeholder.svg",
      },
    ];
  }, [selectedProduct?.id, selectedProductImages]);

  const selectedProductImageIndex = useMemo(() => {
    if (!selectedProduct) return 0;
    return Math.min(
      modalImageIndexes[selectedProduct.product_id] ?? 0,
      Math.max(selectedProductImages.length - 1, 0)
    );
  }, [selectedProduct, modalImageIndexes, selectedProductImages]);

  const syncModalImageTrack = useCallback((index: number, durationMs: number, forceInstant = false) => {
    const viewport = modalImageViewportRef.current;
    const track = modalImageTrackRef.current;
    if (!viewport || !track) return;
    const width = viewport.clientWidth;
    const translateX = -index * width;
    const withTransition = durationMs > 0 && !forceInstant;
    track.style.transition = withTransition
      ? "transform 340ms cubic-bezier(0.22, 1, 0.36, 1)"
      : "none";
    track.style.transform = `translate3d(${translateX}px, 0, 0)`;
    track.style.willChange = withTransition ? "auto" : "transform";
  }, []);

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
      const newIndex = distance > 0
        ? (currentIndex + 1) % imageCount
        : (currentIndex - 1 + imageCount) % imageCount;
      setModalImageIndex(selectedProduct.product_id, newIndex);
    }
    isImageDraggingRef.current = false;
    isHorizontalImageSwipeRef.current = false;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    touchCurrentXRef.current = null;
  };

  useEffect(() => {
    if (!selectedProduct || !isModalOpen) return;
    syncModalImageTrack(selectedProductImageIndex, 0, true);
  }, [selectedProduct, selectedProductImageIndex, isModalOpen, syncModalImageTrack]);

  useEffect(() => {
    if (!selectedProduct || !isModalOpen) return;
    const handleResize = () => syncModalImageTrack(selectedProductImageIndex, 0, false);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isModalOpen, selectedProduct, selectedProductImageIndex, syncModalImageTrack]);

  // Modal open and close handlers
  const openProductModal = useCallback((productId: string) => {
    const idx = gridProductIndexById.get(productId);
    if (idx === undefined) return;
    if (closeModalTimerRef.current !== null) {
      window.clearTimeout(closeModalTimerRef.current);
      closeModalTimerRef.current = null;
    }
    setIsShareMenuOpen(false);
    setShareFeedback("");
    setSelectedProductIndex(idx);
    setSelectedUnitId(null);
    setIsModalOpen(true);
  }, [gridProductIndexById]);

  const closeProductModal = useCallback(() => {
    setIsModalOpen(false);
    setIsShareMenuOpen(false);
    setShareFeedback("");
    if (closeModalTimerRef.current !== null) {
      window.clearTimeout(closeModalTimerRef.current);
    }
    closeModalTimerRef.current = window.setTimeout(() => {
      setSelectedProductIndex(null);
      closeModalTimerRef.current = null;
    }, 500);
  }, []);

  const jumpToProduct = useCallback((productId: string) => {
    const idx = gridProductIndexById.get(productId);
    if (idx === undefined) return;
    setIsShareMenuOpen(false);
    setShareFeedback("");
    setSelectedProductIndex(idx);
    setSelectedUnitId(null);
    setIsModalOpen(true);
  }, [gridProductIndexById]);

  // Recommendations computed (5 other items)
  const modalRecommendations = useMemo(() => {
    if (!selectedProduct) return [];
    return gridProducts
      .filter((p) => p.product_id !== selectedProduct.product_id)
      .slice(0, 5);
  }, [gridProducts, selectedProduct]);

  // Scroll to top states
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const scrollY = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
      setShowScrollTop(scrollY > 300);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // URL syncing
  useEffect(() => {
    const urlProductId = searchParams.get("product");
    if (urlProductId) {
      const idx = gridProductIndexById.get(urlProductId);
      if (idx !== undefined) {
        const timer = setTimeout(() => {
          setSelectedProductIndex(idx);
          setIsModalOpen(true);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [searchParams, gridProductIndexById]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (selectedProductBase && isModalOpen) {
      url.searchParams.set("product", selectedProductBase.product_id);
      window.history.replaceState({}, "", url.toString());
    } else {
      if (url.searchParams.has("product")) {
        url.searchParams.delete("product");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [isModalOpen, selectedProductBase]);

  const copyShareLink = useCallback(() => {
    if (!selectedProduct) return;
    const shareUrl = `${window.location.origin}/menu?product=${encodeURIComponent(selectedProduct.product_id)}`;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setShareFeedback("คัดลอกลิงก์เรียบร้อยแล้ว!");
        setIsShareMenuOpen(false);
        setTimeout(() => setShareFeedback(""), 3000);
      })
      .catch(() => {
        setShareFeedback("ไม่สามารถคัดลอกลิงก์ได้");
      });
  }, [selectedProduct]);

  const shareLine = useCallback(() => {
    if (!selectedProduct) return;
    const shareUrl = `${window.location.origin}/menu?product=${encodeURIComponent(selectedProduct.product_id)}`;
    const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(`${selectedProduct.name} - ${shareUrl}`)}`;
    window.open(lineUrl, "_blank");
    setIsShareMenuOpen(false);
  }, [selectedProduct]);

  const shareFacebook = useCallback(() => {
    if (!selectedProduct) return;
    const shareUrl = `${window.location.origin}/menu?product=${encodeURIComponent(selectedProduct.product_id)}`;
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(fbUrl, "_blank");
    setIsShareMenuOpen(false);
  }, [selectedProduct]);

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

  // Metadata labels
  const brand = (selectedProduct?.metadata as Record<string, string>)?.brand ?? "";
  const category = selectedProduct?.categoryNames.join(", ") ?? "";
  const description = (selectedProduct?.metadata as Record<string, string>)?.description ?? "";
  const hasMinimumOrder = selectedProduct ? selectedProduct.min_order_qty > 1 : false;
  const hasContent = brand || category || description;

  return (
    <div className="flex flex-col min-h-screen bg-[#F8FAFC] text-slate-900 font-sans pb-24 overflow-x-clip">
      <style>{`
        @keyframes modalSlideIn {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes modalSlideOut {
          from { transform: translateY(0); }
          to { transform: translateY(100%); }
        }
      `}</style>

      {/* ─── Premium Glassmorphism Header ─── */}
      <header className="relative bg-white shadow-sm">
        {/* Banner Image Container */}
        <div className="relative h-44 overflow-hidden md:h-60">
          <Image
            src="/brand/original.jpg"
            alt="T&Y Noodle Banner"
            fill
            sizes="100vw"
            className="object-cover object-center"
            priority
          />
          <div className="absolute inset-0 bg-black/45" />
          <p className="absolute bottom-2.5 left-0 right-0 text-center text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">
            เส้นรังนก T&amp;Y Noodle
          </p>
        </div>

        {/* Center Store Logo Avatar */}
        <div className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-1/2">
          <div className="relative h-[76px] w-[76px] overflow-hidden rounded-full shadow-xl ring-4 ring-white md:h-[96px] md:w-[96px] bg-white">
            <Image
              src="/brand/logo.png"
              alt="T&Y Noodle Logo"
              fill
              sizes="96px"
              className="object-contain p-2"
              priority
            />
          </div>
        </div>
      </header>

      {/* Info Section under Logo */}
      <section className="bg-white px-4 pb-4 pt-11 md:pb-5 md:pt-16">
        <div className="text-center">
          <p className="text-[1.15rem] font-extrabold leading-snug tracking-tight text-slate-900 md:text-xl">
            เส้นรังนก T&amp;Y Noodle
          </p>

          <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[13px] font-black text-[#003366] md:text-sm">
            <span>ติดต่อสอบถามราคาได้ที่ :</span>
            <Phone className="h-4 w-4 text-[#003366] shrink-0" strokeWidth={3} />
            <a
              href={`tel:${orgPhone}`}
              className="text-[#003366] hover:underline font-black tracking-tight"
            >
              {orgPhone}
            </a>
          </div>
        </div>
      </section>

      {/* Sticky Search bar + Category selector */}
      <div className="sticky top-0 z-[80] bg-white shadow-sm">
        <div className="px-4 pb-3 pt-3">
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
      </div>

      {/* Product Grid Content */}
      <main className="mx-auto flex-1 w-full max-w-[1600px] px-3 pt-2 pb-6 sm:px-5 md:px-6 lg:px-8 xl:px-10">
        {gridProducts.length === 0 ? (
          <div className="py-10 text-center text-slate-500">ไม่พบสินค้าที่คุณค้นหา</div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-3.5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-5 lg:grid-cols-4 lg:gap-x-5 xl:grid-cols-5 2xl:grid-cols-6">
            {gridProducts.map((product) => {
              const imageUrl = product.product_images?.[0]?.public_url || "/placeholders/product-placeholder.svg";
              return (
                <article
                  key={product.id}
                  className="flex flex-col overflow-hidden rounded-lg bg-white shadow-[0_10px_28px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/5 transition-transform active:scale-98 md:rounded-xl cursor-pointer"
                  onClick={() => openProductModal(product.product_id)}
                  style={{
                    contain: "layout paint",
                    contentVisibility: "auto",
                    containIntrinsicSize: "320px 420px",
                  }}
                >
                  <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-t-lg bg-white px-2 pb-2 pt-3 md:rounded-t-xl md:px-2.5 md:pb-2.5 md:pt-3.5">
                    <div className="relative h-full w-full">
                      <Image
                        src={imageUrl}
                        alt={product.name}
                        fill
                        sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1535px) 25vw, 17vw"
                        className="object-contain object-center"
                      />
                    </div>
                  </div>

                  <div className="flex min-w-0 flex-grow flex-col justify-between px-3 pb-3 pt-3 md:px-3.5 md:pt-3.5">
                    <h3 className="text-left text-[0.84rem] font-bold leading-5 text-slate-900 line-clamp-2 md:text-[0.82rem] md:leading-[1.35rem]">
                      {product.name}
                    </h3>
                    <p className="mt-1.5 text-left text-[11px] font-semibold text-slate-400">
                      หน่วย: {formatDisplayUnit(product.sale_unit_label)}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Scroll to Top */}
      <ScrollToTopButton onScrollTop={handleScrollTop} show={showScrollTop} />

      {/* ─── Product Detail Modal ─── */}
      {selectedProduct && (
        <div
          className="fixed inset-0 z-[100] flex min-h-0 flex-col bg-white"
          style={{
            animation: isModalOpen
              ? "modalSlideIn 320ms cubic-bezier(0.25,1,0.5,1) forwards"
              : "modalSlideOut 280ms cubic-bezier(0.4,0,1,1) forwards",
            willChange: "transform",
          }}
        >
          {/* Modal Header */}
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-[#00264d] bg-[#003366] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white shadow-[0_10px_30px_rgba(0,51,102,0.22)]">
            <button
              onClick={closeProductModal}
              className="flex h-10 w-10 items-center justify-center rounded-full text-white/90 transition-all active:scale-90 hover:bg-white/10"
              aria-label="ปิดหน้ารายละเอียด"
            >
              <X className="h-6 w-6" strokeWidth={2} />
            </button>
            <h2 className="max-w-[200px] truncate text-[15px] font-bold text-white">
              รายละเอียดสินค้า
            </h2>
            <div ref={shareMenuRef} className="relative flex gap-1">
              <button
                onClick={() => setIsShareMenuOpen((prev) => !prev)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-white/85 transition-all active:scale-90 hover:bg-white/10"
                aria-label="แชร์สินค้า"
              >
                <Share2 className="h-5.5 w-5.5" strokeWidth={2} />
              </button>

              {isShareMenuOpen && (
                <div className="absolute right-0 top-12 z-30 w-52 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 shadow-[0_20px_40px_rgba(15,23,42,0.18)]">
                  <button
                    type="button"
                    onClick={copyShareLink}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50"
                  >
                    <Link2 className="h-4.5 w-4.5 text-[#003366]" strokeWidth={2} />
                    <span>คัดลอกลิงก์</span>
                  </button>
                  <button
                    type="button"
                    onClick={shareLine}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50"
                  >
                    <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#06C755] text-[9px] font-black text-white text-center">
                      L
                    </span>
                    <span>แชร์ไป LINE</span>
                  </button>
                  <button
                    type="button"
                    onClick={shareFacebook}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-slate-50"
                  >
                    <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-[#1877F2] text-[9px] font-black text-white text-center">
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

          {/* Modal Content Scroll */}
          <div
            id="product-modal-carousel"
            className="relative min-h-0 flex-1 overflow-y-auto bg-slate-50 pb-6 no-scrollbar"
          >
            <div
              key={selectedProduct.id}
              className="min-h-full"
              style={{ contentVisibility: "auto", containIntrinsicSize: "900px" }}
            >
              {/* Product Images Area */}
              <div className="bg-white px-4 pb-6 pt-4 shadow-[0_16px_38px_rgba(15,23,42,0.10)]">
                <div className="mx-auto max-w-[520px] flex flex-col gap-3">
                  <div className="relative overflow-hidden rounded-[1.5rem]">
                    <div
                      ref={modalImageViewportRef}
                      className="relative aspect-square w-full overflow-hidden"
                      onTouchStart={onTouchStart}
                      onTouchMove={onTouchMove}
                      onTouchEnd={onTouchEnd}
                      style={{ touchAction: "pan-y" }}
                    >
                      <div
                        ref={modalImageTrackRef}
                        className="flex h-full"
                        style={{ width: `${Math.max(selectedProductImageSlides.length, 1) * 100}%` }}
                      >
                        {selectedProductImageSlides.map((image, imageIndex) => {
                          const loadKey = `${selectedProduct.id}:${image.id}:${imageIndex}`;
                          return (
                            <div
                              key={loadKey}
                              className="relative h-full shrink-0"
                              style={{ width: `${100 / Math.max(selectedProductImageSlides.length, 1)}%` }}
                            >
                              <Image
                                src={image.public_url}
                                alt={`${selectedProduct.name} - ${imageIndex + 1}`}
                                fill
                                priority={imageIndex === selectedProductImageIndex}
                                sizes="(max-width: 767px) 100vw, 520px"
                                className="object-contain"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="absolute right-3 top-3 rounded-full bg-slate-950/70 px-3 py-1 text-xs font-bold text-white">
                      {selectedProductImageIndex + 1}/{Math.max(selectedProductImages.length, 1)}
                    </div>
                  </div>

                  {/* Image Thumbnails if more than 1 image */}
                  {selectedProductImages.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {selectedProductImages.map((img, imageIndex) => {
                        const isActiveImage = imageIndex === selectedProductImageIndex;
                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setModalImageIndex(selectedProduct.product_id, imageIndex)}
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

                  {/* Title and details */}
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2 text-[13px] font-bold text-slate-800">
                      <Package className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                      <span>ชื่อสินค้า</span>
                      <span className="h-4 w-px bg-slate-300" aria-hidden="true" />
                      <span className="text-[12px] font-semibold text-slate-500">
                        หน่วย: {formatDisplayUnit(selectedProduct.sale_unit_label)}
                      </span>
                      {hasMinimumOrder ? (
                        <>
                          <span className="h-4 w-px bg-slate-300" aria-hidden="true" />
                          <span className="text-[12px] font-semibold text-slate-500">
                            สั่งซื้อขั้นต่ำ: {selectedProduct.min_order_qty}{" "}
                            {formatDisplayUnit(selectedProduct.sale_unit_label)}
                          </span>
                        </>
                      ) : null}
                    </div>
                    <h1 className="text-[22px] font-extrabold leading-tight text-slate-900">
                      {selectedProduct.name}
                    </h1>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <TrustBadge icon={Truck} label="พร้อมส่ง" />
                      <TrustBadge icon={Gem} label="คัดคุณภาพ" />
                      <TrustBadge icon={Stamp} label="มาตรฐานร้านค้า" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Product description / brand info */}
              {hasContent ? (
                <div className="mt-2 bg-white px-6 py-5 shadow-[0_16px_38px_rgba(15,23,42,0.10)]">
                  <h3 className="mb-3 flex items-center gap-2 text-[13px] font-bold text-slate-800">
                    <Info className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                    <span>รายละเอียดสินค้า</span>
                  </h3>
                  <div className="space-y-3">
                    {(brand || category) && (
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
                        {brand && (
                          <p className="text-[13px] font-semibold text-[#003366] underline decoration-[#003366] decoration-1 underline-offset-1">
                            <span>แบรนด์:</span> {brand}
                          </p>
                        )}
                        {brand && category ? (
                          <span className="h-4 w-px bg-[#003366]/55" aria-hidden="true" />
                        ) : null}
                        {category && (
                          <p className="text-[13px] font-semibold text-[#003366] underline decoration-[#003366] decoration-1 underline-offset-1">
                            <span>หมวดหมู่:</span> {category}
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
              ) : null}

              {/* Recommendations slider */}
              {modalRecommendations.length > 0 && (
                <div className="mt-2 bg-white px-6 py-5 shadow-[0_16px_38px_rgba(15,23,42,0.10)]">
                  <h3 className="mb-5 flex items-center gap-2 text-[13px] font-bold text-slate-800">
                    <Package className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                    <span>สินค้าเพิ่มเติม</span>
                  </h3>
                  <div className="-mx-2 flex gap-4 overflow-x-auto px-2 pb-4 no-scrollbar">
                    {modalRecommendations.map((product) => (
                      <button
                        key={product.product_id}
                        onClick={() => jumpToProduct(product.product_id)}
                        className="group w-28 flex-shrink-0"
                      >
                        <div className="relative mb-2 aspect-square w-full overflow-hidden rounded-xl border border-slate-100 bg-white p-1">
                          <Image
                            src={
                              product.product_images?.[0]?.public_url ||
                              "/placeholders/product-placeholder.svg"
                            }
                            alt={product.name}
                            fill
                            sizes="112px"
                            className="object-contain object-center"
                          />
                        </div>
                        <p className="line-clamp-2 text-[11px] font-bold leading-tight text-slate-700 text-left">
                          {product.name}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Modal Footer (Premium full width close button) */}
          <div className="z-30 border-t border-slate-100 bg-white px-4 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
            <div className="mx-auto max-w-lg">
              <button
                onClick={closeProductModal}
                className="w-full flex items-center justify-center h-12 rounded-xl bg-[#003366] text-white font-black shadow-[0_8px_20px_rgba(0,51,102,0.15)] transition-all active:scale-[0.97]"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TrustBadge({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
}) {
  return (
    <span className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[11px] font-bold leading-none text-slate-700 shadow-[0_5px_14px_rgba(15,23,42,0.05)]">
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] bg-[#003366] text-white">
        <Icon className="h-3 w-3" strokeWidth={2.4} />
      </span>
      <span className="min-w-0 whitespace-nowrap">{label}</span>
    </span>
  );
}
