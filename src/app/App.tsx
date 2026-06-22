import {
  Activity,
  BarChart3,
  BookOpen,
  Boxes,
  Brain,
  CalendarDays,
  ChevronDown,
  CheckSquare,
  CircleAlert,
  CircleDollarSign,
  DatabaseZap,
  Download,
  FolderOpen,
  Gauge,
  Languages,
  RefreshCw,
  Search,
  ShieldCheck,
  TerminalSquare,
  TrendingUp
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { MetricCard } from "../components/MetricCard";
import { PricingSettingsModal } from "../components/PricingSettingsModal";
import { TaskTable } from "../components/TaskTable";
import { UnderstandingGuide } from "../components/UnderstandingGuide";
import { CompositionChart } from "../components/charts/CompositionChart";
import { TrendChart } from "../components/charts/TrendChart";
import { getTaskActivityDate, isDateWindowInvalid, isWithinRange, type DateWindow } from "../data/usageFilters";
import { loadUsageTasks, type UsageSource } from "../data/usageLoader";
import { buildUsageCsv } from "../data/usageCsv";
import {
  clearSavedPricingCatalog,
  clonePricingCatalog,
  estimateApiCost,
  estimateTaskApiCost,
  loadSavedPricingCatalog,
  savePricingCatalog,
  type ApiCostBreakdown,
  type PricingCatalog
} from "../data/apiPricing";
import {
  getTaskTotal,
  type CodexRateLimits,
  type CodexRateLimitWindow,
  type ProjectSummary,
  type ScanDiagnostics,
  type TimeRange,
  type TokenBucket,
  type TrendPoint,
  type UsageTask
} from "../data/usageTypes";
import { messages, type Locale, type Messages } from "../i18n/messages";
import { guideContent } from "../i18n/guideContent";

const AUTO_REFRESH_INTERVAL_MS = 15_000;
const OFFICIAL_PRICING_URL = "https://developers.openai.com/api/docs/pricing";

function sumTokens(tasks: UsageTask[]): TokenBucket {
  return tasks.reduce(
    (acc, task) => ({
      input: acc.input + task.input,
      output: acc.output + task.output,
      cache: acc.cache + task.cache,
      reasoning: acc.reasoning + task.reasoning
    }),
    { input: 0, output: 0, cache: 0, reasoning: 0 }
  );
}

function formatDateInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildTrend(tasks: UsageTask[], range: TimeRange, locale: Locale, customWindow: DateWindow): TrendPoint[] {
  const buckets = new Map<string, TokenBucket>();
  const labels = new Map<string, string>();
  const now = new Date();
  const empty = (): TokenBucket => ({ input: 0, output: 0, cache: 0, reasoning: 0 });
  const keyFor = (date: Date) => range === "today" ? `${formatDateInput(date)}-${date.getHours()}` : formatDateInput(date);
  const labelFor = (date: Date) =>
    range === "today"
      ? new Intl.DateTimeFormat(locale, { hour: "2-digit" }).format(date)
      : new Intl.DateTimeFormat(locale, { month: "short", day: "2-digit" }).format(date);

  if (range === "today") {
    for (let hour = 0; hour <= now.getHours(); hour += 1) {
      const date = new Date(now);
      date.setHours(hour, 0, 0, 0);
      buckets.set(keyFor(date), empty());
      labels.set(keyFor(date), labelFor(date));
    }
  } else {
    const start = range === "custom" && customWindow.startDate
      ? new Date(`${customWindow.startDate}T00:00:00`)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() - (range === "7d" ? 6 : 29));
    const end = range === "custom" && customWindow.endDate
      ? new Date(`${customWindow.endDate}T00:00:00`)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate());
    for (let date = new Date(start), count = 0; date <= end && count < 366; date.setDate(date.getDate() + 1), count += 1) {
      const point = new Date(date);
      buckets.set(keyFor(point), empty());
      labels.set(keyFor(point), labelFor(point));
    }
  }

  tasks.forEach((task) => {
    const date = getTaskActivityDate(task);
    const key = keyFor(date);
    const current = buckets.get(key) ?? empty();
    buckets.set(key, {
      input: current.input + task.input,
      output: current.output + task.output,
      cache: current.cache + task.cache,
      reasoning: current.reasoning + task.reasoning
    });
    labels.set(key, labelFor(date));
  });

  return Array.from(buckets.entries()).map(([key, value]) => ({
    label: labels.get(key) ?? key,
    ...value,
    total: getTaskTotal(value)
  }));
}

