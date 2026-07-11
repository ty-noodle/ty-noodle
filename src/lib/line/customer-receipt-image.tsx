import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { notifyCustomerReceiptImageDetailed } from "@/lib/line/notify";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const RECEIPT_IMAGE_BUCKET = "customer-receipts";
const RECEIPT_EXPORT_WIDTH = 360;

type ReceiptImageItem = {
  lineTotal?: number;
  name: string;
  quantity: number;
  saleUnitLabel: string;
  unitPrice?: number;
};

type GeneratedReceiptInput = {
  customerName: string;
  items: ReceiptImageItem[];
  orderDate: string;
  orderNumber: string;
  totalAmount?: number;
};

type UploadReceiptImageInput = {
  contentType: "image/png" | "image/jpeg" | "image/webp";
  customerName: string;
  imageBuffer: Buffer;
  lineUserId: string;
  orderNumber: string;
  organizationId: string;
};

let receiptAssetsPromise:
  | Promise<{
      boldFont: ArrayBuffer;
      logoDataUrl: string;
      regularFont: ArrayBuffer;
    }>
  | null = null;

function guessExtension(contentType: UploadReceiptImageInput["contentType"]) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

async function verifyPublicImageUrl(imageUrl: string) {
  try {
    const response = await fetch(imageUrl, {
      headers: { Range: "bytes=0-0" },
    });
    return response.ok;
  } catch (error) {
    console.error("[customer-receipt-image:verify-url]", error);
    return false;
  }
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(value));
}

function formatMoney(value: number) {
  return value.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getPricedTotal(items: ReceiptImageItem[], fallbackTotal?: number) {
  const hasUnpricedItems = items.some((item) => Number(item.unitPrice ?? 0) <= 0);
  const pricedTotal = items.reduce(
    (sum, item) => sum + (Number(item.unitPrice ?? 0) > 0 ? Number(item.lineTotal ?? 0) : 0),
    0,
  );

  return hasUnpricedItems ? pricedTotal : Number(fallbackTotal ?? 0) || pricedTotal;
}

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

async function getReceiptAssets() {
  receiptAssetsPromise ??= Promise.all([
    readFile(join(process.cwd(), "public", "ty-noodles-logo.png")),
    readFile(join(process.cwd(), "public", "fonts", "NotoSansThai-Regular.ttf")),
    readFile(join(process.cwd(), "public", "fonts", "NotoSansThai-Bold.ttf")),
  ]).then(([logo, regularFont, boldFont]) => ({
    boldFont: toArrayBuffer(boldFont),
    logoDataUrl: `data:image/png;base64,${logo.toString("base64")}`,
    regularFont: toArrayBuffer(regularFont),
  }));

  return receiptAssetsPromise;
}

function ReceiptImage({
  customerName,
  items,
  logoDataUrl,
  orderDate,
  orderNumber,
  totalAmount,
}: GeneratedReceiptInput & { logoDataUrl: string }) {
  const sidePadding = 18;
  const rowBorder = { borderTop: "1px solid #cccccc" };
  const displayTotal = getPricedTotal(items, totalAmount);

  return (
    <div
      style={{
        background: "#ffffff",
        color: "#000000",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Noto Sans Thai, sans-serif",
        height: "100%",
        width: "100%",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          padding: "4px 8px 0",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse requires a plain image element. */}
        <img
          alt="T&Y Noodle"
          height={56}
          src={logoDataUrl}
          style={{ height: 56, objectFit: "contain", width: 56 }}
          width={56}
        />
      </div>

      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          padding: `0 ${sidePadding}px 10px`,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 12, lineHeight: 1.6 }}>
          T&amp;Y Noodle - ใบยืนยันคำสั่งซื้อ
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3, marginTop: 2 }}>
          {`เลขที่ออเดอร์: ${orderNumber}`}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 4 }}>
          {`${formatDate(orderDate)} | ${formatTime(orderDate)}`}
        </div>
      </div>

      <div style={{ borderTop: "2px solid #000000", margin: "0 16px" }} />

      <div
        style={{
          display: "flex",
          fontSize: 14,
          padding: `10px ${sidePadding}px 12px`,
        }}
      >
        <span style={{ fontWeight: 700 }}>ร้านค้า:</span>
        <span style={{ marginLeft: 4 }}>{customerName}</span>
      </div>

      <div style={{ display: "flex", gap: 6, padding: `6px ${sidePadding}px` }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 800, textAlign: "left" }}>
          สินค้า
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, textAlign: "right", width: 52 }}>
          จำนวน
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, textAlign: "right", width: 42 }}>
          หน่วย
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, textAlign: "right", width: 68 }}>
          รวม
        </span>
      </div>

      <div style={{ ...rowBorder, margin: "0 16px" }} />

      {items.map((item, index) => (
        <div key={`${item.name}-${index}`} style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: 6,
              padding: `10px ${sidePadding}px`,
            }}
          >
            <div
              style={{
                flex: 1,
                fontSize: 13,
                lineHeight: 1.4,
                overflow: "visible",
                whiteSpace: "normal",
                wordBreak: "break-word",
              }}
            >
              {item.name}
            </div>
            <div style={{ fontSize: 14, textAlign: "right", width: 52 }}>
              {item.quantity.toLocaleString("th-TH")}
            </div>
            <div style={{ fontSize: 14, textAlign: "right", width: 42 }}>
              {item.saleUnitLabel}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, textAlign: "right", width: 68 }}>
              {Number(item.unitPrice ?? 0) > 0 ? formatMoney(Number(item.lineTotal ?? 0)) : "-"}
            </div>
          </div>
          <div style={{ ...rowBorder, margin: "0 16px" }} />
        </div>
      ))}

      <div
        style={{
          display: "flex",
          fontSize: 15,
          fontWeight: 800,
          justifyContent: "space-between",
          padding: `14px ${sidePadding}px 0`,
        }}
      >
        <span>รวมทั้งหมด</span>
        <span>{displayTotal > 0 ? formatMoney(displayTotal) : "-"}</span>
      </div>

      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexDirection: "column",
          padding: `36px ${sidePadding}px 32px`,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1.6 }}>
          T&amp;Y Noodle
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 2 }}>
          ขอบคุณสำหรับการสนับสนุนครับ
        </div>
      </div>
    </div>
  );
}

