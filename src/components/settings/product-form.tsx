"use client";

import Image from "next/image";
import { startTransition, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Barcode,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  ImagePlus,
  Loader2,
  Package2,
  Save,
  Trash2,
  Warehouse,
  X,
} from "lucide-react";
import {
  createProductFormAction,
  updateProductFormAction,
  type ProductSubmitActionState,
} from "@/app/dashboard/settings/actions";
import {
  settingsFieldLabelClass,
  settingsInputClass,
  settingsSelectClass,
} from "@/components/settings/settings-ui";
import {
  getEffectiveSaleUnitCost,
  type SaleUnitCostMode,
} from "@/lib/products/sale-unit-cost";
import type { SettingsProduct, SettingsProductCategory } from "@/lib/settings/admin";

type ProductFormProps = {
  categories: SettingsProductCategory[];
  editingProduct?: SettingsProduct | null;
  nextSku: string;
  productList?: SettingsProduct[];
  returnHref: string;
};

type OrderPreset = "free" | "integer" | "custom";
const MAX_PRODUCT_IMAGES = 5;
const MAX_IMAGE_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Compress an image file client-side before upload.
// Resizes to max 1200px on the longest side and re-encodes as JPEG 0.85.
// Skips small files (≤300 KB) and falls back to the original on any error.
async function compressImageFile(file: File): Promise<File> {
  if (file.size <= 300 * 1024) return file;
  return new Promise<File>((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX_SIDE = 1200;
      let { width, height } = img;
      if (width > MAX_SIDE || height > MAX_SIDE) {
        if (width >= height) {
          height = Math.round((height * MAX_SIDE) / width);
          width = MAX_SIDE;
        } else {
          width = Math.round((width * MAX_SIDE) / height);
          height = MAX_SIDE;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
        },
        "image/jpeg",
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}
const INTEGER_ORDER_PRESET_QTY = 5;
const SWIPE_THRESHOLD = 60;
const initialProductSubmitActionState: ProductSubmitActionState = {
  message: "",
  status: "idle",
};

type SaleUnitDraft = {
  baseUnitQuantity: string;
  costMode: SaleUnitCostMode;
  fixedCostPrice: string;
  id: string;
  key: string;
  label: string;
  minOrderQty: string;
  orderPreset: OrderPreset;
  stepOrderQty: string;
};

function deriveOrderPreset(min: number, step: number | null): OrderPreset {
  if (step === null && min === 1) return "free";
  if (step === INTEGER_ORDER_PRESET_QTY && min === INTEGER_ORDER_PRESET_QTY) return "integer";
  return "custom";
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner form body — remounts via `key` when navigating between products
// ─────────────────────────────────────────────────────────────────────────────
type ProductFormBodyProps = {
  categories: SettingsProductCategory[];
  editingProduct: SettingsProduct | null;
  nextSku: string;
  onClose: () => void;
  onPendingChange?: (pending: boolean) => void;
  onSubmitSuccess: () => void;
};

function ProductFormBody({
  categories,
  editingProduct,
  nextSku,
  onClose,
  onPendingChange,
  onSubmitSuccess,
}: ProductFormBodyProps) {
  const formId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [cameraError, setCameraError] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [baseUnit, setBaseUnit] = useState(editingProduct?.baseUnit ?? "kg");
  const [baseCostPrice, setBaseCostPrice] = useState(
    editingProduct ? String(editingProduct.costPrice) : "",
  );
  const [saleUnits, setSaleUnits] = useState<SaleUnitDraft[]>(
    editingProduct?.saleUnits.length
      ? editingProduct.saleUnits.map((saleUnit) => ({
        baseUnitQuantity: String(saleUnit.baseUnitQuantity),
        costMode: saleUnit.costMode,
        fixedCostPrice:
          saleUnit.fixedCostPrice === null ? "" : String(saleUnit.fixedCostPrice),
        id: saleUnit.id,
        key: saleUnit.id,
        label: saleUnit.label,
        minOrderQty: String(saleUnit.minOrderQty),
        orderPreset: deriveOrderPreset(saleUnit.minOrderQty, saleUnit.stepOrderQty),
        stepOrderQty: saleUnit.stepOrderQty !== null ? String(saleUnit.stepOrderQty) : "",
      }))
      : [
        {
          baseUnitQuantity: "1",
          costMode: "derived",
          fixedCostPrice: "",
          id: "",
          key: crypto.randomUUID(),
          label: editingProduct?.baseUnit ?? "kg",
          minOrderQty: String(INTEGER_ORDER_PRESET_QTY),
          orderPreset: "integer" as OrderPreset,
          stepOrderQty: String(INTEGER_ORDER_PRESET_QTY),
        },
      ],
  );
  const [brand, setBrand] = useState(editingProduct?.brand ?? "");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    editingProduct?.categoryIds[0] ?? "",
  );
  const [description, setDescription] = useState(editingProduct?.description ?? "");

  const isEditing = editingProduct !== null;
  const skuValue = isEditing ? (editingProduct?.sku ?? "") : nextSku;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);

  const [keptExistingUrls, setKeptExistingUrls] = useState<string[]>(
    editingProduct?.imageUrls ?? [],
  );
  const [prioritizeNewImages, setPrioritizeNewImages] = useState(false);

  const previews = useMemo(
    () =>
      files.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
        isExisting: false as const,
      })),
    [files],
  );

  const existingGalleryItems = useMemo(
    () =>
      keptExistingUrls.map((url, index) => ({
        name: `${editingProduct?.name ?? "รูปสินค้า"} ${index + 1}`,
        url,
        isExisting: true as const,
      })),
    [keptExistingUrls, editingProduct?.name],
  );

  const galleryItems = [...existingGalleryItems, ...previews];
  const remainingImageSlots = Math.max(0, MAX_PRODUCT_IMAGES - keptExistingUrls.length - files.length);

  const [prevGalleryLength, setPrevGalleryLength] = useState(galleryItems.length);
  if (galleryItems.length !== prevGalleryLength) {
    setPrevGalleryLength(galleryItems.length);
    setActiveIndex((current) => {
      if (galleryItems.length === 0) return 0;
      return Math.min(current, galleryItems.length - 1);
    });
  }

  useEffect(() => {
    return () => {
      previews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [previews]);

  useEffect(() => {
    if (!isCameraOpen) {
      return;
    }

    let cancelled = false;
    const videoElement = videoRef.current;

    void navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: {
          facingMode: "environment",
        },
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoElement) {
          videoElement.srcObject = stream;
        }
      })
      .catch(() => {
        setCameraError("เปิดกล้องไม่สำเร็จ ลองตรวจสิทธิ์กล้องหรือใช้อัปโหลดจากเครื่องแทน");
        setIsCameraOpen(false);
      })
      .finally(() => {
        if (!cancelled) {
          setIsStartingCamera(false);
        }
      });

    return () => {
      cancelled = true;

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      if (videoElement) {
        videoElement.srcObject = null;
      }
    };
  }, [isCameraOpen]);

  const serverAction = isEditing ? updateProductFormAction : createProductFormAction;
  const [submitState, setSubmitState] = useState<ProductSubmitActionState>(
    initialProductSubmitActionState,
  );
  const [isPending, startSubmitTransition] = useTransition();
  const actionErrorMessage = submitState.status === "error" ? submitState.message : "";
  const displayImageError = cameraError || actionErrorMessage;
  const [activeBodyTab, setActiveBodyTab] = useState<"info" | "images">("info");
  const [hideSuccessFeedback, setHideSuccessFeedback] = useState(false);
  const showSuccess = submitState.status === "success" && !hideSuccessFeedback;
  const router = useRouter();

  useEffect(() => {
    onPendingChange?.(isPending);
    return () => {
      onPendingChange?.(false);
    };
  }, [isPending, onPendingChange]);

  useEffect(() => {
    if (submitState.status !== "success") {
      return;
    }

    if (isEditing) {
      startTransition(() => {
        router.refresh();
      });
      return;
    }

    const closeTimer = setTimeout(() => {
      onSubmitSuccess();
    }, 1600);
    return () => clearTimeout(closeTimer);
  }, [submitState.status, submitState.message, isEditing, onSubmitSuccess, router]);

  function dismissSuccess() {
    setHideSuccessFeedback(true);
  }

  function mergeFiles(currentFiles: File[], incomingFiles: File[]) {
    const maxNewFiles = Math.max(0, MAX_PRODUCT_IMAGES - keptExistingUrls.length);
    const nextFiles = [...currentFiles, ...incomingFiles].slice(0, maxNewFiles);
    const omittedCount = currentFiles.length + incomingFiles.length - nextFiles.length;

    return {
      nextFiles,
      omittedCount,
    };
  }

  async function handleFilesSelected(fileList: FileList | null) {
    const selectedFiles = Array.from(fileList ?? []);
    if (selectedFiles.length === 0) return;

    const validFiles: File[] = [];
    let invalidTypeCount = 0;
    let invalidSizeCount = 0;

    selectedFiles.forEach((file) => {
      if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
        invalidTypeCount += 1;
        return;
      }
      if (file.size > MAX_IMAGE_FILE_BYTES) {
        invalidSizeCount += 1;
        return;
      }
      validFiles.push(file);
    });

    if (validFiles.length === 0) {
      const messages: string[] = [];
      if (invalidTypeCount > 0) {
        messages.push("รองรับเฉพาะไฟล์ PNG, JPG และ WEBP");
      }
      if (invalidSizeCount > 0) {
        messages.push("ไฟล์รูปต้องมีขนาดไม่เกิน 5MB");
      }
      setCameraError(messages.join(" "));
      if (filePickerRef.current) {
        filePickerRef.current.value = "";
      }
      return;
    }

    const compressedFiles = await Promise.all(validFiles.map(compressImageFile));
    const { nextFiles, omittedCount } = mergeFiles(files, compressedFiles);
    setFiles(nextFiles);
    setActiveIndex(keptExistingUrls.length + nextFiles.length - 1);
    const messages: string[] = [];
    if (invalidTypeCount > 0) {
      messages.push("บางไฟล์ไม่รองรับ (รองรับ PNG, JPG, WEBP)");
    }
    if (invalidSizeCount > 0) {
      messages.push("บางไฟล์มีขนาดเกิน 5MB");
    }
    if (omittedCount > 0) {
      messages.push(`เพิ่มรูปได้สูงสุด ${MAX_PRODUCT_IMAGES} รูป ระบบจึงไม่ได้เพิ่มรูปใหม่อีก`);
    }
    setCameraError(messages.join(" "));

    if (filePickerRef.current) {
      filePickerRef.current.value = "";
    }
  }

  // galleryIndex = position in combined [existingGalleryItems, ...previews]
  function removeGalleryItem(galleryIndex: number) {
    const existingCount = keptExistingUrls.length;
    const nextTotalLength = Math.max(0, galleryItems.length - 1);

    if (galleryIndex < existingCount) {
      // Removing an existing image
      setKeptExistingUrls((prev) => {
        const next = prev.filter((_, i) => i !== galleryIndex);
        if (next.length === 0) {
          setPrioritizeNewImages(false);
        }
        return next;
      });
    } else {
      // Removing a new file
      const fileIndex = galleryIndex - existingCount;
      setFiles((current) => {
        const nextFiles = current.filter((_, i) => i !== fileIndex);
        if (nextFiles.length === 0) {
          setPrioritizeNewImages(false);
        }
        return nextFiles;
      });
      setCameraError("");
    }

    setActiveIndex((current) => {
      if (nextTotalLength <= 0) return 0;
      if (current > galleryIndex) return current - 1;
      return Math.min(current, nextTotalLength - 1);
    });
  }

  function setPrimaryImage(galleryIndex: number) {
    // Only operates on new files (existing images keep their order)
    const existingCount = keptExistingUrls.length;
    const fileIndex = galleryIndex - existingCount;
    if (fileIndex < 0) return; // existing image
    setFiles((current) => {
      if (fileIndex === 0) {
        return current;
      }
      if (fileIndex >= current.length) return current;
      const nextFiles = [...current];
      const [selectedFile] = nextFiles.splice(fileIndex, 1);
      nextFiles.unshift(selectedFile);
      return nextFiles;
    });
    if (existingCount > 0) {
      setPrioritizeNewImages(true);
    }
    setActiveIndex(existingCount); // first new file
  }

  function moveImage(galleryIndex: number, direction: "left" | "right") {
    // Only operates on new files
    const existingCount = keptExistingUrls.length;
    const fileIndex = galleryIndex - existingCount;
    const targetFileIndex = direction === "left" ? fileIndex - 1 : fileIndex + 1;

    setFiles((current) => {
      if (fileIndex < 0 || fileIndex >= current.length || targetFileIndex < 0 || targetFileIndex >= current.length) {
        return current;
      }
      const nextFiles = [...current];
      [nextFiles[fileIndex], nextFiles[targetFileIndex]] = [nextFiles[targetFileIndex], nextFiles[fileIndex]];
      return nextFiles;
    });
    setActiveIndex(existingCount + targetFileIndex);
  }

  function addSaleUnit() {
    setSaleUnits((current) => [
      ...current,
      {
        baseUnitQuantity: "1",
        costMode: "derived",
        fixedCostPrice: "",
        id: "",
        key: crypto.randomUUID(),
        label: "",
        minOrderQty: String(INTEGER_ORDER_PRESET_QTY),
        orderPreset: "integer" as OrderPreset,
        stepOrderQty: String(INTEGER_ORDER_PRESET_QTY),
      },
    ]);
  }

  function updateSaleUnit(
    key: string,
    field: keyof Pick<SaleUnitDraft, "baseUnitQuantity" | "costMode" | "fixedCostPrice" | "label" | "minOrderQty" | "stepOrderQty">,
    value: string,
  ) {
    setSaleUnits((current) =>
      current.map((saleUnit) =>
        saleUnit.key === key
          ? {
            ...saleUnit,
            [field]: value,
            ...(field === "costMode" && value === "derived"
              ? { fixedCostPrice: "" }
              : {}),
          }
          : saleUnit,
      ),
    );
  }

  function setOrderPreset(key: string, preset: OrderPreset) {
    setSaleUnits((current) =>
      current.map((saleUnit) => {
        if (saleUnit.key !== key) return saleUnit;
        if (preset === "free") return { ...saleUnit, orderPreset: "free", minOrderQty: "1", stepOrderQty: "" };
        if (preset === "integer") {
          return {
            ...saleUnit,
            orderPreset: "integer",
            minOrderQty: String(INTEGER_ORDER_PRESET_QTY),
            stepOrderQty: String(INTEGER_ORDER_PRESET_QTY),
          };
        }
        return { ...saleUnit, orderPreset: "custom" };
      }),
    );
  }

  function removeSaleUnit(key: string) {
    setSaleUnits((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((saleUnit) => saleUnit.key !== key);
    });
  }

  function openCamera() {
    if (remainingImageSlots <= 0) {
      setCameraError(`เพิ่มรูปได้สูงสุด ${MAX_PRODUCT_IMAGES} รูปต่อสินค้า`);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("อุปกรณ์นี้ไม่รองรับการเปิดกล้องจากเบราว์เซอร์");
      return;
    }

    setIsStartingCamera(true);
    setCameraError("");
    setIsCameraOpen(true);
  }

  function closeCamera() {
    setIsCameraOpen(false);
  }

  async function capturePhoto() {
    const video = videoRef.current;

    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError("ยังไม่พร้อมถ่ายรูป ลองรอสักครู่แล้วกดอีกครั้ง");
      return;
    }

    const maxSide = 1920;
    const scale =
      Math.max(video.videoWidth, video.videoHeight) > maxSide
        ? maxSide / Math.max(video.videoWidth, video.videoHeight)
        : 1;
    const targetWidth = Math.max(1, Math.round(video.videoWidth * scale));
    const targetHeight = Math.max(1, Math.round(video.videoHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;

    const context = canvas.getContext("2d");

    if (!context) {
      setCameraError("ไม่สามารถประมวลผลภาพจากกล้องได้");
      return;
    }

    context.drawImage(video, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.86);
    });

    if (!blob) {
      setCameraError("สร้างไฟล์รูปไม่สำเร็จ");
      return;
    }

    const capturedFile = new File([blob], `camera-${Date.now()}.jpg`, {
      type: "image/jpeg",
    });

    if (capturedFile.size > MAX_IMAGE_FILE_BYTES) {
      setCameraError("รูปจากกล้องมีขนาดเกิน 5MB กรุณาถ่ายใหม่ให้ใกล้ขึ้นหรือแสงสว่างมากขึ้น");
      return;
    }

    const { nextFiles, omittedCount } = mergeFiles(files, [capturedFile]);
    setFiles(nextFiles);
    setActiveIndex(keptExistingUrls.length + nextFiles.length - 1);
    setCameraError(
      omittedCount > 0 ? `เพิ่มรูปได้สูงสุด ${MAX_PRODUCT_IMAGES} รูป ระบบจึงไม่ได้เพิ่มรูปใหม่อีก` : "",
    );
    setIsCameraOpen(false);
  }

  function getParsedNumber(value: string) {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function getSaleUnitEffectiveCost(saleUnit: SaleUnitDraft) {
    const fixedCostPrice = saleUnit.fixedCostPrice.trim()
      ? getParsedNumber(saleUnit.fixedCostPrice)
      : null;

    return getEffectiveSaleUnitCost({
      baseCostPrice: getParsedNumber(baseCostPrice),
      baseUnitQuantity: getParsedNumber(saleUnit.baseUnitQuantity),
      costMode: saleUnit.costMode,
      fixedCostPrice,
    });
  }

  function formatMoney(value: number) {
    return value.toLocaleString("th-TH", {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  }

  function handleSubmit(formData: FormData) {
    setHideSuccessFeedback(false);

    const payload = new FormData();
    formData.forEach((value, key) => {
      if (key !== "images") {
        payload.append(key, value);
      }
    });
    files.forEach((file) => payload.append("images", file));

    startSubmitTransition(() => {
      void serverAction(initialProductSubmitActionState, payload)
        .then((nextState) => {
          setSubmitState(nextState);
        })
        .catch(() => {
          setSubmitState({
            message: "บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
            status: "error",
          });
        });
    });
  }

  return (
    <>
        <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {isEditing ? <input type="hidden" name="newImagesFirst" value={prioritizeNewImages ? "1" : "0"} /> : null}
          {isEditing ? <input type="hidden" name="productId" value={editingProduct.id} /> : null}
          {isEditing
            ? keptExistingUrls.map((url) => (
              <input key={`keep-image-${url}`} type="hidden" name="keptExistingImageUrls" value={url} />
            ))
            : null}

        {/* ── Tab strip ── */}
        <div className="grid shrink-0 grid-cols-2 border-b border-slate-100">
          <button
            type="button"
            onClick={() => setActiveBodyTab("info")}
            className={`flex items-center justify-center gap-1.5 border-b-2 py-3.5 text-sm font-semibold transition ${
              activeBodyTab === "info"
                ? "border-[#003366] text-[#003366]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Package2 className="h-4 w-4" strokeWidth={2.2} />
            ข้อมูลสินค้า
          </button>
          <button
            type="button"
            onClick={() => setActiveBodyTab("images")}
            className={`flex items-center justify-center gap-1.5 border-b-2 py-3.5 text-sm font-semibold transition ${
              activeBodyTab === "images"
                ? "border-[#003366] text-[#003366]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <ImagePlus className="h-4 w-4" strokeWidth={2.2} />
            รูปสินค้า
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          <div className={activeBodyTab === "info" ? "space-y-8" : "hidden"}>

              {/* Section: ข้อมูลสินค้า */}
              <section className="space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">ข้อมูลสินค้า</p>

                <div>
                  <label className={settingsFieldLabelClass} htmlFor="product-name">ชื่อสินค้า</label>
                  <input id="product-name" name="name" required defaultValue={editingProduct?.name ?? ""} className={settingsInputClass} placeholder="เช่น เส้นบะหมี่ไข่พรีเมียม" />
                </div>

                <div>
                  <label className={settingsFieldLabelClass} htmlFor="product-sku">รหัสสินค้า</label>
                  <div className="relative">
                    <Barcode className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" strokeWidth={2} />
                    <input id="product-sku" name="sku" required readOnly={!isEditing} defaultValue={skuValue} className={`${settingsInputClass} pl-10 ${!isEditing ? "bg-slate-50 text-slate-500" : ""}`} placeholder="TYN001" />
                  </div>
                  {!isEditing && <p className="mt-1.5 text-xs text-slate-400">ระบบกำหนดให้อัตโนมัติตามลำดับถัดไป</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={settingsFieldLabelClass} htmlFor="product-cost-price">ราคาต้นทุน</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-slate-400">฿</span>
                      <input id="product-cost-price" name="costPrice" type="number" min="0" step="0.01" required value={baseCostPrice} onChange={(e) => setBaseCostPrice(e.target.value)} className={`${settingsInputClass} pl-8`} placeholder="0.00" />
                    </div>
                  </div>
                  <div>
                    <label className={settingsFieldLabelClass} htmlFor="product-base-unit">หน่วยฐาน</label>
                    <input id="product-base-unit" name="baseUnit" required value={baseUnit} onChange={(e) => setBaseUnit(e.target.value)} className={settingsInputClass} placeholder="เช่น kg, แพ็ค, ชิ้น" />
                  </div>
                </div>

                <div>
                  <label className={settingsFieldLabelClass} htmlFor="product-stock-quantity">สต็อกเริ่มต้น</label>
                  <div className="relative">
                    <Warehouse className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" strokeWidth={2} />
                    <input id="product-stock-quantity" name="stockQuantity" type="number" min="0" step="1" required defaultValue={editingProduct?.stockQuantity ?? 0} className={`${settingsInputClass} pl-10`} placeholder="0" />
                  </div>
                </div>
              </section>

              {/* Section: รายละเอียดสินค้า */}
              <section className="space-y-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">รายละเอียดสินค้า</p>

                {/* Hidden inputs to pass metadata via FormData */}
                <input type="hidden" name="brand" value={brand} />
                <input type="hidden" name="description" value={description} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-1">
                    <label className={settingsFieldLabelClass} htmlFor="product-brand">แบรนด์</label>
                    <input
                      id="product-brand"
                      value={brand}
                      onChange={(e) => setBrand(e.target.value)}
                      className={settingsInputClass}
                      placeholder="เช่น TY Noodle"
                    />
                  </div>

                  <div className="sm:col-span-1">
                    <label className={settingsFieldLabelClass} htmlFor="product-category">หมวดหมู่สินค้า</label>
                    <div className="relative">
                      <select
                        id="product-category"
                        name="categoryIds"
                        value={selectedCategoryId}
                        onChange={(e) => setSelectedCategoryId(e.target.value)}
                        className={`${settingsSelectClass} pr-10`}
                        disabled={categories.length === 0}
                      >
                        <option value="">— ไม่ระบุหมวดหมู่ —</option>
                        {categories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
                        </svg>
                      </span>
                    </div>
                    {categories.length === 0 && (
                      <p className="mt-1.5 text-xs text-slate-400">
                        ยังไม่มีหมวดหมู่ในระบบ กรุณาไปที่แท็บ <span className="font-semibold text-slate-600">เพิ่มหมวดหมู่</span> ก่อน
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className={settingsFieldLabelClass} htmlFor="product-description">รายละเอียด</label>
                  <textarea
                    id="product-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                    className={`${settingsInputClass} resize-none`}
                    placeholder="คำอธิบายสินค้า เช่น เส้นบะหมี่ไข่คุณภาพสูง ผลิตจากแป้งสาลีนำเข้า"
                  />
                </div>
              </section>

              {/* Section: หน่วยขาย */}
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">หน่วยขาย</p>
                    <p className="mt-1 text-xs text-slate-400">รองรับหลายหน่วยต่อสินค้า เช่น กก. และ ลัง</p>
                  </div>
                  <button type="button" onClick={addSaleUnit} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-[0.97]">
                    <CirclePlus className="h-3.5 w-3.5" strokeWidth={2.2} />
                    เพิ่มหน่วย
                  </button>
                </div>

                <div className="space-y-3">
                  {saleUnits.map((saleUnit, index) => {
                    const uid = `${formId}-${index}`;
                    return (
                    <div key={saleUnit.key} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <input type="hidden" name="saleUnitId" value={saleUnit.id} />

                      {/* ── ชื่อ + อัตราส่วน + ลบ ── */}
                      <div className="flex items-end gap-3">
                        <div className="flex-1 min-w-0">
                          <label className={settingsFieldLabelClass} htmlFor={`su-label-${uid}`}>ชื่อหน่วยขาย</label>
                          <input id={`su-label-${uid}`} name="saleUnitLabel" required value={saleUnit.label} onChange={(e) => updateSaleUnit(saleUnit.key, "label", e.target.value)} className={settingsInputClass} placeholder="เช่น ลัง, แพ็ก, กก." />
                        </div>
                        <div className="w-28 shrink-0">
                          <label className={settingsFieldLabelClass} htmlFor={`su-ratio-${uid}`}>= หน่วยฐาน</label>
                          <input id={`su-ratio-${uid}`} name="saleUnitRatio" type="number" min="0.001" step="0.001" required value={saleUnit.baseUnitQuantity} onChange={(e) => updateSaleUnit(saleUnit.key, "baseUnitQuantity", e.target.value)} className={settingsInputClass} placeholder="1.000" />
                        </div>
                        <button type="button" onClick={() => removeSaleUnit(saleUnit.key)} disabled={saleUnits.length <= 1} className="mb-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-30" aria-label="ลบหน่วยขาย">
                          <X className="h-4 w-4" strokeWidth={2.2} />
                        </button>
                      </div>

                      <div className="my-4 border-t border-slate-100" />

                      {/* ── ต้นทุน ── */}
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-500">ต้นทุน</span>
                          <span className="text-sm font-bold text-slate-800">
                            {formatMoney(getSaleUnitEffectiveCost(saleUnit))} บาท
                            {saleUnit.costMode === "derived" && <span className="ml-1.5 text-xs font-normal text-slate-400">คำนวณอัตโนมัติ</span>}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {(["derived", "fixed"] as SaleUnitCostMode[]).map((mode) => (
                            <button key={mode} type="button" onClick={() => updateSaleUnit(saleUnit.key, "costMode", mode)} className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition ${saleUnit.costMode === mode ? "border-[#003366] bg-blue-50 text-[#003366]" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                              {mode === "derived" ? "อัตโนมัติ" : "กำหนดเอง"}
                            </button>
                          ))}
                        </div>
                        {saleUnit.costMode === "fixed" ? (
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-semibold text-slate-400">฿</span>
                            <input name="saleUnitFixedCostPrice" type="number" min="0" step="0.01" value={saleUnit.fixedCostPrice} onChange={(e) => updateSaleUnit(saleUnit.key, "fixedCostPrice", e.target.value)} className={`${settingsInputClass} pl-8`} placeholder="0.00" />
                          </div>
                        ) : (
                          <input type="hidden" name="saleUnitFixedCostPrice" value={saleUnit.fixedCostPrice} />
                        )}
                        <input type="hidden" name="saleUnitCostMode" value={saleUnit.costMode} />
                      </div>

                      <div className="my-4 border-t border-slate-100" />

                      {/* ── เงื่อนไขสั่ง ── */}
                      <div className="space-y-2.5">
                        <span className="text-xs font-semibold text-slate-500">เงื่อนไขการสั่ง</span>
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              { value: "free", label: "สั่งได้อิสระ", desc: "ทุกจำนวน" },
                              {
                                value: "integer",
                                label: `สั่งทีละ ${INTEGER_ORDER_PRESET_QTY}`,
                                desc: `${INTEGER_ORDER_PRESET_QTY}, ${INTEGER_ORDER_PRESET_QTY * 2}, ${INTEGER_ORDER_PRESET_QTY * 3}...`,
                              },
                              { value: "custom", label: "กำหนดเอง", desc: "เช่น 5, 10, 15..." },
                            ] as { value: OrderPreset; label: string; desc: string }[]
                          ).map((opt) => (
                            <button key={opt.value} type="button" onClick={() => setOrderPreset(saleUnit.key, opt.value)} className={`rounded-xl border px-2 py-2.5 text-center transition ${saleUnit.orderPreset === opt.value ? "border-[#003366] bg-blue-50 text-[#003366]" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                              <p className="text-xs font-semibold leading-tight">{opt.label}</p>
                              <p className="mt-0.5 text-[10px] opacity-60">{opt.desc}</p>
                            </button>
                          ))}
                        </div>
                        {saleUnit.orderPreset === "custom" && (
                          <div className="space-y-2 pt-1">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className={settingsFieldLabelClass} htmlFor={`su-min-${uid}`}>จำนวนขั้นต่ำ</label>
                                <input id={`su-min-${uid}`} type="number" min="1" step="0.001" value={saleUnit.minOrderQty} onChange={(e) => updateSaleUnit(saleUnit.key, "minOrderQty", e.target.value)} className={settingsInputClass} placeholder="1" />
                              </div>
                              <div>
                                <label className={settingsFieldLabelClass} htmlFor={`su-step-${uid}`}>เพิ่ม/ลดทีละ</label>
                                <input id={`su-step-${uid}`} type="number" min="0.001" step="0.001" value={saleUnit.stepOrderQty} onChange={(e) => updateSaleUnit(saleUnit.key, "stepOrderQty", e.target.value)} className={settingsInputClass} placeholder="1" />
                              </div>
                            </div>
                            {(() => {
                              const min = getParsedNumber(saleUnit.minOrderQty || "1");
                              const step = getParsedNumber(saleUnit.stepOrderQty || "0");
                              if (min > 0 && step > 0) {
                                const examples = [min, min + step, min + step * 2, min + step * 3].map((v) => (Number.isInteger(v) ? v : v.toFixed(3).replace(/\.?0+$/, ""))).join(", ");
                                return (
                                  <div className="space-y-1">
                                    <p className="text-xs text-slate-400">ตัวอย่าง: {examples}...</p>
                                    <p className="text-xs text-slate-400">
                                      ถ้าต้องการสั่งแบบ 5, 10, 15 ให้ใส่ขั้นต่ำ 5 และเพิ่ม/ลดทีละ 5
                                    </p>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </div>
                        )}
                      </div>

                      {/* hidden constraint inputs */}
                      <input
                        type="hidden"
                        name="saleUnitMinOrderQty"
                        value={
                          saleUnit.orderPreset === "custom"
                            ? saleUnit.minOrderQty || "1"
                            : saleUnit.orderPreset === "integer"
                              ? String(INTEGER_ORDER_PRESET_QTY)
                              : "1"
                        }
                      />
                      <input
                        type="hidden"
                        name="saleUnitStepOrderQty"
                        value={
                          saleUnit.orderPreset === "free"
                            ? ""
                            : saleUnit.orderPreset === "integer"
                              ? String(INTEGER_ORDER_PRESET_QTY)
                              : saleUnit.stepOrderQty
                        }
                      />

                      {index === 0 && (
                        <p className="mt-3 text-xs font-medium text-[#003366]">ใช้เป็นหน่วยขายเริ่มต้น</p>
                      )}
                    </div>
                    );
                  })}
                </div>
              </section>
            </div>

          <div className={activeBodyTab === "images" ? "space-y-5" : "hidden"}>
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className={settingsFieldLabelClass}>รูปสินค้าปัจจุบัน</label>
                    <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                      {galleryItems.length > 0 ? (
                        <Image
                          src={galleryItems[activeIndex]?.url ?? galleryItems[0].url}
                          alt={galleryItems[activeIndex]?.name ?? galleryItems[0].name}
                          fill
                          sizes="(max-width: 1024px) 100vw, 420px"
                          className="object-contain p-3"
                        />
                      ) : (
                        <Package2 className="h-10 w-10 text-slate-300" strokeWidth={1.8} />
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={settingsFieldLabelClass}>เปลี่ยนรูปสินค้า</label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="group relative flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center transition hover:border-[#003366]">
                        <div className="mb-4 rounded-full bg-white p-4 shadow-sm transition-transform group-hover:scale-105">
                          <ImagePlus className="h-7 w-7 text-[#003366]" strokeWidth={2.2} />
                        </div>
                        <p className="text-base font-semibold text-slate-900">เพิ่มรูปจากเครื่อง</p>
                        <p className="mt-1 text-sm text-slate-500">ได้สูงสุด {MAX_PRODUCT_IMAGES} รูปต่อสินค้า</p>
                        <input
                          ref={filePickerRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          multiple
                          className="absolute inset-0 opacity-0"
                          onChange={(event) => handleFilesSelected(event.target.files)}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={openCamera}
                        disabled={remainingImageSlots <= 0}
                        className="hidden"
                      >
                        <div className="mb-4 rounded-full bg-white p-4 shadow-sm transition-transform group-hover:scale-105">
                          <Camera className="h-7 w-7 text-[#003366]" strokeWidth={2.2} />
                        </div>
                        <p className="text-base font-semibold text-slate-900">ถ่ายรูปตอนนี้</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {remainingImageSlots > 0
                            ? `เพิ่มได้อีก ${remainingImageSlots} รูป`
                            : `ครบ ${MAX_PRODUCT_IMAGES} รูปแล้ว`}
                        </p>
                      </button>
                    </div>
                  </div>

                  {galleryItems.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex gap-2 overflow-x-auto">
                        {galleryItems.map((preview, index) => (
                          <button
                            key={`${preview.url}-${index}`}
                            type="button"
                            onClick={() => setActiveIndex(index)}
                            className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border ${
                              index === activeIndex ? "border-[#003366]" : "border-slate-200"
                            }`}
                          >
                            <Image
                              src={preview.url}
                              alt={preview.name}
                              fill
                              sizes="80px"
                              className="object-contain bg-white p-1"
                            />
                            {index === 0 ? (
                              <span className="absolute bottom-1 left-1 rounded-full bg-[#003366] px-2 py-0.5 text-[10px] font-bold text-white">
                                รูปหลัก
                              </span>
                            ) : null}
                            {preview.isExisting ? (
                              <span className="absolute right-1 top-1 rounded-full bg-slate-600/70 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                เดิม
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          {!galleryItems[activeIndex]?.isExisting && (
                            <>
                              <button
                                type="button"
                                onClick={() => setPrimaryImage(activeIndex)}
                                disabled={activeIndex === keptExistingUrls.length}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <BadgeCheck className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                                ตั้งเป็นรูปหลัก
                              </button>
                              <button
                                type="button"
                                onClick={() => moveImage(activeIndex, "left")}
                                disabled={activeIndex <= keptExistingUrls.length}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
                                เลื่อนไปซ้าย
                              </button>
                              <button
                                type="button"
                                onClick={() => moveImage(activeIndex, "right")}
                                disabled={activeIndex >= galleryItems.length - 1}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
                                เลื่อนไปขวา
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => removeGalleryItem(activeIndex)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={2.2} />
                            ลบรูปนี้
                          </button>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-500">
                          รูปแรกในรายการจะเป็นรูปหลัก สามารถเพิ่มรูปใหม่ต่อท้ายรูปเดิมได้
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
                      ยังไม่ได้เลือกรูปใหม่ หากกดบันทึกโดยไม่เลือก ระบบจะคงรูปสินค้าเดิมไว้
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div>
                    <label className={settingsFieldLabelClass}>รูปสินค้า</label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="group relative flex min-h-52 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 text-center transition hover:border-[#003366]">
                        <div className="mb-4 rounded-full bg-white p-4 shadow-sm transition-transform group-hover:scale-105">
                          <ImagePlus className="h-7 w-7 text-[#003366]" strokeWidth={2.2} />
                        </div>
                        <p className="text-base font-semibold text-slate-900">เพิ่มรูปจากเครื่อง</p>
                        <p className="mt-1 text-sm text-slate-500">ได้สูงสุด {MAX_PRODUCT_IMAGES} รูปต่อสินค้า</p>
                        <input
                          ref={filePickerRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          multiple
                          className="absolute inset-0 opacity-0"
                          onChange={(event) => handleFilesSelected(event.target.files)}
                        />
                      </label>

                      <button
                        type="button"
                        onClick={openCamera}
                        disabled={remainingImageSlots <= 0}
                        className="hidden"
                      >
                        <div className="mb-4 rounded-full bg-white p-4 shadow-sm transition-transform group-hover:scale-105">
                          <Camera className="h-7 w-7 text-[#003366]" strokeWidth={2.2} />
                        </div>
                        <p className="text-base font-semibold text-slate-900">ถ่ายรูปตอนนี้</p>
                        <p className="mt-1 text-sm text-slate-500">
                          {remainingImageSlots > 0
                            ? `เพิ่มได้อีก ${remainingImageSlots} รูป`
                            : `ครบ ${MAX_PRODUCT_IMAGES} รูปแล้ว`}
                        </p>
                      </button>
                    </div>
                  </div>

                  {previews.length > 0 ? (
                    <div className="space-y-3">
                      <div className="relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-white">
                        <Image
                          src={previews[activeIndex]?.url ?? previews[0].url}
                          alt={previews[activeIndex]?.name ?? previews[0].name}
                          fill
                          sizes="(max-width: 1024px) 100vw, 420px"
                          className="object-contain p-2"
                        />
                      </div>
                      <div className="flex gap-2 overflow-x-auto">
                        {previews.map((preview, index) => (
                          <button
                            key={`${preview.name}-${index}`}
                            type="button"
                            onClick={() => setActiveIndex(index)}
                            className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border ${index === activeIndex ? "border-[#003366]" : "border-slate-200"}`}
                          >
                            <Image
                              src={preview.url}
                              alt={preview.name}
                              fill
                              sizes="80px"
                              className="object-contain bg-white p-1"
                            />
                            {index === 0 ? (
                              <span className="absolute bottom-1 left-1 rounded-full bg-[#003366] px-2 py-0.5 text-[10px] font-bold text-white">
                                รูปหลัก
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setPrimaryImage(activeIndex)}
                            disabled={activeIndex === 0}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <BadgeCheck className="h-4 w-4 text-[#003366]" strokeWidth={2.2} />
                            ตั้งเป็นรูปหลัก
                          </button>
                          <button
                            type="button"
                            onClick={() => moveImage(activeIndex, "left")}
                            disabled={activeIndex === 0}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ArrowLeft className="h-4 w-4" strokeWidth={2.2} />
                            เลื่อนไปซ้าย
                          </button>
                          <button
                            type="button"
                            onClick={() => moveImage(activeIndex, "right")}
                            disabled={activeIndex === previews.length - 1}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <ArrowRight className="h-4 w-4" strokeWidth={2.2} />
                            เลื่อนไปขวา
                          </button>
                          <button
                            type="button"
                            onClick={() => removeGalleryItem(activeIndex)}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={2.2} />
                            ลบรูปนี้
                          </button>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-slate-500">
                          รูปแรกจะเป็นรูปหลักของสินค้า และสามารถเพิ่มได้สูงสุด {MAX_PRODUCT_IMAGES} รูป
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-500">
                      ยังไม่ได้เลือกรูปสินค้า หากไม่มีรูป ระบบยังสามารถบันทึกรายการสินค้าได้ตามปกติ
                    </div>
                  )}

                  {displayImageError ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {displayImageError}
                    </div>
                  ) : null}
                </>
              )}
            </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="action-touch-safe inline-flex items-center gap-2 rounded-xl bg-[#003366] px-5 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(0,51,102,0.22)] transition hover:bg-[#002244] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" strokeWidth={2.2} />
            )}
            {isPending ? "กำลังบันทึก..." : isEditing ? "บันทึกการแก้ไข" : "บันทึกสินค้า"}
          </button>
        </div>
      </form>

      {showSuccess ? (
        <>
          <div className="absolute inset-0 z-10 bg-white/55 backdrop-blur-sm" />
          <div className="absolute left-1/2 top-1/2 z-20 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-[0_18px_48px_rgba(15,23,42,0.24)] ring-1 ring-emerald-100">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-slate-900">
                {isEditing ? "แก้ไขสินค้าสำเร็จแล้ว" : "เพิ่มสินค้าสำเร็จแล้ว"}
              </p>
              <p className="text-xs text-slate-500">
                {isEditing ? "บันทึกการเปลี่ยนแปลงเรียบร้อย" : "กำลังปิดหน้าต่าง..."}
              </p>
            </div>
            <button
              type="button"
              onClick={dismissSuccess}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="ปิด"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
          <div className="h-1 bg-emerald-100" />
        </div>
        </>
      ) : null}

      {isCameraOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/75 p-3 sm:p-4">
          <div className="flex max-h-[96dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[1.5rem] bg-slate-950 text-white shadow-[0_28px_80px_rgba(15,23,42,0.4)]">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">
                  Camera
                </p>
                <h3 className="mt-1 text-xl font-bold">ถ่ายรูปสินค้า</h3>
              </div>
              <button
                type="button"
                onClick={closeCamera}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white transition hover:bg-white/10"
                aria-label="ปิดกล้อง"
              >
                <X className="h-5 w-5" strokeWidth={2.2} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <div className="relative overflow-hidden rounded-[1.5rem] bg-black">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="aspect-[3/4] w-full object-cover sm:aspect-video"
                />
                {isStartingCamera ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm text-white/80">
                    กำลังเปิดกล้อง...
                  </div>
                ) : null}
              </div>

              <p className="mt-4 text-sm leading-6 text-white/70">
                อนุญาตสิทธิ์กล้องก่อนใช้งาน แล้วกดถ่ายเพื่อแนบภาพเข้าแบบฟอร์มสินค้า
              </p>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-3 border-t border-white/10 bg-slate-950 px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={closeCamera}
                className="rounded-xl border border-white/15 px-4 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/5"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={capturePhoto}
                className="inline-flex items-center gap-2 rounded-xl bg-[#003366] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#002244]"
              >
                <Camera className="h-4 w-4" strokeWidth={2.2} />
                ถ่ายรูป
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Exported shell — manages navigation, swipe, and modal backdrop
// ─────────────────────────────────────────────────────────────────────────────
export function ProductForm({
  categories,
  editingProduct = null,
  nextSku,
  productList,
  returnHref,
}: ProductFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const initialIndex = productList
    ? Math.max(0, productList.findIndex((p) => p.id === editingProduct?.id))
    : 0;
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const currentProduct =
    editingProduct === null
      ? null
      : productList
        ? (productList[currentIndex] ?? editingProduct)
        : editingProduct;
  const isEditing = currentProduct !== null;
  const hasNav = productList && productList.length > 1 && isEditing;
  const canGoPrev = hasNav && currentIndex > 0;
  const canGoNext = hasNav && currentIndex < productList.length - 1;

  // Swipe detection — only fires for horizontal swipes (ignores vertical scroll)
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null;
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (isSubmitting) return;
    if (touchStartX.current === null || touchStartY.current === null) return;
    const deltaX = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
    const deltaY = (e.changedTouches[0]?.clientY ?? touchStartY.current) - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    // Only treat as horizontal swipe if X movement dominates Y movement
    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return;
    if (deltaX < 0 && canGoNext) setCurrentIndex((i) => i + 1);
    if (deltaX > 0 && canGoPrev) setCurrentIndex((i) => i - 1);
  }

  // Keyboard arrow navigation
  useEffect(() => {
    if (!hasNav || isSubmitting) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft" && canGoPrev) setCurrentIndex((i) => i - 1);
      if (e.key === "ArrowRight" && canGoNext) setCurrentIndex((i) => i + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasNav, canGoPrev, canGoNext, isSubmitting]);

  function closeModal() {
    if (isSubmitting) return;
    router.replace(returnHref, { scroll: false });
  }

  function handleSubmitSuccess() {
    router.replace(returnHref, { scroll: false });
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4">
      <div
        className="relative flex max-h-[96dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[1.75rem] border border-slate-200 bg-white shadow-[0_28px_80px_rgba(15,23,42,0.22)] sm:rounded-[1.75rem]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header */}
        <div className="shrink-0 border-b border-slate-100 px-4 pb-3 pt-4 sm:px-6">
          {/* Row 1: nav arrows + close */}
          <div className="flex items-center gap-2">
            {hasNav ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => i - 1)}
                disabled={!canGoPrev || isSubmitting}
                aria-label="สินค้าก่อนหน้า"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#003366] text-white shadow-md transition hover:bg-[#002244] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
              </button>
            ) : null}

            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                {isEditing ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}
              </p>
              {hasNav ? (
                <p className="text-xs text-slate-400">{currentIndex + 1} / {productList.length}</p>
              ) : null}
            </div>

            {hasNav ? (
              <button
                type="button"
                onClick={() => setCurrentIndex((i) => i + 1)}
                disabled={!canGoNext || isSubmitting}
                aria-label="สินค้าถัดไป"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#003366] text-white shadow-md transition hover:bg-[#002244] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                <ChevronRight className="h-5 w-5" strokeWidth={2.5} />
              </button>
            ) : null}

            <button
              type="button"
              onClick={closeModal}
              disabled={isSubmitting}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="ปิด"
            >
              <X className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>

          {/* Row 2: product name — full width, no truncation */}
          <div className="mt-2 flex items-center gap-2">
            {isEditing ? (
              <Package2 className="h-5 w-5 shrink-0 text-[#003366]" strokeWidth={2.2} />
            ) : (
              <CirclePlus className="h-5 w-5 shrink-0 text-[#003366]" strokeWidth={2.2} />
            )}
            <h3 className="text-xl font-semibold leading-snug tracking-[-0.02em] text-slate-950">
              {isEditing ? (currentProduct?.name ?? "แก้ไขข้อมูลสินค้า") : "รายการสินค้าใหม่"}
            </h3>
          </div>
          {!isEditing ? (
            <p className="mt-1 text-xs leading-5 text-slate-500">
              สร้างสินค้าใหม่พร้อมรูปภาพและข้อมูลสต็อกเริ่มต้น
            </p>
          ) : null}
        </div>

        {/* Form body — key forces full remount when product changes */}
        <ProductFormBody
          key={currentProduct?.id ?? "new"}
          categories={categories}
          editingProduct={currentProduct}
          nextSku={nextSku}
          onClose={closeModal}
          onPendingChange={setIsSubmitting}
          onSubmitSuccess={handleSubmitSuccess}
        />
      </div>
    </div>
  );
}
