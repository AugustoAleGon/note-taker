import { defineConfig, devices } from "@playwright/test";

const preview =
  process.env.PLAYWRIGHT_PREVIEW === "1" ||
  process.env.npm_lifecycle_event === "test:e2e:preview";
const port = preview ? 4174 : 4173;
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  workers: 2,
  timeout: 30_000,
  expect: { timeout: 7_000 },
  reporter: "list",
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chrome",
      use: { channel: "chrome" },
      testMatch: /branded\.spec\.ts/,
    },
    {
      name: "edge",
      use: { channel: "msedge" },
      testMatch: /branded\.spec\.ts/,
    },
  ],
  webServer: {
    command: preview
      ? `pnpm build && pnpm preview --host localhost --port ${port} --strictPort`
      : `pnpm dev --host localhost --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !preview && !process.env.CI,
    timeout: 60_000,
  },
});