export async function generateCustomerReceiptPng(input: GeneratedReceiptInput) {
  const { boldFont, logoDataUrl, regularFont } = await getReceiptAssets();
  const height = Math.max(390, 260 + input.items.length * 42 + 108);
  const response = new ImageResponse(
    <ReceiptImage {...input} logoDataUrl={logoDataUrl} />,
    {
      fonts: [
        {
          data: regularFont,
          name: "Noto Sans Thai",
          style: "normal",
          weight: 400,
        },
        {
          data: boldFont,
          name: "Noto Sans Thai",
          style: "normal",
          weight: 800,
        },
      ],
      height,
      width: RECEIPT_EXPORT_WIDTH,
    },
  );
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function uploadAndNotifyCustomerReceiptImage(
  input: UploadReceiptImageInput,
): Promise<{ imageUrl: string } | { error: string }> {
  const supabase = getSupabaseAdmin();
  const extension = guessExtension(input.contentType);
  const storagePath = `${input.organizationId}/line-receipts/${input.orderNumber}-${Date.now()}.${extension}`;

  const { data: buckets } = await supabase.storage.listBuckets();
  const hasBucket = (buckets ?? []).some((bucket) => bucket.name === RECEIPT_IMAGE_BUCKET);
  if (!hasBucket) {
    const { error: bucketError } = await supabase.storage.createBucket(RECEIPT_IMAGE_BUCKET, {
      allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
      fileSizeLimit: "10MB",
      public: true,
    });
    if (bucketError) {
      console.error("[customer-receipt-image:bucket]", bucketError);
      return { error: "สร้างพื้นที่เก็บรูปใบยืนยันไม่สำเร็จ" };
    }
  }

  const { error: uploadError } = await supabase.storage
    .from(RECEIPT_IMAGE_BUCKET)
    .upload(storagePath, input.imageBuffer, {
      cacheControl: "31536000",
      contentType: input.contentType,
      upsert: true,
    });

  if (uploadError) {
    console.error("[customer-receipt-image:upload]", uploadError);
    return { error: "อัปโหลดรูปใบยืนยันไม่สำเร็จ" };
  }

  const {
    data: { publicUrl: imageUrl },
  } = supabase.storage.from(RECEIPT_IMAGE_BUCKET).getPublicUrl(storagePath);

  const isPublicImageReady = await verifyPublicImageUrl(imageUrl);
  if (!isPublicImageReady) {
    return { error: `รูปใบยืนยันยังไม่เป็น public URL ที่ LINE ดึงได้: ${imageUrl}` };
  }

  const pushed = await notifyCustomerReceiptImageDetailed(input.lineUserId, {
    customerName: input.customerName,
    imageUrl,
    orderNumber: input.orderNumber,
  });

  if (!pushed.ok) {
    const detail = "body" in pushed ? pushed.body : String(pushed.error);
    return { error: `ส่งรูปใบยืนยันไป LINE ไม่สำเร็จ (${pushed.status ?? "network"}): ${detail}` };
  }

  return { imageUrl };
}

export async function generateUploadAndNotifyCustomerReceiptImage(input: {
  customerName: string;
  items: ReceiptImageItem[];
  lineUserId: string;
  orderDate: string;
  orderNumber: string;
  organizationId: string;
  totalAmount?: number;
}) {
  const imageBuffer = await generateCustomerReceiptPng(input);
  return uploadAndNotifyCustomerReceiptImage({
    contentType: "image/png",
    customerName: input.customerName,
    imageBuffer,
    lineUserId: input.lineUserId,
    orderNumber: input.orderNumber,
    organizationId: input.organizationId,
  });
}
