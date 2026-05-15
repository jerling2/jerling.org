import { expect, test } from "@playwright/test";

test("home page responds and shows site title", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.locator("h1")).toHaveText("jerling.org");
});

test("version.json is present and well-formed", async ({ request }) => {
  const response = await request.get("/version.json");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("version");
  expect(body).toHaveProperty("sha");
  expect(body).toHaveProperty("builtAt");
  expect(typeof body.version).toBe("string");
  expect(body.sha).toMatch(/^[0-9a-f]{7,40}$/);
});
