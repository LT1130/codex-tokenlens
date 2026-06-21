import { expect, test } from "@playwright/test";

test("dashboard, call details, and pricing settings remain usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Codex Usage" })).toBeVisible();
  await expect(page.getByText("输入与输出构成")).toBeVisible();
  await page.getByRole("button", { name: "最近 7 天" }).click();

  const firstTask = page.locator(".task-row").first();
  await expect(firstTask).toBeVisible();
  await firstTask.click();
  await expect(page.getByText("模型调用明细")).toBeVisible();
  await expect(page.getByText("日志记录到 3 次调用")).toBeVisible();

  await page.locator(".pricing-trigger").click();
  await expect(page.getByRole("dialog", { name: "API 等价价格预览与自定义" })).toBeVisible();
  await expect(page.getByRole("button", { name: "查看官网价格" })).toBeVisible();
  await page.getByRole("button", { name: "关闭价格设置" }).click();
});

test("understanding guide and locale switch render correctly", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "理解 Codex" }).click();
  await expect(page.getByRole("heading", { name: /理解 Codex：它如何工作/ })).toBeVisible();
  await expect(page.getByText("先分清八个容易混淆的概念")).toBeVisible();

  await page.getByText("模型到底能看到什么？").click();
  await expect(page.getByText(/模型只看到本次调用实际提供给它的内容/)).toBeVisible();

  await page.getByLabel("Language").selectOption("en-US");
  await expect(page.getByRole("heading", { name: /Understand Codex: how it works/ })).toBeVisible();
  await expect(page.getByText("Eight concepts worth separating")).toBeVisible();
});
