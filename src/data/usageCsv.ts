import { getTaskTotal, type UsageTask } from "./usageTypes";

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function formatLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function getTaskDurationSeconds(task: UsageTask) {
  if (!task.updatedAt) return Math.max(0, Math.round(task.durationMinutes * 60));
  const start = new Date(task.startedAt).getTime();
  const end = new Date(task.updatedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Math.max(0, Math.round(task.durationMinutes * 60));
  return Math.max(0, Math.round((end - start) / 1000));
}

export function buildUsageCsv(tasks: UsageTask[]) {
  const rows = [
    ["startTimeLocal", "lastActivityTimeLocal", "title", "project", "model", "input", "output", "cache", "reasoning", "total", "durationSeconds", "projectPath", "sourcePath"],
    ...tasks.map((task) => [
      formatLocalDateTime(task.startedAt),
      formatLocalDateTime(task.updatedAt ?? task.startedAt),
      task.title,
      task.project,
      task.model,
      String(task.input),
      String(task.output),
      String(task.cache),
      String(task.reasoning),
      String(getTaskTotal(task)),
      String(getTaskDurationSeconds(task)),
      task.projectPath ?? "",
      task.sourcePath ?? ""
    ])
  ];
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}`;
}

function escapeCsvCell(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
