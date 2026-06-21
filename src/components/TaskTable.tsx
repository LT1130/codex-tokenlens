import { getTaskTotal, getUsageSegmentConsistency, type UsageTask } from "../data/usageTypes";
import { estimateUsageSegmentApiCost, type PricingCatalog } from "../data/apiPricing";
import type { Locale, Messages } from "../i18n/messages";
import { Fragment, useEffect, useMemo, useState } from "react";

type TaskTableProps = {
  tasks: UsageTask[];
  filterKey: string;
  locale: Locale;
  messages: Messages["table"];
  onRevealPath: (path: string) => void;
  pricingCatalog: PricingCatalog;
  taskCosts: Record<string, number | undefined>;
  taskTitles: Messages["taskTitles"];
};

type SortKey = "startedAt" | "title" | "project" | "model" | "input" | "output" | "cache" | "total";
type SortDirection = "asc" | "desc";
const PAGE_SIZE = 12;

function formatTime(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatCallTime(value: string | undefined, locale: Locale) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function getActivityTime(task: UsageTask) {
  return task.updatedAt ?? task.startedAt;
}

function truncateTaskTitle(value: string, maxChars = 35) {
  return value.length > maxChars ? `${value.slice(0, maxChars)}...` : value;
}

export function TaskTable({ tasks, filterKey, locale, messages, onRevealPath, pricingCatalog, taskCosts, taskTitles }: TaskTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("startedAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const numberFormatter = new Intl.NumberFormat(locale);
  const costFormatter = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const preciseCostFormatter = new Intl.NumberFormat(locale, { minimumFractionDigits: 6, maximumFractionDigits: 6 });

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;
      const aValue = sortValue(a, sortKey);
      const bValue = sortValue(b, sortKey);
      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * direction;
      }
      return String(aValue).localeCompare(String(bValue), locale) * direction;
    });
  }, [locale, sortDirection, sortKey, tasks]);
  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = sortedTasks.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * PAGE_SIZE, sortedTasks.length);
  const pagedTasks = sortedTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
    setPageInput("1");
    setExpandedId(null);
  }, [filterKey, sortDirection, sortKey]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  function goToPage() {
    const requestedPage = Number.parseInt(pageInput, 10);
    const nextPage = Number.isFinite(requestedPage) ? Math.min(Math.max(requestedPage, 1), totalPages) : currentPage;
    setExpandedId(null);
    setPage(nextPage);
    setPageInput(String(nextPage));
  }

  function updateSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDirection(nextKey === "startedAt" || nextKey === "total" ? "desc" : "asc");
  }

  function header(label: string, key: SortKey) {
    const active = sortKey === key;
    return (
      <button className={active ? "table-sort table-sort--active" : "table-sort"} type="button" onClick={() => updateSort(key)} title={messages.sortBy}>
        {label}
        <span>{active ? (sortDirection === "asc" ? "↑" : "↓") : ""}</span>
      </button>
    );
  }

  return (
    <section className="panel task-table-panel">
      <div className="panel__header">
        <div>
          <p>{messages.eyebrow}</p>
          <h2>{messages.title}</h2>
        </div>
        <span>{messages.taskCount(tasks.length)}</span>
      </div>
      <div className="table-wrap">
        {tooltip && (
          <div className="task-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
            {tooltip.text}
          </div>
        )}
        <table>
          <thead>
            <tr>
              <th>{header(messages.time, "startedAt")}</th>
              <th>{messages.status}</th>
              <th>{header(messages.project, "project")}</th>
              <th>{header(messages.task, "title")}</th>
              <th>{header(messages.model, "model")}</th>
              <th>{header(messages.input, "input")}</th>
              <th>{header(messages.cache, "cache")}</th>
              <th>{header(messages.output, "output")}</th>
              <th>{messages.apiCost}</th>
              <th>{header(messages.total, "total")}</th>
            </tr>
          </thead>
          <tbody>
            {sortedTasks.length === 0 && (
              <tr>
                <td className="empty-table" colSpan={10}>
                  {messages.empty}
                </td>
              </tr>
            )}
            {pagedTasks.map((task) => {
              const total = getTaskTotal(task);
              const expanded = expandedId === task.id;
              const bars = [
                { label: messages.input, value: task.input, tone: "cyan" },
                { label: messages.cache, value: task.cache, tone: "amber" },
                { label: messages.output, value: task.output, tone: "green" },
                { label: messages.reasoning, value: task.reasoning, tone: "violet" }
              ];
              const fullTitle = taskTitles[task.id] ?? task.title;
              return (
                <Fragment key={task.id}>
                  <tr className={expanded ? "task-row task-row--expanded" : "task-row"} key={task.id} onClick={() => setExpandedId(expanded ? null : task.id)}>
                    <td>{formatTime(getActivityTime(task), locale)}</td>
                    <td>
                      <span className={task.status === "inProgress" ? "task-status task-status--active" : "task-status"}>
                        {task.status === "inProgress" ? messages.inProgress : task.status === "aborted" ? messages.aborted : messages.completed}
                      </span>
                    </td>
                    <td>{task.project}</td>
                    <td>
                      <strong
                        className="task-title"
                        onMouseEnter={(event) => setTooltip({ text: fullTitle, x: event.clientX + 14, y: event.clientY + 14 })}
                        onMouseMove={(event) => setTooltip((current) => (current ? { ...current, x: event.clientX + 14, y: event.clientY + 14 } : current))}
                        onMouseLeave={() => setTooltip(null)}
                      >
                        {truncateTaskTitle(fullTitle)}
                      </strong>
                    </td>
                    <td>{task.model}</td>
                    <td>{numberFormatter.format(task.input)}</td>
                    <td>{numberFormatter.format(task.cache)}</td>
                    <td>{numberFormatter.format(task.output)}</td>
                    <td className="task-cost" title={taskCosts[task.id] === undefined ? messages.costUnavailable : undefined}>
                      {taskCosts[task.id] === undefined ? "—" : `$${costFormatter.format(taskCosts[task.id]!)}`}
                    </td>
                    <td>{numberFormatter.format(total)}</td>
                  </tr>
                  {expanded && (
                    <tr className="task-detail-row">
                      <td colSpan={10}>
                        <div className="task-detail-shell">
                          <div className="task-detail">
                            <div className="task-location">
                              <div className="task-location__header"><p>{messages.projectPath}</p>
                              {task.projectPath && (
                                <button className="detail-action" type="button" onClick={(event) => {
                                  event.stopPropagation();
                                  onRevealPath(task.projectPath!);
                                }}>
                                  {messages.openProject}
                                </button>
                              )}</div>
                              <strong title={task.projectPath ?? task.project}>{task.projectPath ?? task.project}</strong>
                            </div>
                            <div className="task-location">
                              <div className="task-location__header"><p>{messages.sourcePath}</p>
                              {task.sourcePath && (
                                <button className="detail-action" type="button" onClick={(event) => {
                                  event.stopPropagation();
                                  onRevealPath(task.sourcePath!);
                                }}>
                                  {messages.revealLog}
                                </button>
                              )}</div>
                              <strong title={task.sourcePath ?? task.id}>{task.sourcePath ?? task.id}</strong>
                            </div>
                            <div className="token-summary">
                              <p>{messages.tokenBreakdown}</p>
                              <div className="token-summary__grid">
                              {bars.map(({ label, value, tone }) => (
                                <div className="token-summary__item" key={label}>
                                  <i className={`token-summary__dot token-summary__dot--${tone}`} />
                                  <span>{label}</span>
                                  <strong>{numberFormatter.format(value)}</strong>
                                </div>
                              ))}
                              </div>
                            </div>
                          </div>
                          <ModelCallDetails task={task} locale={locale} messages={messages} numberFormatter={numberFormatter} costFormatter={costFormatter} preciseCostFormatter={preciseCostFormatter} pricingCatalog={pricingCatalog} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {sortedTasks.length > PAGE_SIZE && (
        <div className="table-pagination">
          <span>{messages.pageSummary(pageStart, pageEnd, sortedTasks.length, currentPage, totalPages)}</span>
          <div>
            <form
              className="page-jump"
              onSubmit={(event) => {
                event.preventDefault();
                goToPage();
              }}
            >
              <label htmlFor="task-page-input">{messages.goToPage}</label>
              <input
                id="task-page-input"
                type="number"
                min={1}
                max={totalPages}
                value={pageInput}
                aria-label={messages.goToPage}
                onChange={(event) => setPageInput(event.target.value)}
                onBlur={goToPage}
              />
              <span>{messages.pageUnit}</span>
            </form>
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => {
                setExpandedId(null);
                setPage((value) => Math.max(1, value - 1));
              }}
            >
              {messages.previous}
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => {
                setExpandedId(null);
                setPage((value) => Math.min(totalPages, value + 1));
              }}
            >
              {messages.next}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ModelCallDetails({ task, locale, messages, numberFormatter, costFormatter, preciseCostFormatter, pricingCatalog }: {
  task: UsageTask;
  locale: Locale;
  messages: Messages["table"];
  numberFormatter: Intl.NumberFormat;
  costFormatter: Intl.NumberFormat;
  preciseCostFormatter: Intl.NumberFormat;
  pricingCatalog: PricingCatalog;
}) {
  const calls = task.usageSegments ?? [];
  const consistency = getUsageSegmentConsistency(task);
  return (
    <div className="model-call-detail">
      <div className="model-call-detail__header">
        <p>{messages.modelCalls}</p>
        <span>{messages.callCount(calls.length)}</span>
      </div>
      {consistency === "mismatch" && <div className="model-call-detail__warning">{messages.callDetailsMismatch}</div>}
      {calls.length === 0 ? <div className="model-call-detail__empty">{messages.callDetailsUnavailable}</div> : (
        <>
        <div className="model-call-grid-wrap">
          <div className="model-call-grid model-call-grid--header">
            <span>{messages.callNumber}</span>
            <span>{messages.recordedAt}</span>
            <span>{messages.model}</span>
            <span>{messages.contextTier}</span>
            <span>{messages.input}</span>
            <span>{messages.cache}</span>
            <span>{messages.output}</span>
            <span>{messages.reasoning}</span>
            <span>{messages.apiCost}</span>
          </div>
          {calls.map((call, index) => {
            const cost = estimateUsageSegmentApiCost(call, task.model, pricingCatalog);
            const contextWindow = call.contextWindow ? messages.contextWindow(numberFormatter.format(call.contextWindow)) : undefined;
            const costTitle = cost
              ? messages.callCostBreakdown(
                `$${preciseCostFormatter.format(cost.total)}`,
                `$${preciseCostFormatter.format(cost.uncachedInput)}`,
                `$${preciseCostFormatter.format(cost.cachedInput)}`,
                `$${preciseCostFormatter.format(cost.output)}`
              )
              : messages.costUnavailable;
            return (
              <div className="model-call-grid" key={`${call.timestamp ?? "call"}-${index}`}>
                <strong>{index + 1}</strong>
                <span>{formatCallTime(call.timestamp, locale)}</span>
                <span>{call.model ?? task.model}</span>
                <span className={cost?.tier === "long" ? "context-tier context-tier--long" : "context-tier"}>
                  {cost ? (cost.tier === "long" ? messages.longContext : messages.shortContext) : "—"}
                  {contextWindow && <small>{contextWindow}</small>}
                </span>
                <span>{numberFormatter.format(call.input)}</span>
                <span>{numberFormatter.format(call.cache)}</span>
                <span>{numberFormatter.format(call.output)}</span>
                <span>{numberFormatter.format(call.reasoning)}</span>
                <strong className="model-call-cost" title={costTitle}>{cost ? `$${costFormatter.format(cost.total)}` : "—"}</strong>
              </div>
            );
          })}
        </div>
        <p className="model-call-rounding-note">{messages.callRoundingNote}</p>
        </>
      )}
    </div>
  );
}

function sortValue(task: UsageTask, key: SortKey): number | string {
  if (key === "startedAt") {
    return new Date(getActivityTime(task)).getTime();
  }
  if (key === "total") {
    return getTaskTotal(task);
  }
  return task[key];
}
