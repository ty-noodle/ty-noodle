import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Instrument_Sans, Sarabun } from "next/font/google";
import "./globals.css";
import { PwaProvider } from "@/components/pwa-provider";
import { getSiteUrl } from "@/lib/site-url";

const sarabun = Sarabun({
  display: "swap",
  subsets: ["latin", "thai"],
  variable: "--font-sarabun",
  weight: ["400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
});

const ibmPlexMono = IBM_Plex_Mono({
  display: "swap",
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const instrumentSans = Instrument_Sans({
  display: "swap",
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "T&YNoodle",
    template: "%s | T&YNoodle",
  },
  description:
    "ระบบจัดการธุรกิจจำหน่ายเส้นก๋วยเตี๋ยวและวัตถุดิบแบบดิจิทัล รองรับออเดอร์ ส่งของ เก็บเงิน และรายงาน",
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
    description:
      "ระบบจัดการธุรกิจจำหน่ายเส้นก๋วยเตี๋ยวและวัตถุดิบแบบดิจิทัล รองรับออเดอร์ ส่งของ เก็บเงิน และรายงาน",
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
    description:
      "ระบบจัดการธุรกิจจำหน่ายเส้นก๋วยเตี๋ยวและวัตถุดิบแบบดิจิทัล รองรับออเดอร์ ส่งของ เก็บเงิน และรายงาน",
    images: ["/brand/1200x630.png"],
  },
};

export const viewport: Viewport = {
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
        {/* Preconnect to LINE profile CDN — speeds up user avatar loading */}
        <link rel="preconnect" href="https://profile.line-scdn.net" crossOrigin="anonymous" />
      </head>
      <body
        className={`${sarabun.variable} ${ibmPlexMono.variable} ${instrumentSans.variable} bg-background text-foreground antialiased`}
      >
        <PwaProvider />
        {children}
      </body>
    </html>
  );
}
