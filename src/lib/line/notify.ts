import "server-only";

const LINE_API = "https://api.line.me/v2/bot/message/push";

export type LinePushResult =
  | { ok: true }
  | { body: string; ok: false; status: number }
  | { error: unknown; ok: false; status: null };

function isValidLinePushTarget(value: string | null | undefined): value is string {
  const normalized = value?.trim();
  return Boolean(normalized && /^[UCR][0-9a-f]{32}$/i.test(normalized));
}

async function linePush(to: string, token: string, message: object | object[]): Promise<boolean> {
  const result = await linePushDetailed(to, token, message);
  return result.ok;
}

async function linePushDetailed(to: string, token: string, message: object | object[]): Promise<LinePushResult> {
  try {
    const messages = Array.isArray(message) ? message : [message];
    const res = await fetch(LINE_API, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ to, messages }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("[line/push] Failed:", res.status, text);
      return { body: text, ok: false, status: res.status };
    }
    return { ok: true };
  } catch (err) {
    console.warn("[line/push] Error:", err);
    return { error: err, ok: false, status: null };
  }
}

interface LineOrderItem {
  productName: string;
  saleUnitLabel: string;
  quantity: number;
}

interface NewOrderPayload {
  customerName: string;
  orderNumber: string;
  totalAmount: number;
  items: LineOrderItem[];
}

interface PriceInquiryPayload {
  customerName: string;
  lineDisplayName?: string | null;
  lineUserId?: string | null;
  productName: string;
}

function buildFlexMessage(payload: NewOrderPayload): object {
  const { customerName, orderNumber, totalAmount, items } = payload;

  const total = totalAmount.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const itemRows = items.flatMap((item, i) => [
    {
      type: "box",
      layout: "horizontal",
      paddingTop: i === 0 ? "4px" : "8px",
      paddingBottom: "8px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          flex: 5,
          contents: [
            {
              type: "text",
              text: item.productName,
              size: "sm",
              color: "#334155",
              weight: "bold",
              wrap: true,
            },
            {
              type: "text",
              text: item.saleUnitLabel,
              size: "xs",
              color: "#94a3b8",
              margin: "xs",
            },
          ],
        },
        {
          type: "text",
          text: `× ${item.quantity.toLocaleString("th-TH")}`,
          size: "sm",
          color: "#003366",
          weight: "bold",
          flex: 2,
          align: "end",
          gravity: "center",
        },
      ],
    },
  ]);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return {
    type: "flex",
    altText: `🛒 ออเดอร์ใหม่ — ${customerName} (${orderNumber})`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0f172a",
        paddingTop: "20px",
        paddingBottom: "20px",
        paddingStart: "20px",
        paddingEnd: "20px",
        contents: [
          {
            type: "text",
            text: "🛒  ออเดอร์ใหม่เข้ามา",
            color: "#ffffff",
            weight: "bold",
            size: "lg",
          },
          {
            type: "box",
            layout: "horizontal",
            margin: "sm",
            contents: [
              {
                type: "text",
                text: orderNumber,
                color: "#94a3b8",
                size: "sm",
                flex: 1,
              },
              {
                type: "text",
                text: new Intl.DateTimeFormat("th-TH", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Bangkok",
                }).format(new Date()),
                color: "#64748b",
                size: "sm",
                align: "end",
              },
            ],
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "20px",
        contents: [
          // Store name row
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "ร้าน",
                size: "sm",
                color: "#94a3b8",
                flex: 1,
              },
              {
                type: "text",
                text: customerName,
                size: "sm",
                color: "#0f172a",
                weight: "bold",
                flex: 3,
                align: "end",
                wrap: true,
              },
            ],
          },
          { type: "separator", color: "#e2e8f0" },
          // Items header
          {
            type: "text",
            text: "รายการสินค้า",
            size: "xs",
            color: "#94a3b8",
            weight: "bold",
          },
          // All item rows
          ...itemRows,
          { type: "separator", color: "#e2e8f0" },
          // Total row
          {
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: "ยอดรวม",
                size: "sm",
                color: "#334155",
                weight: "bold",
                flex: 1,
              },
              {
                type: "text",
                text: `฿${total}`,
                size: "md",
                color: "#003366",
                weight: "bold",
                flex: 2,
                align: "end",
              },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "16px",
        backgroundColor: "#f8fafc",
        contents: [
          {
            type: "button",
            action: {
              type: "uri",
              label: "เปิดดูออเดอร์",
              uri: `${siteUrl}/orders`,
            },
            style: "primary",
            color: "#003366",
            height: "sm",
          },
        ],
      },
    },
  };
}

