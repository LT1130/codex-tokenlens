import { describe, expect, it } from "vitest";
import {
  PRICING_STORAGE_KEY,
  clonePricingCatalog,
  estimateApiCost,
  estimateTaskApiCost,
  loadSavedPricingCatalog,
  mergePricingCatalog,
  savePricingCatalog
} from "./apiPricing";
import type { UsageTask } from "./usageTypes";

const task = (overrides: Partial<UsageTask> = {}): UsageTask => ({
  id: "task",
  title: "Cost test",
  project: "tokenlens",
  startedAt: "2026-06-19T00:00:00Z",
  durationMinutes: 1,
  model: "gpt-5.5",
  input: 1_000_000,
  cache: 900_000,
  output: 10_000,
  reasoning: 2_000,
  ...overrides
});

describe("API equivalent cost", () => {
  it("prices uncached input, cached input, and output separately", () => {
    const cost = estimateTaskApiCost(task());
    expect(cost?.uncachedInput).toBeCloseTo(0.5);
    expect(cost?.cachedInput).toBeCloseTo(0.45);
    expect(cost?.output).toBeCloseTo(0.3);
    expect(cost?.total).toBeCloseTo(1.25);
  });

  it("applies long-context rates to each model call instead of the task total", () => {
    const cost = estimateTaskApiCost(task({
      input: 400_000,
      cache: 300_000,
      output: 3_000,
      reasoning: 0,
      usageSegments: [
        { input: 100_000, cache: 50_000, output: 1_000, reasoning: 0 },
        { input: 300_000, cache: 250_000, output: 2_000, reasoning: 0 }
      ]
    }));
    expect(cost?.total).toBeCloseTo(0.25 + 0.025 + 0.03 + 0.5 + 0.25 + 0.09);
    expect(cost?.approximated).toBe(false);
    expect(cost?.calls?.map((call) => call.tier)).toEqual(["short", "long"]);
  });

  it("prices the two long-context calls from the reported $5.61 task", () => {
    const cost = estimateTaskApiCost(task({
      input: 569_935,
      cache: 18_944,
      output: 1_729,
      reasoning: 667,
      usageSegments: [
        { input: 282_493, cache: 9_472, output: 502, reasoning: 0 },
        { input: 287_442, cache: 9_472, output: 1_227, reasoning: 667 }
      ]
    }));
    expect(cost?.uncachedInput).toBeCloseTo(5.509_91);
    expect(cost?.cachedInput).toBeCloseTo(0.018_944);
    expect(cost?.output).toBeCloseTo(0.077_805);
    expect(cost?.total).toBeCloseTo(5.606_659);
  });

  it("does not guess prices for unknown models", () => {
    const result = estimateApiCost([task(), task({ id: "unknown", model: "future-model" })]);
    expect(result.pricedTaskCount).toBe(1);
    expect(result.unpricedTaskCount).toBe(1);
    expect(result.unpricedModels).toEqual(["future-model"]);
  });

  it("prices current GPT-5.6 Codex models and dated model IDs", () => {
    const sol = estimateTaskApiCost(task({
      model: "gpt-5.6-sol-2026-07-18",
      input: 300_000,
      cache: 100_000,
      output: 1_000,
      reasoning: 0,
      usageSegments: [{ input: 300_000, cache: 100_000, output: 1_000, reasoning: 0 }]
    }));
    const luna = estimateTaskApiCost(task({
      model: "gpt-5.6-luna",
      input: 10_000,
      cache: 1_000,
      output: 1_000
    }));
    const codex = estimateTaskApiCost(task({
      model: "gpt-5.3-codex",
      input: 1_000_000,
      cache: 100_000,
      output: 10_000
    }));

    expect(sol?.calls?.[0].tier).toBe("long");
    expect(sol?.total).toBeCloseTo(2 + 0.1 + 0.045);
    expect(luna?.total).toBeCloseTo(0.009 + 0.0001 + 0.006);
    expect(codex?.total).toBeCloseTo(1.575 + 0.0175 + 0.14);
  });

  it("uses the longest model alias before suffix matching", () => {
    const mini = estimateTaskApiCost(task({
      model: "gpt-5.4-mini-2026-03-18",
      input: 1_000_000,
      cache: 0,
      output: 0
    }));
    expect(mini?.total).toBeCloseTo(0.75);
  });

  it("falls back to an aggregate estimate when call totals do not match the task", () => {
    const cost = estimateTaskApiCost(task({
      usageSegments: [{ input: 10, cache: 5, output: 1, reasoning: 0 }]
    }));
    expect(cost?.approximated).toBe(true);
    expect(cost?.calls).toBeUndefined();
    expect(cost?.total).toBeCloseTo(1.25);
  });

  it("uses local custom model prices", () => {
    const catalog = clonePricingCatalog();
    catalog.models["gpt-5.5"].short = { input: 10, cachedInput: 2, output: 40 };
    const cost = estimateTaskApiCost(task(), catalog);
    expect(cost?.total).toBeCloseTo(1 + 1.8 + 0.4);
  });

  it("round-trips a validated pricing catalog through local storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value)
    };
    const catalog = clonePricingCatalog();
    catalog.customized = true;
    savePricingCatalog(catalog, storage);
    expect(values.has(PRICING_STORAGE_KEY)).toBe(true);
    expect(loadSavedPricingCatalog(storage)?.customized).toBe(true);
    values.set(PRICING_STORAGE_KEY, "{bad json");
    expect(loadSavedPricingCatalog(storage)).toBeUndefined();
  });

  it("merges older custom pricing with the current built-in catalog", () => {
    const saved = clonePricingCatalog();
    delete saved.models["gpt-5.6-sol"];
    saved.models["local-model"] = {
      aliases: ["local-model"],
      short: { input: 9, cachedInput: 1, output: 18 }
    };

    const merged = mergePricingCatalog(saved);

    expect(merged.customized).toBe(true);
    expect(merged.version).toBe("2026-07-21-custom");
    expect(merged.models["gpt-5.6-sol"]).toBeDefined();
    expect(merged.models["local-model"]).toBeDefined();
  });
});
