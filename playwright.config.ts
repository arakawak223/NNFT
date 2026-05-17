import { defineConfig, devices } from "@playwright/test";

/** Boots Vite on a free port for the duration of the run. Tests speak
 *  to the same instance, which keeps the per-test cost down. */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
    // Headless chromium needs swiftshader for the SCAN WebGL canvas to
    // produce non-blank pixels.
    launchOptions: {
      args: ["--use-gl=swiftshader", "--enable-webgl"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 5174",
    port: 5174,
    reuseExistingServer: !process.env.CI,
    timeout: 20_000,
  },
});
