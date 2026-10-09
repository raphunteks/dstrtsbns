import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { DM_Serif_Display, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
  display: "swap",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Daster Tasbon Olshop",
    template: "%s · Daster Tasbon Olshop",
  },
  description:
    "Daster dan busana wanita yang nyaman, dengan informasi ukuran jelas dan belanja yang transparan.",
  applicationName: "Daster Tasbon Olshop",
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#813A56",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id" className={`${jakarta.variable} ${dmSerif.variable}`}>
      <body className="min-h-dvh bg-paper text-ink antialiased">
        <a
          href="#konten"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-input focus:bg-surface focus:px-4 focus:py-3 focus:shadow-medium"
        >
          Langsung ke konten
        </a>
        {children}
      </body>
    </html>
  );
}
