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
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
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
      <body
        className={`${sarabun.variable} ${ibmPlexMono.variable} ${instrumentSans.variable} bg-background text-foreground antialiased`}
      >
        <PwaProvider />
        {children}
      </body>
    </html>
  );
}
