import { describe, expect, it } from "vitest";
import { getUsageSegmentConsistency, sumUsageSegments, type UsageTask } from "./usageTypes";

const baseTask: UsageTask = {
  id: "task",
  title: "Consistency",
  project: "tokenlens",
  startedAt: "2026-06-21T00:00:00Z",
  durationMinutes: 1,
  model: "gpt-5.5",
  input: 300,
  cache: 120,
  output: 30,
  reasoning: 8
};

describe("usage segment consistency", () => {
  it("distinguishes unavailable, complete, and mismatched call details", () => {
    expect(getUsageSegmentConsistency(baseTask)).toBe("unavailable");
    const complete = {
      ...baseTask,
      usageSegments: [
        { input: 100, cache: 40, output: 10, reasoning: 3 },
        { input: 200, cache: 80, output: 20, reasoning: 5 }
      ]
    };
    expect(getUsageSegmentConsistency(complete)).toBe("complete");
    expect(sumUsageSegments(complete)).toEqual({ input: 300, cache: 120, output: 30, reasoning: 8 });
    expect(getUsageSegmentConsistency({ ...complete, input: 301 })).toBe("mismatch");
  });
});
