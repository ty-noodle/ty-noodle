import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'src/app/order/order-client.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace captureReceiptImage function to use html-to-image instead of html2canvas
const captureReceiptImageRegex = /const captureReceiptImage = useCallback[\s\S]*?}, \[lastOrderMeta\?\.orderNumber, receiptOrder\]\);/;
const captureReceiptImageReplacement = `const captureReceiptImage = useCallback(async (): Promise<{ blob: Blob; fileName: string } | null> => {
    if (!receiptCardRef.current || receiptCaptureLockRef.current) return null;

    receiptCaptureLockRef.current = true;
    let cloneHost: HTMLDivElement | null = null;
    try {
      // Switch to html-to-image like in the report page!
      const htmlToImage = await import("html-to-image");
      const target = receiptCardRef.current;
      const outerPadding = 24;

      cloneHost = document.createElement("div");
      cloneHost.style.cssText = [
        "position:fixed",
        "left:0",
        "top:0",
        \`padding:\${outerPadding}px\`,
        "margin:0",
        "background:#ffffff",
        "z-index:-1000",
        "overflow:visible",
        \`width:\${RECEIPT_EXPORT_WIDTH + outerPadding * 2}px\`,
        "box-sizing:border-box",
        "opacity:1",
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

      // Give Safari significant time to layout (1 second) like in report page
      await new Promise(r => setTimeout(r, 1000));

      const dataUrl = await htmlToImage.toPng(cloneHost, {
        quality: 1,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width: captureWidth,
        height: captureHeight,
        cacheBust: true,
      });

      // Convert dataURL to Blob
      const arr = dataUrl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1];
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const blob = new Blob([u8arr], { type: mime });

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

fs.writeFileSync(filePath, content);
console.log('Successfully switched to html-to-image in order-client.tsx');
