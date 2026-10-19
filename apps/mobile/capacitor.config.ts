import type { CapacitorConfig } from "@capacitor/cli";
const config: CapacitorConfig = {
  appId: "br.com.rjcompressores.despesasmobile",
  appName: "RJ Despesas",
  webDir: "dist",
  // Bundled assets work without a server or internet. Never set server.url here.
  server: { androidScheme: "https" },
  android: { allowMixedContent: false },
};
export default config;
