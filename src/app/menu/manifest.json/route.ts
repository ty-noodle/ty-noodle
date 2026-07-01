import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    name: "T&YNoodle Menu",
    short_name: "T&Y Menu",
    description: "เมนูสินค้าและวัตถุดิบทั้งหมดสำหรับลูกค้า T&Y Noodle",
    start_url: "/menu",
    scope: "/menu",
    display: "standalone",
    background_color: "#f7fbff",
    theme_color: "#003366",
    lang: "th",
    orientation: "portrait",
    icons: [
      {
        src: "/brand/192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/brand/180x182.png",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/favicon.ico",
        sizes: "48x48 32x32 16x16",
        type: "image/x-icon",
      },
    ],
  });
}