export async function notifyNewOrder(payload: NewOrderPayload): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;

  if (!token || !isValidLinePushTarget(groupId)) {
    console.warn("[line/notify] LINE_CHANNEL_ACCESS_TOKEN or LINE_GROUP_ID not set — skipping notification");
    return false;
  }

  return linePush(groupId, token, buildFlexMessage(payload));
}

function buildPriceInquiryFlex(payload: PriceInquiryPayload): object {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Bangkok",
    year: "numeric",
  }).format(now);

  const lineDisplayName = payload.lineDisplayName?.trim();
  const lineUserId = payload.lineUserId?.trim();

  return {
    type: "flex",
    altText: `สอบถามราคาสินค้า: ${payload.productName}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#003366",
        paddingAll: "16px",
        contents: [
          {
            type: "text",
            text: "สอบถามราคาสินค้า",
            color: "#ffffff",
            weight: "bold",
            size: "md",
            wrap: true,
          },
          {
            type: "text",
            text: dateStr,
            color: "#bfdbfe",
            size: "xs",
            margin: "sm",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
              { type: "text", text: "สินค้า", size: "xs", color: "#64748b" },
              {
                type: "text",
                text: payload.productName,
                size: "sm",
                color: "#0f172a",
                weight: "bold",
                wrap: true,
              },
            ],
          },
          {
            type: "separator",
            margin: "sm",
          },
          {
            type: "box",
            layout: "vertical",
            spacing: "xs",
            contents: [
              { type: "text", text: "ลูกค้า", size: "xs", color: "#64748b" },
              {
                type: "text",
                text: payload.customerName,
                size: "sm",
                color: "#0f172a",
                weight: "bold",
                wrap: true,
              },
            ],
          },
          ...(lineDisplayName
            ? [
                {
                  type: "box",
                  layout: "horizontal",
                  spacing: "sm",
                  contents: [
                    { type: "text", text: "ชื่อ LINE", size: "xs", color: "#94a3b8", flex: 2 },
                    {
                      type: "text",
                      text: lineDisplayName,
                      size: "xs",
                      color: "#334155",
                      flex: 5,
                      wrap: true,
                    },
                  ],
                },
              ]
            : []),
          ...(lineUserId
            ? [
                {
                  type: "box",
                  layout: "horizontal",
                  spacing: "sm",
                  contents: [
                    { type: "text", text: "LINE user", size: "xs", color: "#94a3b8", flex: 2 },
                    {
                      type: "text",
                      text: lineUserId,
                      size: "xs",
                      color: "#64748b",
                      flex: 5,
                      wrap: true,
                    },
                  ],
                },
              ]
            : []),
          {
            type: "text",
            text: "กรุณาตรวจสอบและแจ้งราคากลับลูกค้า",
            size: "sm",
            color: "#003366",
            weight: "bold",
            wrap: true,
            margin: "sm",
          },
        ],
      },
    },
  };
}

export async function notifyPriceInquiry(payload: PriceInquiryPayload): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;

  if (!token || !isValidLinePushTarget(groupId)) {
    console.warn("[line/price-inquiry] LINE_CHANNEL_ACCESS_TOKEN or LINE_GROUP_ID not set - skipping notification");
    return false;
  }

  return linePush(groupId, token, buildPriceInquiryFlex(payload));
}

function buildCustomerReceiptFlex(payload: NewOrderPayload): object {
  const { customerName, orderNumber, totalAmount, items } = payload;

  const total = totalAmount.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const itemRows = items.flatMap((item, i) => [
    {
      type: "box",
      layout: "horizontal",
      paddingTop: i === 0 ? "4px" : "6px",
      paddingBottom: "6px",
      contents: [
        {
          type: "box",
          layout: "vertical",
          flex: 5,
          contents: [
            { type: "text", text: item.productName, size: "sm", color: "#1e293b", weight: "bold", wrap: true },
            { type: "text", text: item.saleUnitLabel, size: "xs", color: "#94a3b8", margin: "xs" },
          ],
        },
        {
          type: "text",
          text: `× ${item.quantity.toLocaleString("th-TH")}`,
          size: "sm",
          color: "#15803d",
          weight: "bold",
          flex: 2,
          align: "end",
          gravity: "center",
        },
      ],
    },
  ]);

  return {
    type: "flex",
    altText: `✅ ยืนยันออเดอร์ ${orderNumber} — ${customerName}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#15803d",
        paddingTop: "18px",
        paddingBottom: "18px",
        paddingStart: "20px",
        paddingEnd: "20px",
        contents: [
          { type: "text", text: "✅  ยืนยันการสั่งซื้อแล้ว", color: "#ffffff", weight: "bold", size: "lg" },
          { type: "text", text: `เลขที่ ${orderNumber}`, color: "#bbf7d0", size: "sm", margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "20px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "ร้าน", size: "sm", color: "#94a3b8", flex: 1 },
              { type: "text", text: customerName, size: "sm", color: "#0f172a", weight: "bold", flex: 3, align: "end", wrap: true },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "วันที่สั่ง", size: "sm", color: "#94a3b8", flex: 1 },
              {
                type: "text",
                text: new Intl.DateTimeFormat("th-TH", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Bangkok",
                }).format(new Date()),
                size: "sm",
                color: "#334155",
                flex: 3,
                align: "end",
              },
            ],
          },
          { type: "separator", color: "#e2e8f0" },
          { type: "text", text: "รายการสินค้า", size: "xs", color: "#94a3b8", weight: "bold" },
          ...itemRows,
          { type: "separator", color: "#e2e8f0" },
          {
            type: "box",
            layout: "horizontal",
            contents: [
              { type: "text", text: "ยอดรวม", size: "sm", color: "#334155", weight: "bold", flex: 1 },
              { type: "text", text: `฿${total}`, size: "md", color: "#15803d", weight: "bold", flex: 2, align: "end" },
            ],
          },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        paddingAll: "14px",
        backgroundColor: "#f0fdf4",
        contents: [
          { type: "text", text: "ขอบคุณที่ใช้บริการ T&Y Noodle 🙏", size: "xs", color: "#15803d", align: "center", weight: "bold" },
          { type: "text", text: "เส้นรังนก · ส่งตรงถึงร้าน", size: "xs", color: "#86efac", align: "center", margin: "xs" },
        ],
      },
    },
  };
}

