import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";

import "../index.css";
import Providers from "@/components/providers";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cipher Atlas — Map your cryptographic footprint",
  description:
    "Cipher Atlas scans your infrastructure, code, and credential stores in one pass and maps every key, certificate, and TLS config to NIST migration standards.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
