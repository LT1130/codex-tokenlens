import { getUsageSegmentConsistency, type UsageSegment, type UsageTask } from "./usageTypes";
import pricingCatalog from "./apiPricingCatalog.json";

export type TokenRates = {
  input: number;
  cachedInput: number;
  output: number;
};

export type ModelPrice = {
  aliases: string[];
  contextThreshold?: number;
  short: TokenRates;
  long?: TokenRates;
};

export type PricingCatalog = {
  version: string;
  currency: string;
  unit: number;
  serviceTier: string;
  source: string;
  models: Record<string, ModelPrice>;
  customized?: boolean;
};

export type ApiCostBreakdown = {
  total: number;
  uncachedInput: number;
  cachedInput: number;
  output: number;
  pricedTaskCount: number;
  unpricedTaskCount: number;
  approximatedTaskCount: number;
  unpricedModels: string[];
};

export const API_PRICING_CATALOG: PricingCatalog = pricingCatalog;
export const PRICING_STORAGE_KEY = "codex-tokenlens-api-pricing-v1";

export type ApiCallCost = {
  model: string;
  tier: "short" | "long";
  contextThreshold?: number;
  total: number;
  uncachedInput: number;
  cachedInput: number;
  output: number;
};

export type TaskCost = {
  total: number;
  uncachedInput: number;
  cachedInput: number;
  output: number;
  approximated: boolean;
  calls?: ApiCallCost[];
};

function findModelPrice(model: string, catalog: PricingCatalog): ModelPrice | undefined {
  const normalized = model.trim().toLowerCase();
  const prices = Object.values(catalog.models)
    .flatMap((price) => price.aliases.map((alias) => ({ alias: alias.toLowerCase(), price })))
    .sort((left, right) => right.alias.length - left.alias.length);
  return prices.find(({ alias }) =>
    normalized === alias ||
    normalized.startsWith(`${alias}-20`)
  )?.price;
}

function segmentCost(segment: UsageSegment, price: ModelPrice, useContextTier: boolean, unit: number) {
  const useLongPricing = Boolean(useContextTier && price.long && price.contextThreshold && segment.input >= price.contextThreshold);
  const rates = useLongPricing ? price.long! : price.short;
  const cached = Math.min(segment.cache, segment.input);
  const uncached = Math.max(segment.input - cached, 0);
  return {
    tier: useLongPricing ? "long" as const : "short" as const,
    uncachedInput: (uncached / unit) * rates.input,
    cachedInput: (cached / unit) * rates.cachedInput,
    output: (segment.output / unit) * rates.output
  };
}

export function estimateUsageSegmentApiCost(
  segment: UsageSegment,
  fallbackModel: string,
  catalog: PricingCatalog = API_PRICING_CATALOG
): ApiCallCost | undefined {
  const model = segment.model ?? fallbackModel;
  const price = findModelPrice(model, catalog);
  if (!price) return undefined;
  const result = segmentCost(segment, price, true, catalog.unit);
  return {
    model,
    tier: result.tier,
    contextThreshold: price.contextThreshold,
    uncachedInput: result.uncachedInput,
    cachedInput: result.cachedInput,
    output: result.output,
    total: result.uncachedInput + result.cachedInput + result.output
  };
}

export function estimateTaskApiCost(task: UsageTask, catalog: PricingCatalog = API_PRICING_CATALOG): TaskCost | undefined {
  const hasCallDetails = getUsageSegmentConsistency(task) === "complete";
  if (hasCallDetails) {
    const calls = task.usageSegments!.map((segment) => estimateUsageSegmentApiCost(segment, task.model, catalog));
    if (calls.some((call) => !call)) return undefined;
    const pricedCalls = calls as ApiCallCost[];
    const result = pricedCalls.reduce(
      (sum, call) => ({
        uncachedInput: sum.uncachedInput + call.uncachedInput,
        cachedInput: sum.cachedInput + call.cachedInput,
        output: sum.output + call.output
      }),
      { uncachedInput: 0, cachedInput: 0, output: 0 }
    );
    return {
      ...result,
      total: result.uncachedInput + result.cachedInput + result.output,
      approximated: false,
      calls: pricedCalls
    };
  }

  const price = findModelPrice(task.model, catalog);
  if (!price) return undefined;
  const aggregate = { input: task.input, cache: task.cache, output: task.output, reasoning: task.reasoning };
  const result = [aggregate].reduce(
    (sum, segment) => {
      const cost = segmentCost(segment, price, false, catalog.unit);
      return {
        uncachedInput: sum.uncachedInput + cost.uncachedInput,
        cachedInput: sum.cachedInput + cost.cachedInput,
        output: sum.output + cost.output
      };
    },
    { uncachedInput: 0, cachedInput: 0, output: 0 }
  );
  return {
    ...result,
    total: result.uncachedInput + result.cachedInput + result.output,
    approximated: true
  };
}

