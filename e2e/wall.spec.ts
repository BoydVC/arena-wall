import { expect, test } from "@playwright/test";

const LANES = ["idea", "spec", "seats", "verify", "draft_pr", "merged", "parked"];

test("tv wall has every lane, no console errors, and no overflow", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.waitForSelector("[data-idea='ridge-owl']");
  for (const lane of LANES) {
    const column = page.locator(`[data-lane-column='${lane}']`);
    await expect(column).toBeVisible();
    const text = (await column.innerText()).trim();
    expect(text.length).toBeGreaterThan(0);
    await expect(column.locator("h2")).not.toHaveText("");
  }
  await expect(page.locator("[data-face]")).toHaveCount(18);
  await expect(page.locator("[data-idea='lumen-fold']")).toContainText("missing: acceptance tests, seat briefs");
  await expect(page.locator("[data-idea='comet-lab']")).toContainText("stale seat");
  await expect(page.locator("[data-idea='ridge-owl'] .badge")).toHaveText("awaiting review");
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    let worst = 0;
    for (const node of Array.from(document.body.querySelectorAll("*"))) {
      const box = node.getBoundingClientRect();
      if (box.width > 0 && box.right > root.clientWidth + 1) worst = Math.max(worst, box.right - root.clientWidth);
    }
    return { scroll: root.scrollWidth - root.clientWidth, worst };
  });
  expect(overflow.scroll).toBeLessThanOrEqual(1);
  expect(overflow.worst).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "docs/screenshots/wall-1920x1080.png" });
  expect(errors).toEqual([]);
});

test("phone wall fits a 390 viewport", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mode=phone");
  await page.waitForSelector("[data-lane-column='parked']");
  for (const lane of LANES) {
    await expect(page.locator(`[data-lane-column='${lane}']`)).toBeVisible();
  }
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    let worst = 0;
    for (const node of Array.from(document.body.querySelectorAll("*"))) {
      const box = node.getBoundingClientRect();
      if (box.width > 0 && box.right > root.clientWidth + 1) worst = Math.max(worst, box.right - root.clientWidth);
    }
    return { scroll: root.scrollWidth - root.clientWidth, worst };
  });
  expect(overflow.scroll).toBeLessThanOrEqual(1);
  expect(overflow.worst).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "docs/screenshots/wall-390x844.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("replay slider at the left shows only ideas and the end matches live", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/");
  await page.waitForSelector("[data-idea='pebble-arc']");
  const slider = page.locator("[data-testid='replay']");
  await slider.evaluate((input: HTMLInputElement) => {
    input.value = input.min;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("[data-idea='lumen-fold']")).toHaveAttribute("data-lane", "idea");
  await expect(page.locator("[data-idea='pebble-arc']")).toHaveAttribute("data-lane", "idea");
  await expect(page.locator("[data-lane-column='seats'] .card")).toHaveCount(0);
  const live = await page.evaluate(async () => {
    const response = await fetch("/api/replay?index=t0");
    return response.json();
  });
  expect(live.state && Object.keys(live.state.seats)).toHaveLength(0);

  await slider.evaluate((input: HTMLInputElement) => {
    input.value = input.max;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("[data-idea='ridge-owl']")).toHaveAttribute("data-lane", "draft_pr");
  await expect(page.locator("[data-idea='pebble-arc']")).toHaveAttribute("data-lane", "merged");
  await expect(page.locator("[data-face='comet-lab:experience-first']")).toHaveAttribute("data-lead", "true");
  await page.locator("[data-idea='ridge-owl']").click();
  await expect(page.locator("#drawer")).toBeVisible();
  await expect(page.locator(".diff")).toHaveCount(3);
  await expect(page.locator("#drawer")).toContainText("demo-gif");
  await expect(page.locator("#drawer img")).toBeVisible();
});
