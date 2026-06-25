import { invoke } from "@tauri-apps/api/core";
import { sampleUsageTasks } from "./sampleUsage";
import type { CodexRateLimits, ScanDiagnostics, UsageTask } from "./usageTypes";

export type UsageSource = "loading" | "codex" | "sample" | "empty" | "error";

const SCAN_TIMEOUT_MS = 60_000;
const SCAN_BUSY_RETRY_DELAY_MS = 1_000;
const SCAN_BUSY_RETRY_ATTEMPTS = 20;
const SCAN_BUSY_MESSAGE = "A Codex log scan is already in progress";

export type UsageLoadResult = {
  source: UsageSource;
  tasks: UsageTask[];
  rateLimits?: CodexRateLimits;
  diagnostics?: ScanDiagnostics;
  error?: string;
};

type CodexUsageSnapshot = {
  tasks: UsageTask[];
  rateLimits?: CodexRateLimits;
  diagnostics: ScanDiagnostics;
};

export async function loadUsageTasks(): Promise<UsageLoadResult> {
  if (!("__TAURI_INTERNALS__" in window)) {
    return { source: "sample", tasks: sampleUsageTasks };
  }

  try {
    const snapshot = await invokeSnapshotWithBusyRetry();
    if (snapshot.tasks.length > 0) {
      return { source: "codex", tasks: snapshot.tasks, rateLimits: snapshot.rateLimits, diagnostics: snapshot.diagnostics };
    }
    return {
      source: "empty",
      tasks: [],
      rateLimits: snapshot.rateLimits,
      diagnostics: snapshot.diagnostics
    };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return { source: "error", tasks: [], error: error.message };
    }
    try {
      const tasks = await invokeWithTimeout<UsageTask[]>("scan_codex_usage", 5_000);
      if (tasks.length > 0) {
        return { source: "codex", tasks };
      }
      return { source: "empty", tasks: [] };
    } catch {
      // Keep the original error below; the legacy command is only a compatibility fallback.
    }
    return { source: "error", tasks: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function invokeSnapshotWithBusyRetry() {
  for (let attempt = 0; attempt <= SCAN_BUSY_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await invokeWithTimeout<CodexUsageSnapshot>("scan_codex_snapshot");
    } catch (error) {
      if (!isScanBusyError(error) || attempt === SCAN_BUSY_RETRY_ATTEMPTS) {
        throw error;
      }
      await delay(SCAN_BUSY_RETRY_DELAY_MS);
    }
  }
  throw new Error(SCAN_BUSY_MESSAGE);
}

async function invokeWithTimeout<T>(command: string, timeoutMs = SCAN_TIMEOUT_MS) {
  let timeout: number | undefined;
  try {
    return await Promise.race([
      invoke<T>(command),
      new Promise<T>((_, reject) => {
        timeout = window.setTimeout(() => {
          const error = new Error(`Codex log scan timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
          error.name = "TimeoutError";
          reject(error);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout !== undefined) window.clearTimeout(timeout);
  }
}

function isScanBusyError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).includes(SCAN_BUSY_MESSAGE);
}

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}
