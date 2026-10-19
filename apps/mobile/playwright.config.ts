import { defineConfig } from "@playwright/test";
const port = Number(process.env.MOBILE_E2E_PORT || 5173);
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `./node_modules/.bin/vite --mode e2e --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
});