/** Push a customer-facing order receipt to their LINE chat.
 *  Silent no-op if customer hasn't added the OA as friend or token is missing. */
export async function notifyCustomerReceipt(
  lineUserId: string,
  payload: NewOrderPayload,
): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !isValidLinePushTarget(lineUserId)) {
    console.warn("[line/customer] Invalid LINE user id — skipping push");
    return false;
  }
  return linePush(lineUserId, token, buildCustomerReceiptFlex(payload));
}

interface CustomerReceiptImagePayload {
  customerName: string;
  orderNumber: string;
  imageUrl: string;
}

export async function notifyCustomerReceiptImage(
  lineUserId: string,
  payload: CustomerReceiptImagePayload,
): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !isValidLinePushTarget(lineUserId)) {
    console.warn("[line/customer-image] Invalid LINE user id — skipping push");
    return false;
  }

  const imageMessage = {
    type: "image",
    originalContentUrl: payload.imageUrl,
    previewImageUrl: payload.imageUrl,
  };

  return linePush(lineUserId, token, imageMessage);
}

export async function notifyCustomerReceiptImageDetailed(
  lineUserId: string,
  payload: CustomerReceiptImagePayload,
): Promise<LinePushResult> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !isValidLinePushTarget(lineUserId)) {
    console.warn("[line/customer-image] Invalid LINE user id - skipping push");
    return {
      body: !token ? "LINE_CHANNEL_ACCESS_TOKEN is not configured." : "Invalid LINE user id.",
      ok: false,
      status: 0,
    };
  }

  const imageMessage = {
    type: "image",
    originalContentUrl: payload.imageUrl,
    previewImageUrl: payload.imageUrl,
  };

  return linePushDetailed(lineUserId, token, imageMessage);
}

