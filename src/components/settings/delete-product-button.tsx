"use client";

type DeleteProductButtonProps = {
  formId: string;
  productName: string;
};

export function DeleteProductButton({ formId, productName }: DeleteProductButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm(`ต้องการลบสินค้า "${productName}" ใช่หรือไม่`)) {
          (document.getElementById(formId) as HTMLFormElement | null)?.requestSubmit();
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
    >
      ลบ
    </button>
  );
}
