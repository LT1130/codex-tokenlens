import { invoke } from "@tauri-apps/api/core";
import { sampleUsageTasks } from "./sampleUsage";
import type { CodexRateLimits, ScanDiagnostics, UsageTask } from "./usageTypes";

export type UsageSource = "loading" | "codex" | "sample" | "empty" | "error";

const SCAN_TIMEOUT_MS = 15_000;

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
    const snapshot = await invokeWithTimeout<CodexUsageSnapshot>("scan_codex_snapshot");
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
