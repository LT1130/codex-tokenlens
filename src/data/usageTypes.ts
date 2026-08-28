export type TokenBucket = {
  input: number;
  output: number;
  cache: number;
  reasoning: number;
};

export type UsageSegment = TokenBucket & {
  timestamp?: string;
  model?: string;
  contextWindow?: number;
};

export type UsageTask = TokenBucket & {
  id: string;
  title: string;
  project: string;
  projectPath?: string;
  startedAt: string;
  updatedAt?: string;
  durationMinutes: number;
  model: string;
  sourcePath?: string;
  usageSegments?: UsageSegment[];
  status?: "completed" | "inProgress" | "aborted";
};

export type ScanDiagnostics = {
  scannedFiles: number;
  failedFiles: number;
  skippedLines: number;
  watcherActive: boolean;
  issues: Array<{ path: string; message: string }>;
};

export type TimeRange = "today" | "7d" | "30d" | "custom";

export type TrendPoint = TokenBucket & {
  label: string;
  total: number;
};

export type ProjectSummary = {
  project: string;
  total: number;
  taskCount: number;
  average: number;
};

export type CodexRateLimitWindow = {
  usedPercent: number;
  windowMinutes: number;
  resetsAt: number;
};

export type CodexRateLimits = {
  primary?: CodexRateLimitWindow;
  secondary?: CodexRateLimitWindow;
  limitId?: string;
  limitName?: string;
  planType?: string;
  credits?: unknown;
  individualLimit?: unknown;
  spendControlReached?: boolean;
  rateLimitReachedType?: string;
  sourcePath?: string;
  capturedAt?: string;
};

export function getTaskTotal(task: TokenBucket): number {
  return task.input + task.output;
}

export type UsageSegmentConsistency = "unavailable" | "complete" | "mismatch";

export function sumUsageSegments(task: UsageTask): TokenBucket {
  return (task.usageSegments ?? []).reduce<TokenBucket>(
    (total, segment) => ({
      input: total.input + segment.input,
      output: total.output + segment.output,
      cache: total.cache + segment.cache,
      reasoning: total.reasoning + segment.reasoning
    }),
    { input: 0, output: 0, cache: 0, reasoning: 0 }
  );
}

export function getUsageSegmentConsistency(task: UsageTask): UsageSegmentConsistency {
  if (!task.usageSegments?.length) return "unavailable";
  const segments = sumUsageSegments(task);
  return segments.input === task.input &&
    segments.output === task.output &&
    segments.cache === task.cache &&
    segments.reasoning === task.reasoning
    ? "complete"
    : "mismatch";
}
