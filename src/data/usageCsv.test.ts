import { describe, expect, it } from "vitest";
import { buildUsageCsv, formatLocalDateTime, getTaskDurationSeconds } from "./usageCsv";
import type { UsageTask } from "./usageTypes";

const task: UsageTask = {
  id: "csv-test",
  title: "包含,逗号的任务",
  project: "tokenlens",
  startedAt: "2026-06-18T12:08:52.242Z",
  updatedAt: "2026-06-18T12:09:20.485Z",
  durationMinutes: 1,
  model: "gpt-test",
  input: 100,
  output: 20,
  cache: 60,
  reasoning: 5
};

describe("usage CSV", () => {
  it("formats timestamps as readable local date-times", () => {
    expect(formatLocalDateTime(task.startedAt)).toMatch(/^2026-06-18 \d{2}:08:52$/);
  });

  it("exports the actual duration in seconds", () => {
    expect(getTaskDurationSeconds(task)).toBe(28);
  });

  it("uses clear headers, a UTF-8 BOM, and CSV escaping", () => {
    const csv = buildUsageCsv([task]);
    expect(csv.startsWith("\uFEFFstartTimeLocal,lastActivityTimeLocal")).toBe(true);
    expect(csv).toContain("durationSeconds");
    expect(csv).toContain('"包含,逗号的任务"');
  });
});