export function estimateApiCost(tasks: UsageTask[], catalog: PricingCatalog = API_PRICING_CATALOG): ApiCostBreakdown {
  const result: ApiCostBreakdown = {
    total: 0,
    uncachedInput: 0,
    cachedInput: 0,
    output: 0,
    pricedTaskCount: 0,
    unpricedTaskCount: 0,
    approximatedTaskCount: 0,
    unpricedModels: []
  };
  const unpricedModels = new Set<string>();
  tasks.forEach((task) => {
    const cost = estimateTaskApiCost(task, catalog);
    if (!cost) {
      result.unpricedTaskCount += 1;
      unpricedModels.add(task.model);
      return;
    }
    result.total += cost.total;
    result.uncachedInput += cost.uncachedInput;
    result.cachedInput += cost.cachedInput;
    result.output += cost.output;
    result.pricedTaskCount += 1;
    if (cost.approximated) result.approximatedTaskCount += 1;
  });
  result.unpricedModels = [...unpricedModels].sort();
  return result;
}

function validRate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function validTokenRates(value: unknown): value is TokenRates {
  if (!value || typeof value !== "object") return false;
  const rates = value as Partial<TokenRates>;
  return validRate(rates.input) && validRate(rates.cachedInput) && validRate(rates.output);
}

export function isPricingCatalog(value: unknown): value is PricingCatalog {
  if (!value || typeof value !== "object") return false;
  const catalog = value as Partial<PricingCatalog>;
  if (
    typeof catalog.version !== "string" ||
    typeof catalog.currency !== "string" ||
    typeof catalog.serviceTier !== "string" ||
    typeof catalog.source !== "string" ||
    !validRate(catalog.unit) ||
    catalog.unit === 0 ||
    !catalog.models ||
    typeof catalog.models !== "object"
  ) return false;
  return Object.values(catalog.models).every((model) =>
    Array.isArray(model.aliases) &&
    model.aliases.length > 0 &&
    model.aliases.every((alias) => typeof alias === "string" && alias.trim().length > 0) &&
    validTokenRates(model.short) &&
    (model.long === undefined || validTokenRates(model.long)) &&
    (model.contextThreshold === undefined || validRate(model.contextThreshold))
  );
}

export function clonePricingCatalog(catalog: PricingCatalog = API_PRICING_CATALOG): PricingCatalog {
  return JSON.parse(JSON.stringify(catalog)) as PricingCatalog;
}

export function mergePricingCatalog(
  saved: PricingCatalog,
  base: PricingCatalog = API_PRICING_CATALOG
): PricingCatalog {
  const baseCatalog = clonePricingCatalog(base);
  const savedCatalog = clonePricingCatalog(saved);
  return {
    ...baseCatalog,
    models: {
      ...baseCatalog.models,
      ...savedCatalog.models
    },
    version: `${base.version}-custom`,
    customized: true
  };
}

export function loadSavedPricingCatalog(storage: Pick<Storage, "getItem">): PricingCatalog | undefined {
  const raw = storage.getItem(PRICING_STORAGE_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return isPricingCatalog(parsed) ? mergePricingCatalog(parsed) : undefined;
  } catch {
    return undefined;
  }
}

export function savePricingCatalog(catalog: PricingCatalog, storage: Pick<Storage, "setItem">) {
  storage.setItem(PRICING_STORAGE_KEY, JSON.stringify(catalog));
}

export function clearSavedPricingCatalog(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(PRICING_STORAGE_KEY);
}
