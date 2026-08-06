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
  // Os arquivos app/icon.png e app/apple-icon.png são detectados automaticamente
  // pelo Next.js App Router e geram os <link rel="icon"> e <link rel="apple-touch-icon"> corretos.
  // Definir icons: {} manualmente aqui sobrescreve esse comportamento automático — por isso omitimos.
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
      <head>
        {/* Apple Touch Icon — tag explícita necessária para o atalho na tela inicial do iPhone */}
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/icon.png" />
      </head>
      <body className="font-sans antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