export async function notifyCustomerOrderReceiptSummary(
  lineUserId: string,
  payload: {
    customerName: string;
    items: { productName: string; quantity: number; saleUnitLabel: string }[];
    orderNumber: string;
  },
): Promise<boolean> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !isValidLinePushTarget(lineUserId)) {
    console.warn("[line/customer-summary] Invalid LINE user id - skipping push");
    return false;
  }

  const itemLines = payload.items
    .map((item, index) => {
      const quantity = item.quantity.toLocaleString("th-TH");
      return `${index + 1}. ${item.productName} ${quantity} ${item.saleUnitLabel}`;
    })
    .join("\n");

  const message = {
    type: "text",
    text: [
      "T&Y Noodle - ใบยืนยันคำสั่งซื้อ",
      `เลขที่ออเดอร์: ${payload.orderNumber}`,
      `ร้านค้า: ${payload.customerName}`,
      "",
      "รายการสินค้า",
      itemLines || "-",
      "",
      "ขอบคุณสำหรับการสั่งซื้อครับ",
    ].join("\n"),
  };

  return linePush(lineUserId, token, message);
}

// ─── New customer inquiry notification ───────────────────────────────────────

function buildNewCustomerInquiryFlex(name: string, phone: string): object {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);

  return {
    type: "flex",
    altText: `🟢 ลูกค้าใหม่สนใจสินค้า: ${name}`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0f766e",
        paddingAll: "16px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            alignItems: "center",
            contents: [
              {
                type: "text",
                text: "🟢",
                size: "lg",
                flex: 0,
              },
              {
                type: "text",
                text: "ลูกค้าใหม่สนใจสินค้า",
                weight: "bold",
                size: "md",
                color: "#ffffff",
                wrap: true,
              },
            ],
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        paddingAll: "16px",
        contents: [
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              { type: "text", text: "ชื่อ", size: "sm", color: "#94a3b8", flex: 2 },
              { type: "text", text: name, size: "sm", color: "#0f172a", weight: "bold", flex: 5, wrap: true },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              { type: "text", text: "เบอร์โทร", size: "sm", color: "#94a3b8", flex: 2 },
              { type: "text", text: phone || "—", size: "sm", color: "#0f766e", weight: "bold", flex: 5 },
            ],
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            contents: [
              { type: "text", text: "เวลา", size: "sm", color: "#94a3b8", flex: 2 },
              { type: "text", text: dateStr, size: "sm", color: "#64748b", flex: 5 },
            ],
          },
          {
            type: "separator",
            margin: "md",
          },
          {
            type: "box",
            layout: "horizontal",
            spacing: "sm",
            margin: "md",
            contents: [
              {
                type: "text",
                text: "⚡ กรุณาติดต่อกลับโดยด่วน",
                size: "sm",
                color: "#0f766e",
                weight: "bold",
                wrap: true,
              },
            ],
          },
        ],
      },
    },
  };
}

/** Push a new-customer inquiry alert to the admin LINE group.
 *  Silent no-op if env vars are missing. */
export async function notifyNewCustomerInquiry(
  name: string,
  phone: string,
): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const groupId = process.env.LINE_GROUP_ID;
  if (!token || !isValidLinePushTarget(groupId)) return;
  await linePush(groupId, token, buildNewCustomerInquiryFlex(name, phone));
}
