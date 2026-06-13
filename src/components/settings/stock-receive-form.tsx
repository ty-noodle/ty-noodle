"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  Loader2,
  Package2,
  Plus,
  Minus,
  Save,
  Search,
  X,
  Factory,
  Calendar,
  ChevronRight,
  Camera,
  ImagePlus,
  Trash2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import {
  useActionState,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  startTransition,
  useRef,
} from "react";
import { receiveStockAction } from "@/app/settings/stock/actions";
import type { ReceiveStockActionState } from "@/app/settings/stock/actions";
import type { StockProductOption, StockSupplierOption } from "@/lib/stock/admin";
import { ThaiDatePicker } from "@/components/ui/thai-date-picker";

type StockReceiveFormProps = {
  products: StockProductOption[];
  suppliers: StockSupplierOption[];
  returnHref: string;
  onClose?: () => void;
};

const initialReceiveStockState: ReceiveStockActionState = {
  fieldErrors: {},
  message: "",
  status: "idle",
};

export function StockReceiveForm({
  products,
  suppliers,
  returnHref,
  onClose,
}: StockReceiveFormProps) {
  const router = useRouter();
  const [actionState, formAction, isPending] = useActionState(
    receiveStockAction,
    initialReceiveStockState,
  );

  // Flow: 1: Info (Supplier/Date), 2: Products (Search/Select), 3: Photo & Submit
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selections, setSelections] = useState<Record<string, Record<string, string>>>({});
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split("T")[0]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [receiptImage, setReceiptImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSupplierDrawerOpen, setIsSupplierDrawerOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const deferredQuery = useDeferredValue(searchQuery);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
      if (p.categoryName) cats.add(p.categoryName);
    });
    return Array.from(cats).sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    
    // Category Filter
    if (selectedCategory !== "all") {
      result = result.filter(p => p.categoryName === selectedCategory);
    }
    
    // Search Query
    const q = deferredQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((p) => 
        p.name.toLowerCase().includes(q) || 
        p.sku.toLowerCase().includes(q)
      );
    }
    
    return result;
  }, [deferredQuery, products, selectedCategory]);

  const toggleProduct = (productId: string) => {
    setSelections(prev => {
      if (prev[productId]) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      // Initialize with default sale unit if possible
      const p = products.find(prod => prod.id === productId);
      const defaultUnitId = p?.saleUnits.find(u => u.isDefault)?.id || p?.saleUnits[0]?.id;
      return { 
        ...prev, 
        [productId]: defaultUnitId ? { [defaultUnitId]: "" } : {} 
      };
    });
  };

  const updateQty = (productId: string, unitId: string, value: string) => {
    setSelections(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {}),
        [unitId]: value
      }
    }));
  };

  const selectedCount = Object.keys(selections).length;

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setReceiptImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const [isClosing, setIsClosing] = useState(false);

  const showAlert = (message: string) => {
    setValidationError(message);
    setTimeout(() => setValidationError(null), 3000);
  };
  const displayErrorMessage =
    validationError ?? (actionState.status === "error" ? actionState.message : null);

  const handleSuccess = useEffectEvent((message: string) => {
    setValidationError(null);
    setSuccessMessage(message);
    setIsClosing(true);

    setTimeout(() => {
      startTransition(() => {
        if (onClose) {
          onClose();
        } else {
          router.replace(returnHref);
        }
        router.refresh();
      });
    }, 700);
  });

  useEffect(() => {
    if (actionState.status === "success") {
      handleSuccess(actionState.message || "บันทึกรับสินค้าเรียบร้อยแล้ว");
    }
  }, [actionState.message, actionState.status]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      if (onClose) onClose();
      else router.replace(returnHref);
    }, 400);
  };

  const onSubmit = () => {
    setValidationError(null);
    setSuccessMessage(null);

    const formData = new FormData();
    formData.append("supplierId", supplierId);
    formData.append("supplierName", supplierName);
    formData.append("receivedAt", receiveDate);
    formData.append("notes", ""); // Notes removed as per request
    
    if (receiptImage) {
      formData.append("receiptImage", receiptImage);
    }

    const items = Object.entries(selections).flatMap(([pid, units]) => {
      const p = products.find(prod => prod.id === pid);
      return Object.entries(units).map(([uid, qty]) => {
        const unit = p?.saleUnits.find(u => u.id === uid);
        return {
          productId: pid,
          quantityReceived: Number(qty) || 0,
          unit: unit?.label || p?.unit || "หน่วย",
          unitCost: unit?.effectiveCostPrice || 0,
        };
      });
    }).filter(item => item.quantityReceived > 0);

    formData.append("itemsJson", JSON.stringify(items));
    
    startTransition(() => {
      formAction(formData);
    });
  };

  const nextStep = () => {
    if (step === 1) {
      if (!supplierId) {
        setIsSupplierDrawerOpen(true);
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      if (selectedCount === 0) {
        showAlert("กรุณาเลือกสินค้าอย่างน้อย 1 รายการ");
        return;
      }

      // Check if all selected products have at least one unit with quantity > 0
      const missingQty = Object.entries(selections).some(([, units]) => {
        return !Object.values(units).some(qty => Number(qty) > 0);
      });

      if (missingQty) {
        showAlert("กรุณาระบุจำนวนสินค้าให้ครบถ้วน");
        return;
      }

      setStep(3);
    }
  };

  const prevStep = () => {
    setStep((prev) => (prev - 1) as 1 | 2);
  };

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-0 md:p-4 ${
      isClosing ? "animate-fade-out" : "animate-fade-in"
    }`}>

      <div 
        onClick={handleClose}
        className="absolute inset-0" 
      />
      <div className={`relative flex h-full w-full max-w-4xl flex-col overflow-hidden overscroll-x-none bg-[#F8FAFC] shadow-[0_40px_120px_rgba(0,0,0,0.4)] md:h-[min(900px,94dvh)] md:max-w-[1180px] md:rounded-[2.8rem] border border-white/40 ${
        isClosing ? "animate-slide-up-premium" : "animate-slide-down-premium"
      }`}>
        
        {/* Validation Alert Popup */}
        {displayErrorMessage && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[110] w-[calc(100%-3rem)] max-w-md animate-in slide-in-from-top-8 duration-500">
            <div className="bg-rose-600/90 text-white p-4 rounded-3xl shadow-2xl shadow-rose-600/40 flex items-center gap-4 border border-white/20 backdrop-blur-xl">
              <div className="h-10 w-10 shrink-0 rounded-2xl bg-white/20 flex items-center justify-center animate-pulse">
                <AlertCircle className="h-6 w-6" strokeWidth={3} />
              </div>
              <p className="font-black text-lg">{displayErrorMessage}</p>
            </div>
          </div>
        )}

        {successMessage && (
          <div className="absolute top-24 left-1/2 z-[110] w-[calc(100%-3rem)] max-w-md -translate-x-1/2 animate-in slide-in-from-top-8 duration-500">
            <div className="flex items-center gap-4 rounded-3xl border border-white/20 bg-emerald-600/90 p-4 text-white shadow-2xl shadow-emerald-600/40 backdrop-blur-xl">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/20">
                <Check className="h-6 w-6" strokeWidth={3} />
              </div>
              <p className="text-lg font-black">{successMessage}</p>
            </div>
          </div>
        )}

        {/* Modern Glass Header */}
        <div className="shrink-0 bg-white/80 backdrop-blur-md px-6 py-6 border-b border-slate-200/60 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute -inset-2 bg-[#003366]/5 rounded-full blur-xl animate-pulse" />
                <h2 className="relative text-2xl font-black text-[#003366] tracking-tight">รับสินค้าเข้าคลัง</h2>
                <p className="relative text-[10px] font-black text-[#003366]/40 tracking-[0.2em] uppercase mt-0.5">
                  {step === 1 && "Step 1: Information"}
                  {step === 2 && `Step 2: Selection (${selectedCount})`}
                  {step === 3 && "Step 3: Confirmation"}
                </p>
              </div>
            </div>
            
            <button
              type="button"
              onClick={handleClose}
              className="group relative h-12 w-12 flex items-center justify-center rounded-2xl bg-rose-900 text-white active:scale-90 transition-all shadow-lg shadow-rose-900/20 overflow-hidden"
            >
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              <X className="h-6 w-6 relative z-10" strokeWidth={3} />
            </button>
          </div>
        </div>

        <div className="relative flex flex-1 flex-col overflow-x-hidden overflow-y-auto no-scrollbar">
          {/* Animated Background Blobs */}
          <div className="absolute top-1/4 -right-20 w-64 h-64 bg-indigo-200/20 rounded-full blur-[80px] animate-drift pointer-events-none" />
          <div className="absolute bottom-1/4 -left-20 w-80 h-80 bg-rose-200/10 rounded-full blur-[100px] animate-drift [animation-delay:-5s] pointer-events-none" />
          
          {step === 1 ? (
            <div className="p-6 space-y-6 sm:space-y-12 animate-in fade-in slide-in-from-left-12 duration-700 relative z-10 flex-1 flex flex-col">
              {/* Decorative Floating Background Icons */}
              <div className="absolute top-20 right-0 -mr-16 opacity-[0.04] pointer-events-none select-none animate-float-slow">
                <Factory size={400} className="text-[#003366]" strokeWidth={1} />
              </div>

              <div className="grid gap-6 sm:gap-10">
                <div className="space-y-3 sm:space-y-5">
                  <label className="text-xl sm:text-2xl font-black text-slate-950 uppercase tracking-tight flex items-center gap-3">
                    <Calendar className="h-6 w-6 sm:h-7 sm:w-7 text-[#003366]" /> วันที่รับเข้า
                  </label>
                  <div className="relative group scale-105 origin-left">
                    <div className="absolute -inset-1 bg-[#003366]/5 rounded-[2rem] blur opacity-0 group-hover:opacity-100 transition-opacity" />
                    <ThaiDatePicker
                      id="receive-date"
                      name="receivedAt"
                      value={receiveDate}
                      onChange={setReceiveDate}
                    />
                  </div>
                </div>

                <div className="space-y-3 sm:space-y-5">
                  <label className="text-xl sm:text-2xl font-black text-slate-950 uppercase tracking-tight flex items-center gap-3">
                    <Factory className="h-6 w-6 sm:h-7 sm:w-7 text-[#003366]" /> ผู้จัดจำหน่าย
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsSupplierDrawerOpen(true)}
                    className={`group relative w-full h-24 sm:h-28 px-8 flex items-center justify-between bg-white border-2 transition-all rounded-[2.2rem] shadow-sm hover:shadow-xl hover:shadow-indigo-100/40 active:scale-[0.98] ${
                      supplierId ? "border-[#003366]/20" : "border-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-5">
                      <div className={`h-14 w-14 sm:h-16 sm:w-16 rounded-[1.5rem] flex items-center justify-center transition-all ${
                        supplierId ? "bg-indigo-50 text-[#003366]" : "bg-slate-50 text-slate-300"
                      }`}>
                        <Factory size={32} />
                      </div>
                      <span className={`text-2xl sm:text-3xl font-black ${supplierId ? "text-slate-950" : "text-slate-300"}`}>
                        {supplierName || "กดเลือกผู้ขาย..."}
                      </span>
                    </div>
                    <ChevronRight className={`h-8 w-8 transition-transform group-hover:translate-x-2 ${supplierId ? "text-[#003366]" : "text-slate-200"}`} strokeWidth={4} />
                  </button>
                </div>
                
                {/* Premium Visual Flair Card - Optimized for space */}
                <div className="relative overflow-hidden group mt-auto sm:mt-0">
                  <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-white/5 to-rose-500/10 animate-drift" />
                  <div className="relative bg-white/40 backdrop-blur-xl rounded-[2.5rem] p-6 sm:p-10 border border-white/60 shadow-xl shadow-indigo-100/20 flex items-center gap-6 sm:gap-8">
                    <div className="relative h-16 w-16 sm:h-24 sm:w-24 shrink-0 rounded-[1.5rem] sm:rounded-[2rem] bg-white flex items-center justify-center text-[#003366] shadow-2xl shadow-[#003366]/10 animate-float">
                      <Sparkles size={32} className="sm:hidden" />
                      <Sparkles size={48} className="hidden sm:block" />
                    </div>
                    <div>
                      <h4 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight">ข้อมูลพื้นฐาน</h4>
                      <p className="text-sm sm:text-lg font-bold text-slate-600 mt-1 leading-tight">
                        ระบุวันที่และผู้ขายให้ครบถ้วน <br />
                        ก่อนดำเนินการเลือกสินค้า
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : step === 2 ? (
            <div className="p-6 space-y-8 animate-in fade-in slide-in-from-right-12 duration-700 md:grid md:grid-cols-[320px_minmax(0,1fr)] md:gap-8 md:space-y-0">
              <div className="space-y-6 md:sticky md:top-6 md:self-start md:rounded-[2rem] md:border md:border-slate-100 md:bg-white/90 md:p-5 md:shadow-sm">
              {/* Category Filter */}
              <div className="flex flex-wrap gap-3 pb-2 px-1">
                <button
                  onClick={() => setSelectedCategory("all")}
                  className={`px-7 py-3 rounded-[1.2rem] text-sm font-black transition-all active:scale-95 ${
                    selectedCategory === "all"
                      ? "bg-[#003366] text-white shadow-xl shadow-[#003366]/20"
                      : "bg-white text-slate-500 border border-slate-100 hover:border-slate-200"
                  }`}
                >
                  ทั้งหมด
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-7 py-3 rounded-[1.2rem] text-sm font-black transition-all active:scale-95 ${
                      selectedCategory === cat
                        ? "bg-[#003366] text-white shadow-xl shadow-[#003366]/20"
                        : "bg-white text-slate-500 border border-slate-100 hover:border-slate-200"
                  }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-[#003366]/10 to-indigo-500/10 rounded-[2rem] blur-md opacity-0 group-focus-within:opacity-100 transition-opacity" />
                <div className="relative">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-6 w-6 text-slate-300 group-focus-within:text-[#003366] transition-colors" />
                  <input
                    type="text"
                    placeholder="ค้นหาสินค้าเพื่อรับเข้า..."
                    className="w-full h-18 pl-16 pr-8 bg-white border-2 border-slate-100 rounded-[1.8rem] outline-none focus:border-[#003366]/20 transition-all text-xl font-bold shadow-sm"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
              </div>

              {/* Product List */}
              <div className="space-y-4 -mx-2 md:mx-0">
                {filteredProducts.map((p) => {
                  const isSelected = !!selections[p.id];
                  return (
                    <div
                      key={p.id}
                      className={`group relative flex flex-col transition-all duration-500 rounded-[2rem] border overflow-hidden ${
                        isSelected 
                          ? "bg-white border-[#003366]/20 shadow-xl shadow-[#003366]/5" 
                          : "bg-transparent border-transparent hover:bg-white hover:border-slate-100 hover:shadow-lg"
                      }`}
                    >
                      <button
                        onClick={() => toggleProduct(p.id)}
                        className="flex w-full items-start gap-5 px-6 py-5 text-left"
                      >
                        <div className={`h-8 w-8 shrink-0 flex items-center justify-center rounded-xl border-2 transition-all ${
                          isSelected ? "bg-[#003366] border-[#003366] text-white shadow-lg shadow-[#003366]/20" : "border-slate-200 text-transparent"
                        }`}>
                          <Check className="h-5 w-5" strokeWidth={4} />
                        </div>
                        <div className="relative mt-1 h-20 w-20 shrink-0 overflow-hidden rounded-[1.8rem] border border-slate-50 bg-white shadow-inner sm:h-24 sm:w-24">
                          {p.imageUrl ? (
                            <Image src={p.imageUrl} alt={p.name} fill className="object-contain" />
                          ) : (
                            <Package2 className="m-auto h-10 w-10 text-slate-100" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 pt-1">
                          <p className="mb-2 text-[10px] font-black uppercase leading-none tracking-[0.25em] text-[#003366]/30">{p.sku}</p>
                          <p className="min-h-[2.9rem] break-words text-xl font-black leading-[1.18] tracking-tight text-slate-950 line-clamp-2">{p.name}</p>
                          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
                            <div className="flex items-center gap-2 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">
                              <div className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                              <span className="text-xs font-black text-slate-400">สต็อก: <span className="text-slate-700">{p.onHandQuantity} {p.unit}</span></span>
                            </div>
                            <div className="flex items-center gap-2 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
                              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                              <span className="text-xs font-black text-emerald-700/60">ต้นทุน: <span className="text-emerald-700">฿{p.costPrice.toLocaleString()}</span></span>
                            </div>
                            {isSelected && (
                              <span className="h-2 w-2 rounded-full bg-[#003366] animate-pulse ml-1" />
                            )}
                          </div>
                        </div>
                      </button>

                      {isSelected && (
                        <div className="px-6 pb-8 pt-2 space-y-6 animate-in fade-in slide-in-from-top-4 duration-500 bg-slate-50/30">
                          <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                            {p.saleUnits.map(unit => (
                              <div key={unit.id} className="group/unit bg-white rounded-[2rem] p-6 border border-slate-100 transition-all hover:border-[#003366]/20 hover:shadow-xl shadow-sm">
                                <div className="flex justify-between items-center mb-4">
                                  <label className="text-sm font-black text-slate-400 uppercase tracking-[0.15em]">{unit.label}</label>
                                  <span className="text-[12px] font-black text-[#003366] bg-indigo-50 px-3 py-1 rounded-xl">฿{unit.effectiveCostPrice}</span>
                                </div>
                                <div className="flex items-center gap-4">
                                  <button 
                                    onClick={() => updateQty(p.id, unit.id, String(Math.max(0, Number(selections[p.id]?.[unit.id] ?? 0) - 1)))}
                                    className="h-14 w-14 shrink-0 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 active:scale-90 transition-all"
                                  >
                                    <Minus className="h-7 w-7" strokeWidth={3} />
                                  </button>
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    value={selections[p.id]?.[unit.id] ?? ""}
                                    onChange={(e) => updateQty(p.id, unit.id, e.target.value)}
                                    className="w-full h-14 bg-transparent text-center text-3xl font-black text-slate-950 outline-none placeholder:text-slate-100"
                                    placeholder="0"
                                  />
                                  <button 
                                    onClick={() => updateQty(p.id, unit.id, String(Number(selections[p.id]?.[unit.id] ?? 0) + 1))}
                                    className="h-14 w-14 shrink-0 flex items-center justify-center rounded-2xl bg-[#003366] text-white shadow-xl shadow-[#003366]/20 hover:scale-105 active:scale-90 transition-all"
                                  >
                                    <Plus className="h-7 w-7" strokeWidth={3} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="p-6 space-y-10 animate-in fade-in slide-in-from-right-12 duration-700">
              <div className="space-y-5">
                <label className="text-[11px] font-black text-[#003366]/40 uppercase tracking-[0.3em] pl-2 flex items-center gap-3">
                  <Camera className="h-4 w-4" /> ถ่ายรูปบิลหรือใบส่งของ
                </label>
                
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  ref={cameraInputRef}
                  onChange={handleImageChange}
                />
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={galleryInputRef}
                  onChange={handleImageChange}
                />

                {imagePreview ? (
                  <div className="relative aspect-video w-full rounded-[2.8rem] overflow-hidden bg-slate-100 border-4 border-white shadow-2xl group">
                    <Image src={imagePreview} alt="Preview" fill className="object-cover" />
                    <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 backdrop-blur-sm">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="h-18 w-18 rounded-full bg-white text-[#003366] flex items-center justify-center shadow-2xl active:scale-90 transition-all hover:scale-110"
                      >
                        <Camera className="h-8 w-8" strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current?.click()}
                        className="h-18 w-18 rounded-full bg-white text-[#003366] flex items-center justify-center shadow-2xl active:scale-90 transition-all hover:scale-110"
                      >
                        <ImagePlus className="h-8 w-8" strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReceiptImage(null);
                          setImagePreview(null);
                        }}
                        className="h-18 w-18 rounded-full bg-rose-600 text-white flex items-center justify-center shadow-2xl active:scale-90 transition-all hover:scale-110"
                      >
                        <Trash2 className="h-8 w-8" strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="w-full aspect-video rounded-[2.8rem] border-4 border-dashed border-slate-100 bg-white/60 hover:bg-white hover:border-[#003366]/10 transition-all flex flex-col items-center justify-center gap-6 group relative overflow-hidden shadow-sm"
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative h-24 w-24 rounded-[2rem] bg-slate-50 flex items-center justify-center group-hover:scale-110 group-hover:bg-[#003366]/5 transition-all duration-500">
                        <Camera className="h-12 w-12 text-slate-300 group-hover:text-[#003366] transition-colors" strokeWidth={1.5} />
                      </div>
                      <div className="text-center relative">
                        <p className="text-2xl font-black text-slate-900">ถ่ายรูปบิล</p>
                        <p className="text-sm font-bold text-slate-400 mt-2 tracking-wide uppercase">Open Camera</p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current?.click()}
                      className="w-full aspect-video rounded-[2.8rem] border-4 border-dashed border-slate-100 bg-white/60 hover:bg-white hover:border-[#003366]/10 transition-all flex flex-col items-center justify-center gap-6 group relative overflow-hidden shadow-sm"
                    >
                      <div className="absolute inset-0 bg-gradient-to-b from-indigo-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="relative h-24 w-24 rounded-[2rem] bg-slate-50 flex items-center justify-center group-hover:scale-110 group-hover:bg-[#003366]/5 transition-all duration-500">
                        <ImagePlus className="h-12 w-12 text-slate-300 group-hover:text-[#003366] transition-colors" strokeWidth={1.5} />
                      </div>
                      <div className="text-center relative">
                        <p className="text-2xl font-black text-slate-900">เลือกรูปจากเครื่อง</p>
                        <p className="text-sm font-bold text-slate-400 mt-2 tracking-wide uppercase">Choose from Device</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>

              <div className="relative bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-xl shadow-slate-200/40 overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-[0.03] rotate-12">
                  <Check size={120} className="text-[#003366]" />
                </div>
                <h4 className="text-[11px] font-black text-[#003366]/40 uppercase tracking-[0.3em] mb-6">สรุปรายการทั้งหมด</h4>
                <div className="grid gap-6">
                  <div className="flex justify-between items-center bg-slate-50/50 p-4 rounded-2xl">
                    <span className="text-slate-400 font-black text-sm uppercase">วันที่รับเข้า</span>
                    <span className="font-black text-xl text-[#003366]">
                      {receiveDate ? (
                        new Date(receiveDate).toLocaleDateString("th-TH", {
                          day: "2-digit",
                          month: "long",
                          year: "numeric",
                        })
                      ) : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-50/50 p-4 rounded-2xl">
                    <span className="text-slate-400 font-black text-sm uppercase">ผู้จัดจำหน่าย</span>
                    <span className="font-black text-xl text-[#003366]">{supplierName}</span>
                  </div>
                  <div className="flex justify-between items-center bg-[#003366]/5 p-4 rounded-2xl">
                    <span className="text-slate-400 font-black text-sm uppercase">รายการสินค้า</span>
                    <span className="font-black text-2xl text-[#003366]">{selectedCount} <span className="text-sm">รายการ</span></span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Action */}
        <div className="shrink-0 p-5 sm:p-8 bg-white border-t border-slate-100 shadow-[0_-20px_60px_rgba(0,0,0,0.03)] flex items-center gap-4">
          {step > 1 && (
            <button
              onClick={prevStep}
              className="flex-1 h-16 sm:h-20 bg-slate-50 text-slate-500 rounded-[1.5rem] sm:rounded-[2.2rem] font-black text-lg sm:text-2xl flex items-center justify-center gap-3 active:scale-95 transition-all whitespace-nowrap hover:bg-slate-100"
            >
              <ChevronLeft className="h-6 w-6 sm:h-8 sm:w-8 shrink-0" strokeWidth={3} />
              <span>ย้อนกลับ</span>
            </button>
          )}
          
          {step < 3 ? (
            <button
              onClick={nextStep}
              className="flex-1 h-16 sm:h-20 bg-[#003366] text-white rounded-[1.5rem] sm:rounded-[2.2rem] font-black text-lg sm:text-2xl flex items-center justify-center gap-3 shadow-2xl shadow-[#003366]/30 active:scale-95 transition-all whitespace-nowrap group relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
              <span>ต่อไป</span>
              <ChevronRight className="h-6 w-6 sm:h-8 sm:w-8 shrink-0 transition-transform group-hover:translate-x-2" strokeWidth={3} />
            </button>
          ) : (
            <button
              onClick={onSubmit}
              disabled={isPending}
              className="flex-1 h-16 sm:h-20 bg-gradient-to-br from-[#003366] to-[#002244] text-white rounded-[1.5rem] sm:rounded-[2.2rem] font-black text-lg sm:text-2xl flex items-center justify-center gap-3 shadow-2xl shadow-[#003366]/40 disabled:opacity-50 active:scale-95 transition-all whitespace-nowrap group"
            >
              {isPending ? (
                <Loader2 className="h-7 w-7 sm:h-9 sm:w-9 animate-spin" />
              ) : (
                <>
                  <Save className="h-6 w-6 sm:h-8 sm:w-8 shrink-0 group-hover:scale-110 transition-transform" strokeWidth={3} />
                  <span>บันทึกรับสินค้า</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Supplier Selection Drawer (Bottom Sheet) */}
        {isSupplierDrawerOpen && (
          <div className="absolute inset-0 z-50 flex flex-col justify-end bg-slate-950/40 backdrop-blur-[6px] animate-in fade-in duration-500">
            <div 
              onClick={() => setIsSupplierDrawerOpen(false)}
              className="absolute inset-0" 
            />
            <div className="relative w-full max-h-[85%] bg-white rounded-t-[3.5rem] shadow-[0_-30px_100px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-700">
              {/* Drag Handle Indicator */}
              <div className="w-16 h-1.5 bg-slate-100 rounded-full mx-auto mt-4 mb-2" />
              
              <div className="shrink-0 p-8 border-b border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-[1.5rem] bg-indigo-50 flex items-center justify-center text-[#003366] shadow-inner">
                    <Factory size={28} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-[#003366] tracking-tight">เลือกผู้จัดจำหน่าย</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Select a Supplier</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsSupplierDrawerOpen(false)}
                  className="h-12 w-12 rounded-2xl bg-rose-900 text-white flex items-center justify-center active:scale-90 transition-all shadow-xl shadow-rose-900/20"
                >
                  <X className="h-6 w-6" strokeWidth={3} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                {suppliers.map(s => {
                  const isSelected = supplierId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSupplierId(s.id);
                        setSupplierName(s.name);
                        setIsSupplierDrawerOpen(false);
                      }}
                      className={`group w-full flex items-center justify-between p-6 rounded-[2rem] border-2 transition-all text-left active:scale-[0.98] ${
                        isSelected 
                          ? "bg-indigo-50/50 border-[#003366] shadow-xl shadow-[#003366]/5" 
                          : "bg-white border-slate-50 hover:border-slate-200 hover:shadow-lg"
                      }`}
                    >
                      <div className="flex items-center gap-5">
                        <div className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-all ${
                          isSelected ? "bg-white text-[#003366] shadow-lg" : "bg-slate-50 text-slate-300 group-hover:bg-indigo-50 group-hover:text-indigo-400"
                        }`}>
                          <Factory size={28} />
                        </div>
                        <div>
                          <p className={`font-black text-xl transition-colors ${isSelected ? "text-slate-900" : "text-slate-600 group-hover:text-slate-900"}`}>{s.name}</p>
                          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Code: {s.code}</p>
                        </div>
                      </div>
                      <div className={`h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all ${
                        isSelected ? "bg-[#003366] border-[#003366] shadow-lg" : "border-slate-100 group-hover:border-slate-200"
                      }`}>
                        {isSelected && <Check className="h-4 w-4 text-white" strokeWidth={6} />}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="shrink-0 p-8 bg-slate-50/50 backdrop-blur-sm border-t border-slate-100">
                <button
                  onClick={() => setIsSupplierDrawerOpen(false)}
                  className="w-full h-16 bg-white text-slate-600 border border-slate-200 rounded-[1.8rem] font-black text-lg active:scale-95 transition-all shadow-sm hover:bg-slate-50"
                >
                  ยกเลิกรายการ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
