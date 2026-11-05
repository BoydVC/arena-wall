import { mkdir } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const LANES = ["idea", "spec", "seats", "verify", "draft_pr", "merged", "parked"];

async function watch(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

async function noOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    let worst = 0;
    for (const node of Array.from(document.body.querySelectorAll("*"))) {
      const box = node.getBoundingClientRect();
      if (box.width > 0 && box.right > root.clientWidth + 1) worst = Math.max(worst, box.right - root.clientWidth);
    }
    return {
      scrollX: root.scrollWidth - root.clientWidth,
      scrollY: root.scrollHeight - root.clientHeight,
      worst,
    };
  });
  expect(overflow.scrollX).toBeLessThanOrEqual(1);
  expect(overflow.scrollY).toBeLessThanOrEqual(1);
  expect(overflow.worst).toBeLessThanOrEqual(1);
}

test("tv wall has every lane, no console errors, and no overflow", async ({ page }) => {
  const errors = await watch(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?mode=tv");
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
  await expect(page.locator("[data-idea='comet-lab']")).toContainText(/stale seat/i);
  await expect(page.locator("[data-idea='ridge-owl'] .badge")).toHaveText("Awaiting OK");
  await noOverflow(page);
  await mkdir("screenshots", { recursive: true });
  await page.screenshot({ path: "screenshots/wall-1920x1080.png" });
  expect(errors).toEqual([]);
});

test("phone wall fits a 390 viewport", async ({ page }) => {
  const errors = await watch(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mode=phone");
  await page.waitForSelector("[data-idea='ridge-owl']");
  await expect(page.locator("body")).toHaveAttribute("data-mode", "phone");
  await expect(page.locator("[data-lane-column]")).toHaveCount(LANES.length);
  const visible = page.locator("[data-lane-column]:not(.hidden)");
  await expect(visible).toHaveCount(1);
  await expect(visible.locator("h2")).not.toHaveText("");
  await expect(visible.locator(".card")).not.toHaveCount(0);
  await expect(page.locator(".chip")).toHaveCount(LANES.length);
  await expect(page.locator("[data-idea='ridge-owl'] .badge")).toHaveText("Awaiting OK");
  await page.screenshot({ path: "screenshots/wall-390x844.png" });
  await page.locator(".chip", { hasText: "Seats" }).click();
  await expect(page.locator("[data-lane-column='seats']")).toBeVisible();
  await expect(page.locator("[data-lane-column='draft_pr']")).toBeHidden();
  await noOverflow(page);
  expect(errors).toEqual([]);
});

test("replay slider at the left shows only ideas and the end matches live", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?mode=tv");
  await page.waitForSelector("[data-idea='pebble-arc']");
  const slider = page.locator("[data-testid='replay']");
  await slider.evaluate((input: HTMLInputElement) => {
    input.value = input.min;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#replay-label")).toHaveText("t0");
  await expect(page.locator("[data-idea='lumen-fold']")).toHaveAttribute("data-lane", "idea");
  await expect(page.locator("[data-idea='pebble-arc']")).toHaveAttribute("data-lane", "idea");
  await expect(page.locator("[data-lane-column='seats'] .card")).toHaveCount(0);
  await expect(page.locator("[data-lane-column='idea'] .card")).toHaveCount(6);
  const live = await page.evaluate(async () => {
    const response = await fetch("/api/replay?index=t0");
    return response.json();
  });
  expect(live.state && Object.keys(live.state.seats)).toHaveLength(0);

  await slider.evaluate((input: HTMLInputElement) => {
    input.value = input.max;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#replay-label")).toHaveText("now");
  await expect(page.locator("[data-idea='ridge-owl']")).toHaveAttribute("data-lane", "draft_pr");
  await expect(page.locator("[data-idea='pebble-arc']")).toHaveAttribute("data-lane", "merged");
  await expect(page.locator("[data-face='comet-lab:experience-first']")).toHaveAttribute("data-lead", "true");
  await page.locator("[data-idea='ridge-owl']").click();
  await expect(page.locator("#drawer")).toBeVisible();
  await expect(page.locator(".diff")).toHaveCount(3);
  await expect(page.locator("#drawer")).toContainText("demo-gif");
  await expect(page.locator("#drawer img")).toBeVisible();
  await page.screenshot({ path: "screenshots/drawer-1920x1080.png" });
});

test("keyboard opens the three seat diffs and space plays the day", async ({ page }) => {
  const errors = await watch(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?mode=tv&pace=fast");
  await page.waitForSelector(".card");
  await page.keyboard.press("3");
  await page.keyboard.press("Enter");
  await expect(page.locator("#drawer")).toBeVisible();
  await expect(page.locator(".diff")).toHaveCount(3);
  await page.keyboard.press("Escape");
  await expect(page.locator("#drawer")).toHaveCount(0);

  await page.keyboard.press(" ");
  await expect(page.locator(".caption")).toBeVisible();
  await expect(page.locator("body")).toHaveAttribute("data-playing", "false", { timeout: 30000 });
  await expect(page.locator("body")).toHaveAttribute("data-played", "true");
  await expect(page.locator("[data-idea='ridge-owl']")).toHaveAttribute("data-lane", "draft_pr");
  const last = await page.locator("body").getAttribute("data-last-caption");
  expect(last).toContain("Scrub the day back.");
  expect(errors).toEqual([]);
});
