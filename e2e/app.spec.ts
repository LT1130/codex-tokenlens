import { expect, test } from "@playwright/test";

test("dashboard, call details, and pricing settings remain usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Codex Token 用量" })).toBeVisible();
  await expect(page.getByText("输入与输出构成")).toBeVisible();
  await expect(page.getByRole("heading", { name: "通用使用限额" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "GPT-5.3-Codex-Spark 使用限额" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "其他 Codex 使用限额" })).toHaveCount(0);
  await expect(page.getByText("5 小时使用额度")).toBeVisible();
  await expect(page.getByText("1 周使用额度")).toHaveCount(2);
  await page.getByRole("button", { name: "最近 7 天" }).click();
  await page.getByRole("button", { name: "最近 30 天" }).click();

  const firstTask = page.locator(".task-row").first();
  await expect(firstTask).toBeVisible();
  await expect(firstTask).toContainText("gpt-6-sol");
  await expect(firstTask).toContainText("$0.09");
  await firstTask.click();
  await expect(page.getByText("模型调用明细")).toBeVisible();
  await expect(page.getByText("日志记录到 3 次调用")).toBeVisible();

  await page.locator(".pricing-trigger").click();
  const pricingDialog = page.getByRole("dialog", { name: "API 等价价格预览与自定义" });
  await expect(pricingDialog).toBeVisible();
  await expect(page.getByRole("button", { name: "查看官网价格" })).toBeVisible();
  for (const [model, rates] of [
    ["gpt-6-sol", ["2", "0.2", "10", "272000", "4", "0.4", "15"]],
    ["gpt-6-luna", ["0.1", "0.01", "0.5", "272000", "0.2", "0.02", "0.75"]]
  ] as const) {
    const row = pricingDialog.getByRole("row").filter({ has: page.getByText(model, { exact: true }) });
    await expect(row).toBeVisible();
    for (const [index, value] of rates.entries()) {
      await expect(row.getByRole("spinbutton").nth(index)).toHaveValue(value);
    }
  }
  await page.getByRole("button", { name: "关闭价格设置" }).click();
});

test("understanding guide and locale switch render correctly", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "理解 Codex" }).click();
  await expect(page.getByRole("heading", { name: /理解 Codex：它如何工作/ })).toBeVisible();
  await expect(page.getByText("先分清八个容易混淆的概念")).toBeVisible();

  await page.getByText("模型到底能看到什么？").click();
  await expect(page.getByText(/模型只看到本次调用实际提供给它的内容/)).toBeVisible();

  await page.getByLabel("Language").click();
  await page.getByRole("option", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: /Understand Codex: how it works/ })).toBeVisible();
  await expect(page.getByText("Eight concepts worth separating")).toBeVisible();
});
