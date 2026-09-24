import { describe, expect, it } from "vitest";
import {
  API_PRICING_CATALOG,
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
    expect(sol?.total).toBeCloseTo(1.6 + 0.08 + 0.03);
    expect(luna?.total).toBeCloseTo(0.0018 + 0.00002 + 0.0012);
    expect(codex?.total).toBeCloseTo(1.575 + 0.0175 + 0.14);
  });

  it("prices GPT-6 Astra at its standard short and long-context rates", () => {
    const short = estimateTaskApiCost(task({
      model: "gpt-6-astra",
      input: 100_000,
      cache: 40_000,
      output: 2_000,
      reasoning: 0,
      usageSegments: [{ input: 100_000, cache: 40_000, output: 2_000, reasoning: 0 }]
    }));
    const long = estimateTaskApiCost(task({
      model: "gpt-6-astra-2026-09-03",
      input: 300_000,
      cache: 100_000,
      output: 4_000,
      reasoning: 0,
      usageSegments: [{ input: 300_000, cache: 100_000, output: 4_000, reasoning: 0 }]
    }));

    expect(short?.calls?.[0].tier).toBe("short");
    expect(short?.total).toBeCloseTo(0.6 + 0.04 + 0.1);
    expect(long?.calls?.[0].tier).toBe("long");
    expect(long?.total).toBeCloseTo(4 + 0.2 + 0.3);
  });

  it("prices the gpt-5.6 alias as Sol without guessing unknown family variants", () => {
    expect(estimateTaskApiCost(task({ model: "gpt-5.6", input: 1_000_000, cache: 0, output: 0 }))?.total).toBeCloseTo(4);
    expect(estimateTaskApiCost(task({ model: "gpt-5.6-future", input: 1_000_000, cache: 0, output: 0 }))).toBeUndefined();
  });

  it.each([
    { model: "gpt-6-sol", shortTotal: 0.128, longTotal: 0.9 },
    { model: "gpt-6-luna", shortTotal: 0.0064, longTotal: 0.045 }
  ])("prices $model calls at Standard rates, including dated IDs", ({ model, shortTotal, longTotal }) => {
    const short = estimateTaskApiCost(task({
      model,
      input: 100_000,
      cache: 40_000,
      output: 0,
      reasoning: 0,
      usageSegments: [{ input: 100_000, cache: 40_000, output: 0, reasoning: 0 }]
    }));
    const long = estimateTaskApiCost(task({
      model: `${model}-2026-09-22`,
      input: 300_000,
      cache: 100_000,
      output: 4_000,
      reasoning: 3_000,
      usageSegments: [{ input: 300_000, cache: 100_000, output: 4_000, reasoning: 3_000 }]
    }));

    expect(short?.calls?.[0].tier).toBe("short");
    expect(short?.total).toBeCloseTo(shortTotal, 8);
    expect(long?.calls?.[0].tier).toBe("long");
    expect(long?.total).toBeCloseTo(longTotal, 8);
  });

  it.each([
    { model: "gpt-6-astra", shortTotal: 1.83, longTotal: 3.65502 },
    { model: "gpt-6-sol", shortTotal: 0.366, longTotal: 0.731004 },
    { model: "gpt-6-luna", shortTotal: 0.0183, longTotal: 0.0365502 }
  ])("uses long-context pricing only above 272K input tokens for $model", ({ model, shortTotal, longTotal }) => {
    const costAtInput = (input: number) => estimateTaskApiCost(task({
      model,
      input,
      cache: 100_000,
      output: 200,
      reasoning: 100,
      usageSegments: [{ input, cache: 100_000, output: 200, reasoning: 100 }]
    }));
    const atThreshold = costAtInput(272_000);
    const aboveThreshold = costAtInput(272_001);

    expect(atThreshold?.calls?.[0].tier).toBe("short");
    expect(atThreshold?.total).toBeCloseTo(shortTotal, 8);
    expect(aboveThreshold?.calls?.[0].tier).toBe("long");
    expect(aboveThreshold?.total).toBeCloseTo(longTotal, 8);
  });

  it("prices a task that switches between GPT-6 Sol and Luna per call", () => {
    const result = estimateApiCost([task({
      model: "gpt-6-luna",
      input: 400_000,
      cache: 140_000,
      output: 6_000,
      reasoning: 3_000,
      usageSegments: [
        { model: "gpt-6-sol", input: 100_000, cache: 40_000, output: 2_000, reasoning: 1_000 },
        { model: "gpt-6-luna", input: 300_000, cache: 100_000, output: 4_000, reasoning: 2_000 }
      ]
    })]);

    expect(result.total).toBeCloseTo(0.148 + 0.045, 8);
    expect(result.pricedTaskCount).toBe(1);
    expect(result.unpricedTaskCount).toBe(0);
    expect(result.approximatedTaskCount).toBe(0);
    expect(result.unpricedModels).toEqual([]);
  });

  it("estimates GPT-6 Sol task totals without treating accumulated input as one long call", () => {
    const cost = estimateTaskApiCost(task({
      model: "gpt-6-sol", input: 832_000, cache: 767_360, output: 4_662
    }));
    expect(cost?.total).toBeCloseTo(0.329372, 8);
    expect(cost?.approximated).toBe(true);
  });

  it.each(["gpt-6", "gpt-6-terra", "gpt-6-sol-future", "gpt-6-luna-future"])(
    "does not infer GPT-6 pricing for %s", (model) => {
      expect(estimateTaskApiCost(task({ model }))).toBeUndefined();
    }
  );

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
    expect(merged.version).toBe(`${API_PRICING_CATALOG.version}-custom`);
    expect(merged.models["gpt-6-astra"]).toBeDefined();
    expect(merged.models["gpt-5.6-sol"]).toBeDefined();
    expect(merged.models["local-model"]).toBeDefined();
  });

  it("loads pre-Sol/Luna custom catalogs with new coverage while preserving user prices", () => {
    const saved = clonePricingCatalog();
    saved.version = "2026-09-11-custom";
    saved.customized = true;
    delete saved.models["gpt-6-sol"];
    delete saved.models["gpt-6-luna"];
    saved.models["gpt-6-astra"].short.input = 12;
    const storage = { getItem: () => JSON.stringify(saved) };

    const loaded = loadSavedPricingCatalog(storage)!;
    expect(loaded.version).toBe(`${API_PRICING_CATALOG.version}-custom`);
    expect(loaded.models["gpt-6-astra"].short.input).toBe(12);
    expect(estimateTaskApiCost(task({ model: "gpt-6-sol" }), loaded)?.total).toBeCloseTo(0.48, 8);
    expect(estimateTaskApiCost(task({ model: "gpt-6-luna" }), loaded)?.total).toBeCloseTo(0.024, 8);

    saved.models["gpt-6-sol"] = {
      aliases: ["gpt-6-sol"],
      short: { input: 3, cachedInput: 0.3, output: 15 }
    };
    expect(loadSavedPricingCatalog(storage)?.models["gpt-6-sol"]).toEqual(saved.models["gpt-6-sol"]);
  });
});
