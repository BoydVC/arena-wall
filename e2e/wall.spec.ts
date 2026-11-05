import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const shots = path.resolve("shots");

async function ready(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("[data-ready='true']");
  await expect(page.locator("[data-lane='draft_pr'] .card")).toHaveCount(1);
}

async function overflow(page: Page): Promise<{ sw: number; sh: number; cw: number; ch: number }> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return { sw: doc.scrollWidth, sh: doc.scrollHeight, cw: doc.clientWidth, ch: doc.clientHeight };
  });
}

test("tv wall, drawer, and replay", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?mode=tv");
  await page.waitForSelector("[data-ready='true']");
  for (const lane of ["idea", "spec", "seats", "verify", "draft_pr", "merged"]) {
    await expect(page.locator(`[data-lane='${lane}'] .card`)).toHaveCount(1);
  }
  await expect(page.getByText("missing: acceptance tests, seat briefs")).toBeVisible();
  await expect(page.getByText("Awaiting OK")).toBeVisible();
  const box = await overflow(page);
  expect(box.sw).toBeLessThanOrEqual(box.cw + 1);
  expect(box.sh).toBeLessThanOrEqual(box.ch + 1);
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, "wall-1920x1080.png") });

  await page.locator("[data-idea='harbor-mint']").click();
  await expect(page.locator("#drawer")).toBeVisible();
  await expect(page.locator("#drawer .digest")).toHaveCount(3);
  await expect(page.locator("#drawer [data-lead='true'] h3")).toContainText("Experience");
  await expect(page.locator("#drawer")).toContainText("diff --git");
  await page.screenshot({ path: path.join(shots, "wall-drawer.png") });
  await page.locator("[data-close-drawer]").click();
  await expect(page.locator("#drawer")).toBeHidden();

  await page.locator("#replay").evaluate((input: HTMLInputElement) => {
    input.value = "0";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.locator("#replay-label")).toHaveText("t0 · ideas only");
  await expect(page.locator("[data-lane='idea'] .card")).toHaveCount(6);
  await expect(page.locator("[data-lane='seats'] .card")).toHaveCount(0);
  await expect(page.locator("[data-lane='draft_pr'] .card")).toHaveCount(0);
  await page.locator("#live").click();
  await expect(page.locator("[data-lane='merged'] .card")).toHaveCount(1);
  await expect(page.locator("[data-lane='draft_pr'] .card")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("phone wall fits without overflow", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?mode=phone");
  await page.waitForSelector("[data-ready='true']");
  for (const lane of ["idea", "spec", "seats", "verify", "draft_pr", "merged"]) {
    await expect(page.locator(`[data-lane='${lane}'] .card`)).toHaveCount(1);
  }
  const box = await overflow(page);
  expect(box.sw).toBeLessThanOrEqual(box.cw + 1);
  expect(box.sh).toBeLessThanOrEqual(box.ch + 1);
  await page.screenshot({ path: path.join(shots, "wall-390x844.png") });
  expect(errors).toEqual([]);
});

test("direct navigation is styled", async ({ page }) => {
  await ready(page);
  const styled = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return body.backgroundColor !== "rgba(0, 0, 0, 0)" && document.styleSheets.length > 0;
  });
  expect(styled).toBe(true);
});