function buildProjectSummary(tasks: UsageTask[]): ProjectSummary[] {
  const map = new Map<string, { total: number; taskCount: number }>();
  tasks.filter((task) => task.status !== "inProgress").forEach((task) => {
    const current = map.get(task.project) ?? { total: 0, taskCount: 0 };
    map.set(task.project, {
      total: current.total + getTaskTotal(task),
      taskCount: current.taskCount + 1
    });
  });

  return Array.from(map.entries())
    .map(([project, summary]) => ({
      project,
      total: summary.total,
      taskCount: summary.taskCount,
      average: Math.round(summary.total / summary.taskCount)
    }))
    .sort((a, b) => b.total - a.total);
}

function getUsageSnapshotSignature(
  tasks: UsageTask[],
  source: UsageSource,
  rateLimits: CodexRateLimits | undefined,
  diagnostics: ScanDiagnostics | undefined,
  error: string | undefined
) {
  const taskSignature = tasks
    .map((task) =>
      [
        task.id,
        task.title,
        task.project,
        task.projectPath,
        task.startedAt,
        task.updatedAt,
        task.durationMinutes,
        task.model,
        task.sourcePath,
        task.input,
        task.output,
        task.cache,
        task.reasoning,
        task.status,
        task.usageSegments?.map((segment) => [
          segment.timestamp,
          segment.model,
          segment.contextWindow,
          segment.input,
          segment.cache,
          segment.output,
          segment.reasoning
        ].join(",")).join(";")
      ].join(":")
    )
    .join("|");
  const rateLimitSignature = [
    rateLimits?.primary?.usedPercent,
    rateLimits?.primary?.windowMinutes,
    rateLimits?.primary?.resetsAt,
    rateLimits?.secondary?.usedPercent,
    rateLimits?.secondary?.windowMinutes,
    rateLimits?.secondary?.resetsAt,
    rateLimits?.planType,
    rateLimits?.sourcePath
  ].join(":");
  const diagnosticSignature = diagnostics
    ? `${diagnostics.scannedFiles}:${diagnostics.failedFiles}:${diagnostics.skippedLines}:${diagnostics.watcherActive}:${JSON.stringify(diagnostics.issues)}`
    : "";
  return `${source}:${error ?? ""}:${rateLimitSignature}:${diagnosticSignature}:${taskSignature}`;
}

