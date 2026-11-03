import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'src/app/order/order-client.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Restore and fix captureReceiptImage function
const captureReceiptImageRegex = /const captureReceiptImage = useCallback[\s\S]*?}, \[lastOrderMeta\?\.orderNumber, receiptOrder\]\);/;
const captureReceiptImageReplacement = `const captureReceiptImage = useCallback(async (): Promise<{ blob: Blob; fileName: string } | null> => {
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
        \`padding:\${outerPadding}px\`,
        "margin:0",
        "background:#ffffff",
        "z-index:-1",
        "overflow:visible",
        \`width:\${RECEIPT_EXPORT_WIDTH + outerPadding * 2}px\`,
        "box-sizing:border-box",
      ].join(";");

      const clone = target.cloneNode(true) as HTMLDivElement;
      clone.style.width = \`\${RECEIPT_EXPORT_WIDTH}px\`;
      clone.style.minWidth = \`\${RECEIPT_EXPORT_WIDTH}px\`;
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
      const fileName = \`TYNoodle-\${lastOrderMeta?.orderNumber ?? receiptOrderMeta?.order_number ?? "order"}.png\`;

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
  }, [lastOrderMeta?.orderNumber, receiptOrder]);`;

content = content.replace(captureReceiptImageRegex, captureReceiptImageReplacement);

// 2. Fix saveReceiptAsImage function
const saveReceiptAsImageRegex = /const saveReceiptAsImage = async \(\) => {[\s\S]*?};/;
const saveReceiptAsImageReplacement = `const saveReceiptAsImage = async () => {
    if (isSavingImage) return;
    setIsSavingImage(true);
    try {
      const captured = await captureReceiptImage();
      if (!captured) return;

      const imageDataUrl = await blobToDataUrl(captured.blob);
      setReceiptPopupUrl(imageDataUrl);
      setIsReceiptPopupOpen(true);
    } catch (err) {
      console.error("[saveReceiptAsImage]", err);
    } finally {
      setIsSavingImage(false);
    }
  };`;

content = content.replace(saveReceiptAsImageRegex, saveReceiptAsImageReplacement);

// 3. Add JSX for popup
const endOfJsxReplacement = `
      {/* iOS Receipt Image Popup */}
      {isReceiptPopupOpen && receiptPopupUrl && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex flex-col items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">บันทึกรูปภาพ</h3>
              <button 
                onClick={() => setIsReceiptPopupOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>
            <div className="p-4 flex flex-col items-center gap-4">
              <p className="text-sm text-gray-600 text-center">
                กดค้างที่รูปภาพเพื่อบันทึกลงเครื่อง หรือแชร์ต่อ
              </p>
              <div className="border rounded-lg overflow-hidden max-h-[60vh] overflow-y-auto">
                <img 
                  src={receiptPopupUrl} 
                  alt="Receipt" 
                  className="w-full h-auto"
                />
              </div>
              <button
                onClick={() => setIsReceiptPopupOpen(false)}
                className="w-full py-3 bg-[#00E000] text-white font-bold rounded-lg hover:bg-[#00c000] transition-colors"
              >
                เสร็จสิ้น
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}`;

// Find the last </div> before ); }
const lastDivIndex = content.lastIndexOf('</div>');
if (lastDivIndex !== -1) {
  const afterLastDiv = content.substring(lastDivIndex);
  if (afterLastDiv.includes(');') && afterLastDiv.includes('}')) {
    content = content.substring(0, lastDivIndex) + endOfJsxReplacement;
  }
}

fs.writeFileSync(filePath, content);
console.log('Successfully fixed order-client.tsx');
