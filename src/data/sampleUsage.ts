import type { UsageTask } from "./usageTypes";

function sampleTimestamp(minutesAgo: number) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

export const sampleUsageTasks: UsageTask[] = [
  {
    id: "task-001",
    title: "TokenLens project planning",
    project: "codex-tokenlens",
    startedAt: sampleTimestamp(38),
    durationMinutes: 26,
    model: "gpt-5.6-sol",
    input: 18420,
    output: 6910,
    cache: 11280,
    reasoning: 4380,
    usageSegments: [
      { timestamp: sampleTimestamp(32), model: "gpt-5.6-sol", contextWindow: 272000, input: 5000, output: 1800, cache: 3000, reasoning: 900 },
      { timestamp: sampleTimestamp(22), model: "gpt-5.6-sol", contextWindow: 272000, input: 6200, output: 2300, cache: 4000, reasoning: 1400 },
      { timestamp: sampleTimestamp(12), model: "gpt-5.6-sol", contextWindow: 272000, input: 7220, output: 2810, cache: 4280, reasoning: 2080 }
    ]
  },
  {
    id: "task-002",
    title: "Usage dashboard shell",
    project: "codex-tokenlens",
    startedAt: sampleTimestamp(95),
    durationMinutes: 44,
    model: "gpt-5.6-terra",
    input: 22880,
    output: 10440,
    cache: 15320,
    reasoning: 5820
  },
  {
    id: "task-003",
    title: "Local log parser sketch",
    project: "codex-tokenlens",
    startedAt: sampleTimestamp(185),
    durationMinutes: 31,
    model: "gpt-5.6-terra",
    input: 14200,
    output: 5120,
    cache: 9180,
    reasoning: 3760
  },
  {
    id: "task-004",
    title: "Release workflow notes",
    project: "codex-tokenlens",
    startedAt: sampleTimestamp(305),
    durationMinutes: 18,
    model: "gpt-5.6-luna",
    input: 8760,
    output: 3410,
    cache: 6440,
    reasoning: 2210
  },
  {
    id: "task-005",
    title: "CLI error triage",
    project: "study-tools",
    startedAt: sampleTimestamp(1_460),
    durationMinutes: 38,
    model: "gpt-5.4",
    input: 19380,
    output: 7300,
    cache: 12200,
    reasoning: 4910
  },
  {
    id: "task-006",
    title: "Notebook export cleanup",
    project: "study-tools",
    startedAt: sampleTimestamp(2_940),
    durationMinutes: 29,
    model: "gpt-5.4",
    input: 12100,
    output: 4640,
    cache: 8820,
    reasoning: 3180
  },
  {
    id: "task-007",
    title: "React layout review",
    project: "client-portal",
    startedAt: sampleTimestamp(4_420),
    durationMinutes: 52,
    model: "gpt-5.4",
    input: 31700,
    output: 12680,
    cache: 20500,
    reasoning: 6920
  },
  {
    id: "task-008",
    title: "Database migration guardrails",
    project: "client-portal",
    startedAt: sampleTimestamp(5_900),
    durationMinutes: 47,
    model: "gpt-5.4",
    input: 28600,
    output: 9480,
    cache: 17450,
    reasoning: 6350
  },
  {
    id: "task-009",
    title: "PDF parsing prototype",
    project: "doc-pipeline",
    startedAt: sampleTimestamp(7_380),
    durationMinutes: 41,
    model: "gpt-5.4",
    input: 24400,
    output: 10160,
    cache: 13900,
    reasoning: 5840
  },
  {
    id: "task-010",
    title: "Chart interaction pass",
    project: "codex-tokenlens",
    startedAt: sampleTimestamp(8_860),
    durationMinutes: 33,
    model: "gpt-5.4",
    input: 16900,
    output: 6380,
    cache: 10420,
    reasoning: 3970
  }
];
