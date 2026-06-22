import { describe, expect, it } from "vitest";
import { getTaskTotal, type UsageTask } from "./usageTypes";
import { isDateWindowInvalid, isWithinRange } from "./usageFilters";

function taskAt(timestamp: string): UsageTask {
  return {
    id: timestamp,
    title: "test",
    project: "tokenlens",
    startedAt: timestamp,
    durationMinutes: 1,
    model: "test-model",
    input: 100,
    output: 40,
    cache: 60,
    reasoning: 20
  };
}

describe("usage date filters", () => {
  const now = new Date("2026-06-18T15:00:00");

  it("includes the entire first day of the last seven days", () => {
    expect(isWithinRange(taskAt("2026-06-12T00:00:00"), "7d", { startDate: "", endDate: "" }, now)).toBe(true);
    expect(isWithinRange(taskAt("2026-06-11T23:59:59"), "7d", { startDate: "", endDate: "" }, now)).toBe(false);
  });

  it("includes the entire first day of the last thirty days", () => {
    expect(isWithinRange(taskAt("2026-05-20T00:00:00"), "30d", { startDate: "", endDate: "" }, now)).toBe(true);
    expect(isWithinRange(taskAt("2026-05-19T23:59:59"), "30d", { startDate: "", endDate: "" }, now)).toBe(false);
  });

  it("uses inclusive custom-date boundaries", () => {
    const window = { startDate: "2026-06-10", endDate: "2026-06-12" };
    expect(isWithinRange(taskAt("2026-06-10T00:00:00"), "custom", window, now)).toBe(true);
    expect(isWithinRange(taskAt("2026-06-12T23:59:59"), "custom", window, now)).toBe(true);
  });

  it("rejects an inverted custom window", () => {
    const window = { startDate: "2026-06-13", endDate: "2026-06-12" };
    expect(isDateWindowInvalid(window)).toBe(true);
    expect(isWithinRange(taskAt("2026-06-12T12:00:00"), "custom", window, now)).toBe(false);
  });
});

describe("token totals", () => {
  it("counts input and output without double-counting cache or reasoning", () => {
    expect(getTaskTotal(taskAt("2026-06-18T12:00:00"))).toBe(140);
  });
});
