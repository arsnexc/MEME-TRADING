import type { Metadata, Viewport } from "next";
import type * as React from "react";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "MEMESCOPE — Memecoin paper terminal",
  description:
    "Real-time memecoin discovery and a functional simulated paper-trading terminal. Market data from GeckoTerminal and DEX Screener. No real funds.",
  applicationName: "MEMESCOPE",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
