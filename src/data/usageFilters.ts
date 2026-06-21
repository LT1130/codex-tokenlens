import type { TimeRange, UsageTask } from "./usageTypes";

export type DateWindow = {
  startDate: string;
  endDate: string;
};

export function getTaskActivityDate(task: UsageTask) {
  return new Date(task.updatedAt ?? task.startedAt);
}

export function isDateWindowInvalid(window: DateWindow) {
  return Boolean(window.startDate && window.endDate && window.startDate > window.endDate);
}

export function isWithinRange(task: UsageTask, range: TimeRange, customWindow: DateWindow, now = new Date()) {
  const taskDate = getTaskActivityDate(task);
  if (Number.isNaN(taskDate.getTime())) return false;

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  if (range === "today") {
    return taskDate >= startOfToday && taskDate <= now;
  }

  if (range === "custom") {
    if (isDateWindowInvalid(customWindow)) return false;
    const start = customWindow.startDate ? new Date(`${customWindow.startDate}T00:00:00`) : new Date(0);
    const end = customWindow.endDate ? new Date(`${customWindow.endDate}T23:59:59.999`) : now;
    return taskDate >= start && taskDate <= end;
  }

  const days = range === "7d" ? 7 : 30;
  const start = new Date(startOfToday);
  start.setDate(start.getDate() - days + 1);
  return taskDate >= start && taskDate <= now;
}
