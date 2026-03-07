import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Ascension Stats",
  description: "One dashboard for Infloww and Fanvue analytics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ascension-dark`}>
      <body className="min-h-screen asc-background font-sans antialiased text-white">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
