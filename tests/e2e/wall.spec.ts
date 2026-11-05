import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const LANES = ["idea", "spec", "seats", "verify", "draft_pr", "merged"] as const;

async function quiet(page: import("@playwright/test").Page): Promise<string[]> {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  return problems;
}

async function noOverflow(page: import("@playwright/test").Page): Promise<void> {
  const box = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      scrollHeight: root.scrollHeight,
      clientWidth: root.clientWidth,
      clientHeight: root.clientHeight,
    };
  });
  expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);
  expect(box.scrollHeight).toBeLessThanOrEqual(box.clientHeight + 1);
}

test("wide wall shows every lane, eighteen faces, and no overflow", async ({ page }) => {
  const problems = await quiet(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?mode=tv");
  await page.waitForSelector(".face");
  for (const lane of LANES) {
    await expect(page.locator(`[data-lane="${lane}"] .card`)).toHaveCount(1);
  }
  await expect(page.locator(".face")).toHaveCount(18);
  await expect(page.locator(".missing")).toContainText("acceptance tests");
  await expect(page.locator(".missing")).toContainText("seat briefs");
  await expect(page.locator(".badge")).toContainText("awaiting sign-off");
  await noOverflow(page);
  expect(problems).toEqual([]);
  await mkdir("docs/screenshots", { recursive: true });
  await page.screenshot({ path: "docs/screenshots/wall-1920.png" });
});

test("phone wall keeps the lanes and stays inside the viewport", async ({ page }) => {
  const problems = await quiet(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mode=phone");
  await page.waitForSelector(".lane:not(.hidden) .card");
  for (const lane of LANES) {
    await expect(page.locator(`[data-lane="${lane}"] .card`)).toHaveCount(1);
  }
  await expect(page.locator(".chip")).toHaveCount(6);
  await noOverflow(page);
  expect(problems).toEqual([]);
  await page.screenshot({ path: "docs/screenshots/wall-390.png" });
});

test("replay starts at ideas only and ends on the live wall", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?mode=tv");
  await page.waitForSelector("#replay");
  const live = await page.locator('[data-lane="draft_pr"] .card h3').innerText();
  await page.locator("#replay").evaluate((input: HTMLInputElement) => {
    input.value = input.min;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator('[data-lane="idea"] .card')).toHaveCount(6);
  for (const lane of LANES.filter((lane) => lane !== "idea")) {
    await expect(page.locator(`[data-lane="${lane}"] .card`)).toHaveCount(0);
  }
  await expect(page.locator("#replay-label")).toHaveText("t0");
  await page.locator("#replay").evaluate((input: HTMLInputElement) => {
    input.value = input.max;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  for (const lane of LANES) {
    await expect(page.locator(`[data-lane="${lane}"] .card`)).toHaveCount(1);
  }
  await expect(page.locator('[data-lane="draft_pr"] .card h3')).toHaveText(live);
  await expect(page.locator("#replay-label")).toHaveText("now");
});

test("keyboard opens the three seat diffs and closes again", async ({ page }) => {
  const problems = await quiet(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?mode=tv");
  await page.waitForSelector(".card");
  await page.keyboard.press("3");
  await page.keyboard.press("Enter");
  await expect(page.locator("#drawer")).toBeVisible();
  await expect(page.locator(".diff-col")).toHaveCount(3);
  await noOverflow(page);
  await page.screenshot({ path: "docs/screenshots/drawer-1920.png" });
  await page.keyboard.press("Escape");
  await expect(page.locator("#drawer")).toHaveCount(0);
  expect(problems).toEqual([]);
});
