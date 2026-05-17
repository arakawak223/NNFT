import { expect, test } from "@playwright/test";

/** End-to-end smoke covering both modes. We don't try to verify pixel
 *  output (different on every seed); we verify the flow reaches REVEAL,
 *  the radar canvas exists with rendered content, localStorage is
 *  populated, and no errors hit the console. */

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  // Stash for later assertion.
  (page as unknown as { __errors: string[] }).__errors = errors;
});

async function assertNoErrors(page: import("@playwright/test").Page) {
  const errors = (page as unknown as { __errors: string[] }).__errors;
  // Filter out known-benign warnings (none expected today, but keep the
  // seam for the future).
  const real = errors.filter((e) => !/^DevTools/.test(e));
  expect(real, `Unexpected console errors:\n${real.join("\n")}`).toEqual([]);
}

test("title screen renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".app-title")).toHaveText(/Visionary Core/);
  await expect(page.locator(".mode-card[data-mode='shunsuke']")).toBeVisible();
  await expect(page.locator(".mode-card[data-mode='hidetoshi']")).toBeVisible();
  // STADIUM toggle present; PLATEAU disabled (no env var in test runs).
  await expect(page.locator(".stadium-toggle .seg[data-stadium='mock']")).toHaveClass(/on/);
  await expect(page.locator(".stadium-toggle .seg[data-stadium='plateau']")).toBeDisabled();
  await assertNoErrors(page);
});

test("SHUNSUKE: title → SCAN → PLOT → REVEAL with radar", async ({ page }) => {
  await page.goto("/");
  await page.click(".mode-card[data-mode='shunsuke']");

  // SCAN phase: WebGL canvas under .scan-stage. 1s scan + 280ms blackout.
  await expect(page.locator(".scan-stage canvas")).toBeVisible();

  // PLOT phase appears after blackout.
  await expect(page.locator(".plot-canvas")).toBeVisible({ timeout: 4_000 });
  // REVEAL is gated until at least one piece is on the board. Drag the
  // ball pip onto the canvas — minimum cost path to unlock submission.
  const ballPip = page.locator(".tray .pip.ball");
  const plotCanvas = page.locator(".plot-canvas");
  const canvasBox = await plotCanvas.boundingBox();
  if (!canvasBox) throw new Error("plot canvas has no bounding box");
  await ballPip.dragTo(plotCanvas, {
    targetPosition: { x: canvasBox.width / 2, y: canvasBox.height / 2 },
  });

  const submit = page.locator(".tray .btn:not(.secondary)");
  await expect(submit).toBeEnabled({ timeout: 4_000 });
  await submit.click();

  // REVEAL phase: result canvas + radar canvas + bests in localStorage.
  await expect(page.locator(".result-canvas-wrap canvas")).toBeVisible({ timeout: 4_000 });
  await expect(page.locator(".result-radar canvas.radar-canvas")).toBeVisible();
  await expect(page.locator(".result-radar .radar-title")).toHaveText(/VISION\s*IQ\s*RADAR/);

  // The radar should have non-zero dimensions (it draws via fitRadar()).
  const radarSize = await page.locator(".radar-canvas").evaluate((el: HTMLCanvasElement) => ({
    w: el.width,
    h: el.height,
  }));
  expect(radarSize.w).toBeGreaterThan(0);
  expect(radarSize.h).toBeGreaterThan(0);

  // localStorage should now contain bests + runs.
  const stored = await page.evaluate(() => ({
    bests: localStorage.getItem("vc.bests"),
    runs:  localStorage.getItem("vc.runs"),
  }));
  expect(stored.bests, "vc.bests should be written").toBeTruthy();
  expect(stored.runs,  "vc.runs should be written").toBeTruthy();
  const bests = JSON.parse(stored.bests!);
  // SHUNSUKE measures coordAccuracy and infoRetention; both should be
  // numbers (peripheral may be null if user "scanned everywhere", but
  // the e2e doesn't drag-scan so yawSamples is the default-zero array).
  expect(typeof bests.coordAccuracy).toBe("number");
  expect(typeof bests.infoRetention).toBe("number");

  await assertNoErrors(page);
});

test("HIDETOSHI: title → CLIP → PREDICT (tap) → REVEAL with killer-pass result", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await page.click(".mode-card[data-mode='hidetoshi']");

  // CLIP plays for 5–9s before freeze, plus 320ms blackout. Allow extra
  // headroom because headless chromium can slow RAF below 60Hz.
  await expect(page.locator(".plot-canvas")).toBeVisible({ timeout: 20_000 });

  // Tap somewhere on the prediction canvas to commit a guess.
  const canvas = page.locator(".plot-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("predict canvas missing bounding box");
  await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.4);

  // SUBMIT button is disabled until a tap registers — should now be active.
  const submit = page.locator(".tray .btn:not(.secondary)");
  await expect(submit).toBeEnabled();
  await submit.click();

  // REVEAL with the killer-pass banner.
  await expect(page.locator(".result-canvas-wrap canvas")).toBeVisible({ timeout: 4_000 });
  await expect(page.locator(".altitude-banner")).toContainText(/KILLER PASS/);

  // Bests should now include predictionSpeed.
  const bests = await page.evaluate(() => JSON.parse(localStorage.getItem("vc.bests") ?? "{}"));
  expect(typeof bests.predictionSpeed).toBe("number");
  expect(typeof bests.coordAccuracy).toBe("number");

  await assertNoErrors(page);
});
