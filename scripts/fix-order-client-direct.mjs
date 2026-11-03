import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'src/app/order/order-client.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Replace captureReceiptImage function to capture directly without cloning
const captureReceiptImageRegex = /const captureReceiptImage = useCallback[\s\S]*?}, \[lastOrderMeta\?\.orderNumber, receiptOrder\]\);/;
const captureReceiptImageReplacement = `const captureReceiptImage = useCallback(async (): Promise<{ blob: Blob; fileName: string } | null> => {
    if (!receiptCardRef.current || receiptCaptureLockRef.current) return null;

    receiptCaptureLockRef.current = true;
    try {
      const htmlToImage = await import("html-to-image");
      
      // Pre-embed fonts like in report page
      await document.fonts.ready;
      const fontEmbedCSS = await htmlToImage.getFontEmbedCSS(document.body);

      // Give Safari a moment to ensure rendering (0.5s is enough if visible)
      await new Promise(r => setTimeout(r, 500));

      // Capture DIRECTLY from the visible element!
      const dataUrl = await htmlToImage.toPng(receiptCardRef.current, {
        quality: 1,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        cacheBust: true,
        fontEmbedCSS,
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
      receiptCaptureLockRef.current = false;
    }
  }, [lastOrderMeta?.orderNumber, receiptOrder]);`;

content = content.replace(captureReceiptImageRegex, captureReceiptImageReplacement);

fs.writeFileSync(filePath, content);
console.log('Successfully modified captureReceiptImage to capture directly');
