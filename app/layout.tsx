import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { AuthProvider } from "@/lib/supabase/auth-context";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Controle de Despesas - RJ Compressores",
  description:
    "Sistema de controle de despesas corporativas para técnicos externos da RJ Compressores.",
  generator: "v0.app",
  icons: {
    icon: [
      { url: "/icon.png?v=2", sizes: "32x32", type: "image/png" },
      { url: "/icon.png?v=2", sizes: "192x192", type: "image/png" },
      { url: "/icon.png?v=2", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-icon.png?v=2", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/icon.png?v=2",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#1a2d5a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${inter.variable} bg-background`}>
      <body className="font-sans antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
