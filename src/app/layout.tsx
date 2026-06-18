import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { PwaProvider } from "@/components/pwa-provider";
import { getSiteUrl } from "@/lib/site-url";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { RootAppLayoutShell } from "@/components/root-layout-shell";

const sukhumvit = localFont({
  src: [
    {
      path: "../../public/fonts/SukhumvitSet-Medium.ttf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/SukhumvitSet-SemiBold.ttf",
      weight: "600",
      style: "normal",
    },
    {
      path: "../../public/fonts/SukhumvitSet-Bold.ttf",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-sukhumvit",
});

const siteDescription =
  "ระบบจัดการธุรกิจจำหน่ายเส้นก๋วยเตี๋ยวและวัตถุดิบแบบดิจิทัล รองรับออเดอร์ ส่งของ เก็บเงิน และรายงาน";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "T&YNoodle",
    template: "%s | T&YNoodle",
  },
  description: siteDescription,
  applicationName: "T&YNoodle",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "T&YNoodle",
  },
  formatDetection: {
    telephone: false,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/brand/192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/512x512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico" }],
    apple: [{ url: "/brand/180x182.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "th_TH",
    siteName: "T&YNoodle",
    title: "T&YNoodle",
    description: siteDescription,
    images: [
      {
        url: "/brand/1200x630.png",
        width: 1200,
        height: 630,
        alt: "T&Y Noodle",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "T&YNoodle",
    description: siteDescription,
    images: ["/brand/1200x630.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#003366",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://profile.line-scdn.net" crossOrigin="anonymous" />
      </head>
      <body
        className={`${sukhumvit.variable} ${sukhumvit.className} bg-background text-foreground antialiased`}
      >
        <PwaProvider />
        <main>
          <PullToRefresh>
            <Suspense fallback={null}>
              <RootAppLayoutShell>{children}</RootAppLayoutShell>
            </Suspense>
          </PullToRefresh>
        </main>
      </body>
    </html>
  );
}
