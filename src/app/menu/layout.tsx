import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "เมนูสินค้า | T&YNoodle",
  description: "เมนูสินค้าและวัตถุดิบทั้งหมดของ T&Y Noodle",
  manifest: "/menu/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "T&Y Menu",
  },
};

export default function MenuLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