export default function App() {
  const [project, setProject] = useState("all");
  const [range, setRange] = useState<TimeRange>("today");
  const [query, setQuery] = useState("");
  const [locale, setLocale] = useState<Locale>("zh-CN");
  const [tasks, setTasks] = useState<UsageTask[]>([]);
  const [usageSource, setUsageSource] = useState<UsageSource>("loading");
  const [rateLimits, setRateLimits] = useState<CodexRateLimits | undefined>();
  const [diagnostics, setDiagnostics] = useState<ScanDiagnostics | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [activeSection, setActiveSection] = useState("overview");
  const [notice, setNotice] = useState<string | undefined>();
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingCatalog, setPricingCatalog] = useState<PricingCatalog>(() =>
    loadSavedPricingCatalog(window.localStorage) ?? clonePricingCatalog()
  );
  const refreshInProgress = useRef(false);
  const usageSnapshotSignature = useRef<string>();
  const refreshButtonRef = useRef<HTMLButtonElement>(null);
  const refreshStatusRef = useRef<HTMLSpanElement>(null);
  const localeRef = useRef(locale);
  const [customWindow, setCustomWindow] = useState<DateWindow>(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    return {
      startDate: formatDateInput(start),
      endDate: formatDateInput(end)
    };
  });
  const t = messages[locale];
  localeRef.current = locale;
  const customWindowInvalid = range === "custom" && isDateWindowInvalid(customWindow);

  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const compactFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        notation: "compact",
        maximumFractionDigits: 1
      }),
    [locale]
  );
  const costFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [locale]
  );

  const formatToken = (value: number) => numberFormatter.format(value);

  const refreshUsage = useCallback(async () => {
    if (refreshInProgress.current) return;
    refreshInProgress.current = true;
    refreshButtonRef.current?.classList.add("icon-button--refreshing");
    try {
      const result = await loadUsageTasks();
      const nextSignature = getUsageSnapshotSignature(result.tasks, result.source, result.rateLimits, result.diagnostics, result.error);
      if (usageSnapshotSignature.current === nextSignature) return;
      usageSnapshotSignature.current = nextSignature;
      setTasks(result.tasks);
      setUsageSource(result.source);
      setRateLimits(result.rateLimits);
      setDiagnostics(result.diagnostics);
      setLoadError(result.error);
    } finally {
      refreshInProgress.current = false;
      refreshButtonRef.current?.classList.remove("icon-button--refreshing");
      if (refreshStatusRef.current) {
        const time = new Intl.DateTimeFormat(localeRef.current, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date());
        refreshStatusRef.current.textContent = messages[localeRef.current].header.lastUpdated(time);
      }
    }
  }, []);

  function scrollToSection(sectionId: string) {
    setActiveSection(sectionId);
    window.requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function exportCsv() {
    void saveCsv(buildUsageCsv(filteredTasks));
  }

  function openOfficialDocumentation(url: string) {
    const openBrowserTab = () => { window.open(url, "_blank", "noopener,noreferrer"); };
    if ("__TAURI_INTERNALS__" in window) {
      void invoke("open_official_documentation", { url }).catch(openBrowserTab);
      return;
    }
    openBrowserTab();
  }

  function openOfficialPricing() {
    openOfficialDocumentation(OFFICIAL_PRICING_URL);
  }

  async function saveCsv(csv: string) {
    try {
      const path = await invoke<string>("save_usage_csv", { csv });
      setNotice(t.header.exportedTo(path));
    } catch {
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `codex-tokenlens-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice(t.header.exported);
    }
    window.setTimeout(() => setNotice(undefined), 3200);
  }

  async function revealTaskPath(path: string) {
    try {
      await invoke("reveal_path", { path });
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      window.setTimeout(() => setNotice(undefined), 3200);
    }
  }

  async function openCodexDirectory() {
    try {
      await invoke("open_codex_directory");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
      window.setTimeout(() => setNotice(undefined), 4200);
    }
  }

  function retryUsage() {
    usageSnapshotSignature.current = undefined;
    setUsageSource("loading");
    setLoadError(undefined);
    void refreshUsage();
  }

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const scheduleNextRefresh = () => {
      timer = window.setTimeout(async () => {
        await refreshUsage();
        if (!cancelled) scheduleNextRefresh();
      }, AUTO_REFRESH_INTERVAL_MS);
    };

    void refreshUsage();
    scheduleNextRefresh();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refreshUsage]);

  const projects = useMemo(() => ["all", ...Array.from(new Set(tasks.map((task) => task.project)))], [tasks]);
  const projectOptions = useMemo(
    () => projects.map((item) => ({ value: item, label: item === "all" ? t.filters.allProjects : item })),
    [projects, t.filters.allProjects]
  );
  const languageOptions = useMemo(
    () => [
      { value: "zh-CN", label: "中文" },
      { value: "en-US", label: "English" }
    ],
    []
  );

  useEffect(() => {
    if (!projects.includes(project)) setProject("all");
  }, [project, projects]);

  const timeAndQueryTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(locale);
    return tasks
      .filter((task) => isWithinRange(task, range, customWindow))
      .filter((task) => task.title.toLocaleLowerCase(locale).includes(normalizedQuery))
      .sort((a, b) => getTaskActivityDate(b).getTime() - getTaskActivityDate(a).getTime());
  }, [customWindow, locale, query, range, tasks]);

  const filteredTasks = useMemo(() => {
    return timeAndQueryTasks.filter((task) => project === "all" || task.project === project);
  }, [project, timeAndQueryTasks]);

  const totals = useMemo(() => sumTokens(filteredTasks), [filteredTasks]);
  const apiCost = useMemo(() => estimateApiCost(filteredTasks, pricingCatalog), [filteredTasks, pricingCatalog]);
  const taskCosts = useMemo(
    () => Object.fromEntries(filteredTasks.map((task) => [task.id, estimateTaskApiCost(task, pricingCatalog)?.total])),
    [filteredTasks, pricingCatalog]
  );
  const totalTokens = getTaskTotal(totals);
  const completedTasks = useMemo(() => filteredTasks.filter((task) => task.status !== "inProgress"), [filteredTasks]);
  const completedTotals = useMemo(() => sumTokens(completedTasks), [completedTasks]);
  const completedTaskCount = completedTasks.length;
  const trend = useMemo(() => buildTrend([...filteredTasks].reverse(), range, locale, customWindow), [customWindow, filteredTasks, locale, range]);
  const projectSummary = useMemo(() => buildProjectSummary(timeAndQueryTasks), [timeAndQueryTasks]);
  const averageTask = completedTaskCount > 0 ? Math.round(getTaskTotal(completedTotals) / completedTaskCount) : 0;
  const maxTask = filteredTasks.reduce((max, task) => Math.max(max, getTaskTotal(task)), 0);
  const sourceLabel =
    usageSource === "loading"
      ? t.source.loading
      : usageSource === "codex"
        ? t.source.loaded
        : usageSource === "empty"
          ? t.source.empty
          : usageSource === "error"
            ? t.source.error
            : t.source.fallback;
  const diagnosticLabel = diagnostics
    ? t.source.diagnostics(diagnostics.scannedFiles, diagnostics.skippedLines, diagnostics.failedFiles)
    : undefined;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand__mark">
            <TerminalSquare size={24} />
          </div>
          <div>
            <strong>TokenLens</strong>
            <span>{t.brandSubtitle}</span>
          </div>
        </div>

        <nav className="nav-stack" aria-label="Primary">
          <button className={activeSection === "overview" ? "nav-item nav-item--active" : "nav-item"} type="button" onClick={() => scrollToSection("overview")}>
            <Gauge size={18} />
            {t.nav.overview}
          </button>
          <button className={activeSection === "trends" ? "nav-item nav-item--active" : "nav-item"} type="button" onClick={() => scrollToSection("trends")}>
            <BarChart3 size={18} />
            {t.nav.trends}
          </button>
          <button className={activeSection === "logs" ? "nav-item nav-item--active" : "nav-item"} type="button" onClick={() => scrollToSection("logs")}>
            <CheckSquare size={18} />
            {t.nav.tasks}
          </button>
          <button className={activeSection === "guide" ? "nav-item nav-item--active" : "nav-item"} type="button" onClick={() => setActiveSection("guide")}>
            <BookOpen size={18} />
            {t.nav.guide}
          </button>
        </nav>

        <section className="log-source">
          <div>
            <p>{t.source.label}</p>
            <strong>
              {usageSource === "loading"
                ? t.source.loading
                : usageSource === "codex"
                  ? t.source.codex
                  : usageSource === "sample"
                    ? t.source.sample
                    : t.source.codex}
            </strong>
          </div>
          <span title={loadError}>{sourceLabel}</span>
        </section>
      </aside>

      <section className="workspace" aria-busy={usageSource === "loading"}>
        <header className="topbar">
          <div>
            <h1>{activeSection === "guide" ? t.nav.guide : t.header.title}</h1>
            <p>{activeSection === "guide" ? guideContent[locale].eyebrow : t.header.eyebrow}</p>
          </div>
          <div className="topbar__actions">
            {activeSection !== "guide" && (
              <>
            <div className="range-tabs">
              {[
                ["today", t.ranges.today],
                ["7d", t.ranges.last7d],
                ["30d", t.ranges.last30d],
                ["custom", t.ranges.custom]
              ].map(([value, label]) => (
                <button className={range === value ? "range-tab range-tab--active" : "range-tab"} key={value} type="button" onClick={() => setRange(value as TimeRange)}>
                  {label}
                </button>
              ))}
            </div>
            <PillSelect
              ariaLabel={t.filters.allProjects}
              className="project-select"
              onChange={setProject}
              options={projectOptions}
              value={project}
            />
              </>
            )}
            <PillSelect
              ariaLabel="Language"
              className="language-select"
              leadingIcon={<Languages size={16} />}
              onChange={(value) => setLocale(value as Locale)}
              options={languageOptions}
              title="Language"
              value={locale}
            />
            {activeSection !== "guide" && (
              <>
            <span className="refresh-status" ref={refreshStatusRef}>{t.header.autoRefresh}</span>
            <button ref={refreshButtonRef} className="icon-button" type="button" title={t.header.refresh} onClick={() => void refreshUsage()}>
              <RefreshCw size={18} />
            </button>
            <button className="icon-button" type="button" title={t.header.export} onClick={exportCsv} disabled={usageSource !== "codex" && usageSource !== "sample"}>
              <Download size={18} />
            </button>
              </>
            )}
          </div>
        </header>
        {activeSection === "guide" ? (
          <UnderstandingGuide content={guideContent[locale]} onOpenSource={openOfficialDocumentation} />
        ) : (
          <>
        {notice && <div className="notice">{notice}</div>}

        {usageSource === "loading" ? (
          <section className="initial-loading" role="status" aria-live="polite">
            <div className="initial-loading__card">
              <div className="initial-loading__icon">
                <RefreshCw size={30} />
              </div>
              <h2>{t.loadingView.title}</h2>
              <p>{t.loadingView.description}</p>
              <div className="initial-loading__progress"><span /></div>
              <small>{t.loadingView.privacy}</small>
            </div>
          </section>
        ) : usageSource === "empty" ? (
          <DataStatePanel
            icon={FolderOpen}
            title={t.emptyView.title}
            description={t.emptyView.description}
            detail={t.emptyView.detail}
            primaryLabel={t.emptyView.retry}
            secondaryLabel={t.emptyView.openDirectory}
            onPrimary={retryUsage}
            onSecondary={() => void openCodexDirectory()}
          />
        ) : usageSource === "error" ? (
          <DataStatePanel
            icon={CircleAlert}
            title={t.errorView.title}
            description={t.errorView.description}
            detail={loadError}
            primaryLabel={t.errorView.retry}
            secondaryLabel={t.errorView.openDirectory}
            onPrimary={retryUsage}
            onSecondary={() => void openCodexDirectory()}
            tone="error"
          />
        ) : (
          <>
        <section className="control-strip" id="overview">
          <label className="search-box">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.header.searchPlaceholder} />
          </label>
          {range === "custom" && (
            <>
              <label>
                <span>{t.filters.startDate}</span>
                <input
                  type="date"
                  value={customWindow.startDate}
                  aria-invalid={customWindowInvalid}
                  onChange={(event) => setCustomWindow((current) => ({ ...current, startDate: event.target.value }))}
                />
              </label>
              <label>
                <span>{t.filters.endDate}</span>
                <input
                  type="date"
                  value={customWindow.endDate}
                  aria-invalid={customWindowInvalid}
                  onChange={(event) => setCustomWindow((current) => ({ ...current, endDate: event.target.value }))}
                />
              </label>
            </>
          )}
          {customWindowInvalid && <span className="date-error">{t.filters.invalidRange}</span>}
          <div className={usageSource === "codex" ? "source-pill source-pill--live" : "source-pill"}>
            <ShieldCheck size={15} />
            {sourceLabel}
          </div>
          {diagnosticLabel && diagnostics && (
            (diagnostics.issues?.length ?? 0) > 0 ? (
              <details className="diagnostic-details diagnostic-pill--warning">
                <summary>{diagnosticLabel}</summary>
                <ul>{diagnostics.issues?.map((issue, index) => <li key={`${issue.path}-${index}`}><strong>{issue.path}</strong><span>{issue.message}</span></li>)}</ul>
              </details>
            ) : (
              <div className="diagnostic-pill">{diagnosticLabel}{!diagnostics.watcherActive && ` · ${t.source.pollingFallback}`}</div>
            )
          )}
        </section>

        <section className="metric-grid">
          <MetricCard label={t.metrics.totalTokens} value={formatToken(totalTokens)} detail={t.metrics.tokensInView(compactFormatter.format(totalTokens))} icon={Boxes} tone="amber" />
          <MetricCard label={t.metrics.taskCount} value={formatToken(filteredTasks.length)} detail={t.metrics.tasksInView(filteredTasks.length)} icon={CheckSquare} tone="rose" />
          <MetricCard label={t.metrics.averageTask} value={formatToken(averageTask)} detail={t.projects.average(compactFormatter.format(averageTask))} icon={TrendingUp} tone="cyan" />
          <MetricCard label={t.metrics.maxTask} value={formatToken(maxTask)} detail={t.metrics.selectedTotal} icon={BarChart3} tone="violet" />
          <MetricCard label={t.metrics.input} value={formatToken(totals.input)} detail={t.metrics.inputDetail} icon={TerminalSquare} tone="green" />
          <MetricCard label={t.metrics.cache} value={formatToken(totals.cache)} detail={t.metrics.cacheDetail} icon={DatabaseZap} tone="cyan" />
          <MetricCard label={t.metrics.output} value={formatToken(totals.output)} detail={t.metrics.outputDetail} icon={Boxes} tone="amber" />
          <MetricCard label={t.metrics.reasoning} value={formatToken(totals.reasoning)} detail={t.metrics.reasoningDetail} icon={Brain} tone="rose" />
        </section>

        <ApiCostPanel catalog={pricingCatalog} estimate={apiCost} formatter={costFormatter} messages={t.cost} onOpenPricing={() => setPricingOpen(true)} />

        <section className="dashboard-grid" id="trends">
          <TrendChart data={trend} eyebrow={t.charts.trendEyebrow} locale={locale} title={t.charts.trendTitle} noData={t.charts.noData} />
          <CompositionChart
            totals={totals}
            eyebrow={t.charts.compositionEyebrow}
            title={t.charts.compositionTitle}
            noData={t.charts.noData}
            labels={t.charts}
            locale={locale}
          />
          <section className="panel ranking-panel" id="projects">
            <div className="panel__header">
              <div>
                <p>{t.projects.rankingSubtitle}</p>
                <h2>{t.projects.ranking}</h2>
              </div>
            </div>
            <div className="ranking-list">
              {projectSummary.slice(0, 6).map((item, index) => {
                const maxProjectTotal = projectSummary[0]?.total ?? 1;
                const width = Math.max((item.total / maxProjectTotal) * 100, 5);
                return (
                  <button className={project === item.project ? "ranking-item ranking-item--active" : "ranking-item"} key={item.project} type="button" onClick={() => setProject(item.project)}>
                    <span className="ranking-index">{index + 1}</span>
                    <span className="ranking-name">{item.project}</span>
                    <strong>{formatToken(item.total)}</strong>
                    <i><b style={{ width: `${width}%` }} /></i>
                  </button>
                );
              })}
            </div>
          </section>
        </section>

        <section className="lower-grid">
          <div id="logs">
            <TaskTable
              tasks={filteredTasks}
              filterKey={`${range}:${customWindow.startDate}:${customWindow.endDate}:${project}:${query}`}
              locale={locale}
              messages={t.table}
              onRevealPath={revealTaskPath}
              pricingCatalog={pricingCatalog}
              taskCosts={taskCosts}
              taskTitles={t.taskTitles}
            />
          </div>
          <aside className="quota-stack">
            <QuotaPanel
              title={t.quota.fiveHour}
              icon={Activity}
              rateLimit={rateLimits?.primary}
              locale={locale}
              messages={t.quota}
              tone="green"
            />
            <QuotaPanel
              title={t.quota.sevenDay}
              icon={CalendarDays}
              rateLimit={rateLimits?.secondary}
              locale={locale}
              messages={t.quota}
              tone="blue"
            />
          </aside>
        </section>
          </>
        )}
        {pricingOpen && (
          <PricingSettingsModal
            catalog={pricingCatalog}
            messages={t.pricing}
            onApply={(catalog) => {
              savePricingCatalog(catalog, window.localStorage);
              setPricingCatalog(catalog);
              setPricingOpen(false);
            }}
            onClose={() => setPricingOpen(false)}
            onOpenOfficialPricing={openOfficialPricing}
            onReset={() => {
              clearSavedPricingCatalog(window.localStorage);
              setPricingCatalog(clonePricingCatalog());
              setPricingOpen(false);
            }}
          />
        )}
          </>
        )}
      </section>
    </main>
  );
}

type ApiCostPanelProps = {
  catalog: PricingCatalog;
  estimate: ApiCostBreakdown;
  formatter: Intl.NumberFormat;
  messages: Messages["cost"];
  onOpenPricing: () => void;
};

type PillOption = {
  value: string;
  label: string;
};

type PillSelectProps = {
  ariaLabel: string;
  className: string;
  leadingIcon?: ReactNode;
  onChange: (value: string) => void;
  options: PillOption[];
  title?: string;
  value: string;
};

function PillSelect({ ariaLabel, className, leadingIcon, onChange, options, title, value }: PillSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className={`${className} pill-select${open ? " pill-select--open" : ""}`} ref={rootRef} title={title}>
      <button
        aria-controls={listboxId}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        className="pill-select__trigger"
        type="button"
        onClick={() => setOpen((current) => !current)}
      >
        {leadingIcon ? <span className="pill-select__icon">{leadingIcon}</span> : null}
        <span className="pill-select__label">{selectedOption?.label ?? value}</span>
        <ChevronDown className="pill-select__chevron" size={16} />
      </button>
      {open ? (
        <div className="pill-select__menu" id={listboxId} role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              aria-selected={option.value === value}
              className={option.value === value ? "pill-select__option pill-select__option--active" : "pill-select__option"}
              key={option.value}
              role="option"
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ApiCostPanel({ catalog, estimate, formatter, messages, onOpenPricing }: ApiCostPanelProps) {
  const totalTasks = estimate.pricedTaskCount + estimate.unpricedTaskCount;
  const formatCost = (value: number) => `$${formatter.format(value)}`;
  return (
    <section className="panel cost-panel">
      <div className="cost-panel__summary">
        <div className="cost-panel__icon"><CircleDollarSign size={20} /></div>
        <div>
          <p>{messages.eyebrow}</p>
          <h2>{messages.title}</h2>
          <strong>{formatCost(estimate.total)}</strong>
          <span>{messages.currentView}</span>
        </div>
      </div>
      <div className="cost-panel__breakdown">
        <div><span>{messages.uncachedInput}</span><strong>{formatCost(estimate.uncachedInput)}</strong></div>
        <div><span>{messages.cachedInput}</span><strong>{formatCost(estimate.cachedInput)}</strong></div>
        <div><span>{messages.output}</span><strong>{formatCost(estimate.output)}</strong></div>
      </div>
      <div className="cost-panel__meta">
        <strong>{messages.coverage(estimate.pricedTaskCount, totalTasks)}</strong>
        <button className="pricing-trigger" type="button" onClick={onOpenPricing}>
          {messages.catalogVersion(catalog.version)} · {catalog.customized ? messages.customPricing : messages.previewPricing}
        </button>
        {estimate.unpricedModels.length > 0 && <span className="cost-panel__warning">{messages.unknownModels(estimate.unpricedModels.join(", "))}</span>}
        {estimate.approximatedTaskCount > 0 && <span>{messages.approximated(estimate.approximatedTaskCount)}</span>}
        <small>{messages.disclaimer}</small>
      </div>
    </section>
  );
}

type QuotaPanelProps = {
  title: string;
  icon: LucideIcon;
  rateLimit?: CodexRateLimitWindow;
  locale: Locale;
  messages: Messages["quota"];
  tone: "green" | "blue";
};

type DataStatePanelProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  detail?: string;
  primaryLabel: string;
  secondaryLabel: string;
  onPrimary: () => void;
  onSecondary: () => void;
  tone?: "default" | "error";
};

function DataStatePanel({ description, detail, icon: Icon, onPrimary, onSecondary, primaryLabel, secondaryLabel, title, tone = "default" }: DataStatePanelProps) {
  return (
    <section className={`data-state data-state--${tone}`}>
      <div className="data-state__card">
        <div className="data-state__icon"><Icon size={28} /></div>
        <h2>{title}</h2>
        <p>{description}</p>
        {detail && <code>{detail}</code>}
        <div className="data-state__actions">
          <button type="button" onClick={onPrimary}>{primaryLabel}</button>
          <button type="button" className="data-state__secondary" onClick={onSecondary}>{secondaryLabel}</button>
        </div>
      </div>
    </section>
  );
}

function QuotaPanel({ title, icon: Icon, rateLimit, locale, messages, tone }: QuotaPanelProps) {
  const usedPercent = rateLimit ? Math.min(Math.max(rateLimit.usedPercent, 0), 100) : 0;
  const remainingPercent = rateLimit ? Math.max(100 - usedPercent, 0) : 0;
  const resetLabel = rateLimit ? formatResetTime(rateLimit.resetsAt, locale) : messages.unavailable;

  return (
    <section className={`panel quota-card quota-card--${tone}`}>
      <div className="quota-card__header">
        <div className="quota-card__icon">
          <Icon size={18} />
        </div>
        <div>
          <h2>{title}</h2>
          <p>{rateLimit ? messages.sourceHint : messages.unavailable}</p>
        </div>
      </div>
      <div className="quota-card__remaining">
        <span>{messages.remaining}</span>
        <strong>{Math.round(remainingPercent)}%</strong>
      </div>
      <div className="quota-progress" aria-label={messages.used(`${Math.round(usedPercent)}%`)}>
        <span style={{ width: `${usedPercent}%` }} />
      </div>
      <div className="quota-card__meta">
        <span>{messages.usedLabel}</span>
        <strong>{rateLimit ? `${Math.round(usedPercent)}%` : "--"}</strong>
      </div>
      <div className="quota-card__meta">
        <span>{messages.resetAt}</span>
        <strong>{resetLabel}</strong>
      </div>
    </section>
  );
}

function formatResetTime(value: number, locale: Locale) {
  const date = new Date(value * 1000);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale, sameDay ? { hour: "2-digit", minute: "2-digit" } : { month: "short", day: "numeric" }).format(date);
}
