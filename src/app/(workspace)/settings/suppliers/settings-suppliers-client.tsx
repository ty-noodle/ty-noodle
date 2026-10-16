"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Plus, Search, MapPin, PencilLine, Trash2, Factory } from "lucide-react";
import { SettingsShell } from "@/components/settings/settings-shell";
import { SupplierForm } from "@/components/settings/supplier-form";
import { deleteSupplierAction } from "@/components/settings/suppliers-delete-action";
import type { SettingsSupplier } from "@/lib/settings/admin";

type Props = {
  initialSuppliers: SettingsSupplier[];
  nextSupplierCode: string;
  editingSupplier: SettingsSupplier | null;
  createParam?: string;
};

export function SettingsSuppliersPageClient({
  initialSuppliers,
  nextSupplierCode,
  editingSupplier,
  createParam,
}: Props) {
  const [isDeleting, startDeleteTransition] = useTransition();

  async function handleDelete(id: string, name: string) {
    if (!confirm(`คุณต้องการลบผู้ขาย "${name}" ใช่หรือไม่?`)) return;
    startDeleteTransition(async () => {
      const res = await deleteSupplierAction(id);
      if (!res.success) alert(res.error ?? "ลบไม่สำเร็จ");
    });
  }

  const [searchTerm, setSearchTerm] = useState("");
  const showCreateForm = createParam !== undefined;

  const filteredSuppliers = initialSuppliers.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <SettingsShell
      title="จัดการผู้ขาย"
      description="เพิ่ม แก้ไข และจัดการข้อมูลผู้ขาย (Suppliers)"
      titleIcon={Factory}
    >
      <div className="space-y-6">
        {/* Header Actions */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อผู้ขายหรือรหัส..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-[#003366] focus:ring-4 focus:ring-[#003366]/5"
            />
          </div>
          <Link
            href="/settings/suppliers?create"
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#003366] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#003366]/20 transition active:scale-95 hover:brightness-110"
          >
            <Plus className="h-5 w-5" strokeWidth={3} />
            <span>เพิ่มผู้ขายใหม่</span>
          </Link>
        </div>

        {/* Suppliers Grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filteredSuppliers.map((supplier) => (
            <div
              key={supplier.id}
              className="group relative flex flex-col overflow-hidden rounded-[2rem] border border-slate-200 bg-white transition-all hover:border-[#003366]/30 hover:shadow-xl hover:shadow-slate-200/50"
            >
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold tracking-wider text-slate-500">
                        {supplier.code}
                      </span>
                    </div>
                    <h3 className="mt-1 truncate text-lg font-bold text-slate-900 group-hover:text-[#003366]">
                      {supplier.name}
                    </h3>
                  </div>
                  
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 max-lg:opacity-100">
                    <Link
                      href={`/settings/suppliers?edit=${supplier.id}`}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition hover:bg-[#003366]/10 hover:text-[#003366]"
                      title="แก้ไข"
                    >
                      <PencilLine className="h-4.5 w-4.5" />
                    </Link>
                    <button
                      onClick={() => handleDelete(supplier.id, supplier.name)}
                      disabled={isDeleting}
                      className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      title="ลบ"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-start gap-2 text-sm text-slate-500">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                  <p className="line-clamp-2 leading-relaxed">
                    {supplier.address || "ไม่ได้ระบุที่อยู่"}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {initialSuppliers.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-slate-300">
                <Factory className="h-10 w-10" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">ยังไม่มีข้อมูลผู้ขาย</h3>
              <p className="mt-1 text-slate-500">เพิ่มผู้ขายเพื่อเริ่มบันทึกการรับซื้อสินค้า</p>
            </div>
          )}
        </div>
      </div>

      {/* Forms */}
      {showCreateForm && (
        <SupplierForm
          defaultCode={nextSupplierCode}
          returnHref="/settings/suppliers"
        />
      )}
      {editingSupplier && (
        <SupplierForm
          initialSupplier={editingSupplier}
          returnHref="/settings/suppliers"
        />
      )}
    </SettingsShell>
  );
}
