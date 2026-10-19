import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode, command }) => {
  // Explicit allowlist: never expose the root .env.local service role or M8 secrets.
  const root = loadEnv(
    mode,
    fileURLToPath(new URL("../..", import.meta.url)),
    "NEXT_PUBLIC_",
  );
  const local = loadEnv(mode, process.cwd(), "VITE_");
  // The panel configuration is authoritative for this workspace.
  // E2E uses a reserved, unreachable domain and never a real Supabase project.
  const e2e = mode === "e2e" && command === "serve";
  if (!e2e && (
    (local.VITE_SUPABASE_URL && local.VITE_SUPABASE_URL !== root.NEXT_PUBLIC_SUPABASE_URL) ||
    (local.VITE_SUPABASE_ANON_KEY && local.VITE_SUPABASE_ANON_KEY !== root.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  )) throw new Error("O mobile deve usar o mesmo Supabase configurado na raiz do painel.");
  const url = e2e ? "https://supabase.invalid" : root.NEXT_PUBLIC_SUPABASE_URL;
  const key = e2e ? "sb_publishable_local_e2e_only" : root.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key)
    throw new Error(
      "Configure a URL e a chave pública do Supabase. Consulte apps/mobile/.env.example.",
    );
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !["", "/"].includes(parsed.pathname) ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "A URL do Supabase deve usar HTTPS e não conter /rest/v1 nem outros caminhos.",
    );
  }
  if (key.startsWith("sb_secret_"))
    throw new Error("Use a chave pública, nunca a service role.");
  if (key.split(".").length === 3) {
    const claims = JSON.parse(
      Buffer.from(key.split(".")[1], "base64url").toString(),
    );
    if (claims.role !== "anon")
      throw new Error("O APK aceita apenas a chave anon/publicável.");
  }
  return {
    plugins: [react()],
    define: {
      __SUPABASE_URL__: JSON.stringify(url.replace(/\/$/, "")),
      __SUPABASE_KEY__: JSON.stringify(key),
    },
    server: { port: 5173 },
    build: { target: "es2022" },
  };
});
