import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Controle de Despesas - RJ Compressores",
  description:
    "Sistema de controle de despesas corporativas para técnicos externos da RJ Compressores.",
  generator: "v0.app",
};

export const viewport: Viewport = {
  themeColor: "#1a2d5a",
  width: "device-width",
  initialScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} bg-background`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
