export type Locale = "zh-CN" | "en-US";

export type Messages = {
  brandSubtitle: string;
  nav: {
    overview: string;
    tasks: string;
    trends: string;
    guide: string;
  };
  source: {
    label: string;
    sample: string;
    codex: string;
    parserPending: string;
    loaded: string;
    fallback: string;
    loading: string;
    empty: string;
    error: string;
    diagnostics: (files: number, skippedLines: number, failedFiles: number) => string;
    pollingFallback: string;
  };
  header: {
    eyebrow: string;
    title: string;
    searchPlaceholder: string;
    refresh: string;
    export: string;
    exported: string;
    exportedTo: (path: string) => string;
    autoRefresh: string;
    lastUpdated: (time: string) => string;
  };
  ranges: {
    today: string;
    last7d: string;
    last30d: string;
    custom: string;
  };
  filters: {
    allProjects: string;
    startDate: string;
    endDate: string;
    invalidRange: string;
  };
  loadingView: {
    title: string;
    description: string;
    privacy: string;
  };
  emptyView: {
    title: string;
    description: string;
    detail: string;
    retry: string;
    openDirectory: string;
  };
  errorView: {
    title: string;
    description: string;
    retry: string;
    openDirectory: string;
  };
  metrics: {
    totalTokens: string;
    taskCount: string;
    averageTask: string;
    maxTask: string;
    selectedTotal: string;
    tasksInView: (count: number) => string;
    tokensInView: (value: string) => string;
    input: string;
    inputDetail: string;
    output: string;
    outputDetail: string;
    cache: string;
    cacheDetail: string;
    reasoning: string;
    reasoningDetail: string;
  };
  charts: {
    trendEyebrow: string;
    trendTitle: string;
    compositionEyebrow: string;
    compositionTitle: string;
    noData: string;
    input: string;
    output: string;
    cache: string;
    reasoning: string;
    uncachedInput: string;
    visibleOutput: string;
    includedHint: string;
  };
  projects: {
    ranking: string;
    rankingSubtitle: string;
    tasks: (count: number) => string;
    average: (value: string) => string;
  };
  cost: {
    eyebrow: string;
    title: string;
    currentView: string;
    uncachedInput: string;
    cachedInput: string;
    output: string;
    coverage: (priced: number, total: number) => string;
    unknownModels: (models: string) => string;
    approximated: (count: number) => string;
    catalogVersion: (version: string) => string;
    previewPricing: string;
    customPricing: string;
    disclaimer: string;
  };
  pricing: {
    eyebrow: string;
    title: string;
    description: string;
    close: string;
    currentSource: (source: string) => string;
    officialSource: string;
    customSource: string;
    viewOfficialPricing: string;
    manualSyncHint: string;
    unitHint: string;
    rateUnit: string;
    model: string;
    input: string;
    cachedInput: string;
    output: string;
    longContext: string;
    actions: string;
    threshold: string;
    longOrder: string;
    disabled: string;
    enableLong: string;
    disableLong: string;
    remove: string;
    modelPlaceholder: string;
    addModel: string;
    reset: string;
    localOnly: string;
    cancel: string;
    save: string;
  };
  quota: {
    fiveHour: string;
    sevenDay: string;
    remaining: string;
    usedLabel: string;
    resetAt: string;
    sourceHint: string;
    unavailable: string;
    used: (value: string) => string;
  };
  table: {
    eyebrow: string;
    title: string;
    taskCount: (count: number) => string;
    time: string;
    task: string;
    project: string;
    model: string;
    input: string;
    output: string;
    cache: string;
    reasoning: string;
    apiCost: string;
    costUnavailable: string;
    total: string;
    minutes: (value: number) => string;
    sortBy: string;
    details: string;
    projectPath: string;
    sourcePath: string;
    tokenBreakdown: string;
    modelCalls: string;
    callCount: (count: number) => string;
    callNumber: string;
    recordedAt: string;
    contextTier: string;
    shortContext: string;
    longContext: string;
    contextWindow: (value: string) => string;
    callCostBreakdown: (total: string, uncached: string, cached: string, output: string) => string;
    callRoundingNote: string;
    callDetailsUnavailable: string;
    callDetailsMismatch: string;
    openProject: string;
    revealLog: string;
    empty: string;
    previous: string;
    next: string;
    pageSummary: (start: number, end: number, total: number, page: number, pages: number) => string;
    goToPage: string;
    pageUnit: string;
    status: string;
    completed: string;
    inProgress: string;
    aborted: string;
  };
  taskTitles: Record<string, string>;
};

export const messages: Record<Locale, Messages> = {
  "zh-CN": {
    brandSubtitle: "Codex 用量监控",
    nav: {
      overview: "概览",
      tasks: "任务明细",
      trends: "趋势构成",
      guide: "理解 Codex"
    },
    source: {
      label: "数据源",
      sample: "示例数据集",
      codex: "Codex 本地日志",
      parserPending: "日志解析待接入",
      loaded: "已读取真实日志",
      fallback: "正在使用示例数据",
      loading: "正在读取本地日志",
      empty: "未发现 Codex 使用记录",
      error: "日志读取失败",
      diagnostics: (files, skippedLines, failedFiles) => `${files} 个文件 · 跳过 ${skippedLines} 行 · 失败 ${failedFiles} 个`,
      pollingFallback: "监听不可用，使用轮询"
    },
    header: {
      eyebrow: "本地桌面预览",
      title: "Codex Token 用量",
      searchPlaceholder: "搜索任务",
      refresh: "刷新用量数据",
      export: "导出当前视图",
      exported: "已导出当前视图 CSV",
      exportedTo: (path) => `已导出到 ${path}`,
      autoRefresh: "每 15 秒自动刷新",
      lastUpdated: (time) => `自动刷新 · ${time}`
    },
    ranges: {
      today: "今天",
      last7d: "最近 7 天",
      last30d: "最近 30 天",
      custom: "自定义"
    },
    filters: {
      allProjects: "全部项目",
      startDate: "开始日期",
      endDate: "结束日期",
      invalidRange: "开始日期不能晚于结束日期"
    },
    loadingView: {
      title: "正在读取 Codex 本地日志",
      description: "正在定位会话文件并汇总 Token 用量，首次扫描可能需要几秒。",
      privacy: "所有数据仅在这台电脑上处理，不会上传。"
    },
    emptyView: {
      title: "尚未发现 Codex 使用记录",
      description: "请先使用 Codex 完成一次任务，然后重新扫描。本应用不会用样例数据冒充真实用量。",
      detail: "已检查 CODEX_HOME（如有设置）以及当前用户目录下的 .codex。",
      retry: "重新扫描",
      openDirectory: "打开 Codex 目录"
    },
    errorView: {
      title: "无法读取 Codex 本地日志",
      description: "扫描可能超时、目录不可访问或日志格式异常。你可以重试并查看下方错误信息。",
      retry: "重新扫描",
      openDirectory: "打开 Codex 目录"
    },
    metrics: {
      totalTokens: "总 Token",
      taskCount: "总任务数",
      averageTask: "平均单任务",
      maxTask: "最大单任务",
      selectedTotal: "当前总量",
      tasksInView: (count) => `当前视图 ${count} 个任务`,
      tokensInView: (value) => `当前视图 ${value} tokens`,
      input: "输入",
      inputDetail: "提示词与上下文 token",
      output: "输出",
      outputDetail: "模型生成回复 token",
      cache: "缓存命中",
      cacheDetail: "输入中命中缓存的部分",
      reasoning: "推理",
      reasoningDetail: "输出中的内部推理部分"
    },
    charts: {
      trendEyebrow: "趋势",
      trendTitle: "Token 使用走势",
      compositionEyebrow: "构成",
      compositionTitle: "输入与输出构成",
      noData: "当前筛选范围暂无数据",
      input: "输入",
      output: "输出",
      cache: "缓存",
      reasoning: "推理",
      uncachedInput: "普通输入",
      visibleOutput: "回复输出",
      includedHint: "组成明细已包含在上方总量中"
    },
    projects: {
      ranking: "项目排行",
      rankingSubtitle: "按总 Token",
      tasks: (count) => `${count} 个任务`,
      average: (value) => `平均 ${value}`
    },
    cost: {
      eyebrow: "成本估算",
      title: "Standard API 等价成本",
      currentView: "当前筛选视图",
      uncachedInput: "普通输入",
      cachedInput: "缓存输入",
      output: "输出",
      coverage: (priced, total) => `已估算 ${priced}/${total} 个任务`,
      unknownModels: (models) => `暂无价格：${models}`,
      approximated: (count) => `${count} 个旧任务缺少调用明细，按任务汇总近似估算`,
      catalogVersion: (version) => `价格版本 ${version}`,
      previewPricing: "查看/设置价格",
      customPricing: "自定义价格",
      disclaimer: "仅为当前 Standard API 价格配置的美元等价估算，不是 Codex 订阅账单。"
    },
    pricing: {
      eyebrow: "价格设置",
      title: "API 等价价格预览与自定义",
      description: "价格单位均为美元/百万 Token。修改后会立即重新计算当前视图和任务明细。",
      close: "关闭价格设置",
      currentSource: (source) => `当前来源：${source}`,
      officialSource: "内置 OpenAI 官方价格",
      customSource: "本机自定义价格",
      viewOfficialPricing: "查看官网价格",
      manualSyncHint: "当前不会自动同步官网价格，请核对后手动更新。",
      unitHint: "所有价格输入框均为美元/百万 Token",
      rateUnit: "$ / 100万 Token",
      model: "模型",
      input: "普通输入",
      cachedInput: "缓存输入",
      output: "输出",
      longContext: "长上下文价格",
      actions: "操作",
      threshold: "单次调用输入门槛",
      longOrder: "输入 / 缓存 / 输出（$ / 100万 Token）",
      disabled: "未启用",
      enableLong: "启用长上下文",
      disableLong: "关闭长上下文",
      remove: "删除",
      modelPlaceholder: "输入新模型 ID，例如 gpt-5.6",
      addModel: "新增模型",
      reset: "恢复官网默认价格",
      localOnly: "自定义配置仅保存在本机，不会上传。",
      cancel: "取消",
      save: "保存并应用"
    },
    quota: {
      fiveHour: "5 小时额度",
      sevenDay: "7 天额度",
      remaining: "剩余",
      usedLabel: "已用",
      resetAt: "重置时间",
      sourceHint: "来自 Codex 本地日志",
      unavailable: "未读取到额度数据",
      used: (value) => `已使用 ${value}`
    },
    table: {
      eyebrow: "任务明细",
      title: "本地 Codex 会话",
      taskCount: (count) => `${count} 个任务`,
      time: "时间",
      task: "任务",
      project: "项目",
      model: "模型",
      input: "输入",
      output: "输出",
      cache: "缓存",
      reasoning: "推理",
      apiCost: "API 等价成本",
      costUnavailable: "暂无价格",
      total: "总计",
      minutes: (value) => `${value} 分钟`,
      sortBy: "排序",
      details: "详情",
      projectPath: "项目路径",
      sourcePath: "日志文件",
      tokenBreakdown: "Token 构成",
      modelCalls: "模型调用明细",
      callCount: (count) => `日志记录到 ${count} 次调用`,
      callNumber: "调用",
      recordedAt: "记录时间",
      contextTier: "价格档位",
      shortContext: "短上下文",
      longContext: "长上下文",
      contextWindow: (value) => `窗口 ${value}`,
      callCostBreakdown: (total, uncached, cached, output) => `精确成本 ${total} · 普通输入 ${uncached} · 缓存输入 ${cached} · 输出 ${output}`,
      callRoundingNote: "任务成本按各调用的未四舍五入金额汇总；明细显示保留两位，合计可能存在约 0.01 美元的显示差异。悬浮成本可查看六位小数。",
      callDetailsUnavailable: "当前日志只有任务汇总，缺少逐次模型调用明细。",
      callDetailsMismatch: "调用明细合计与任务汇总不一致；任务成本已自动改用汇总数据近似估算，以下调用仅供诊断。",
      openProject: "打开项目",
      revealLog: "定位日志",
      empty: "当前筛选范围没有任务",
      previous: "上一页",
      next: "下一页",
      pageSummary: (start, end, total, page, pages) => `第 ${start}-${end} 条，共 ${total} 条 · ${page}/${pages} 页`,
      goToPage: "跳至",
      pageUnit: "页",
      status: "状态",
      completed: "已完成",
      inProgress: "进行中",
      aborted: "已中断"
    },
    taskTitles: {
      "task-001": "TokenLens 项目规划",
      "task-002": "用量仪表盘外壳",
      "task-003": "本地日志解析草图",
      "task-004": "发布流程笔记",
      "task-005": "CLI 错误排查",
      "task-006": "笔记导出清理",
      "task-007": "React 布局审查",
      "task-008": "数据库迁移保护",
      "task-009": "PDF 解析原型",
      "task-010": "图表交互优化"
    }
  },
  "en-US": {
    brandSubtitle: "Codex usage monitor",
    nav: {
      overview: "Overview",
      tasks: "Task Details",
      trends: "Trends",
      guide: "Understand Codex"
    },
    source: {
      label: "Source",
      sample: "Sample dataset",
      codex: "Codex local logs",
      parserPending: "Parser pending",
      loaded: "Real logs loaded",
      fallback: "Using sample data",
      loading: "Loading local logs",
      empty: "No Codex usage records found",
      error: "Failed to read logs",
      diagnostics: (files, skippedLines, failedFiles) => `${files} files · ${skippedLines} lines skipped · ${failedFiles} failed`,
      pollingFallback: "Watcher unavailable; polling"
    },
    header: {
      eyebrow: "Local Desktop Preview",
      title: "Codex Token Usage",
      searchPlaceholder: "Search tasks",
      refresh: "Refresh usage data",
      export: "Export current view",
      exported: "Current view exported as CSV",
      exportedTo: (path) => `Exported to ${path}`,
      autoRefresh: "Auto-refresh every 15s",
      lastUpdated: (time) => `Auto-refreshed · ${time}`
    },
    ranges: {
      today: "Today",
      last7d: "Last 7 days",
      last30d: "Last 30 days",
      custom: "Custom"
    },
    filters: {
      allProjects: "All projects",
      startDate: "Start date",
      endDate: "End date",
      invalidRange: "Start date cannot be later than end date"
    },
    loadingView: {
      title: "Reading local Codex logs",
      description: "Locating session files and calculating token usage. The first scan may take a few seconds.",
      privacy: "All data stays on this computer and is never uploaded."
    },
    emptyView: {
      title: "No Codex usage records found",
      description: "Complete a task in Codex, then scan again. Sample data is never presented as real desktop usage.",
      detail: "Checked CODEX_HOME when configured and the current user's .codex directory.",
      retry: "Scan again",
      openDirectory: "Open Codex directory"
    },
    errorView: {
      title: "Unable to read local Codex logs",
      description: "The scan may have timed out, the directory may be inaccessible, or the log format may be unsupported.",
      retry: "Try again",
      openDirectory: "Open Codex directory"
    },
    metrics: {
      totalTokens: "Total Tokens",
      taskCount: "Total Tasks",
      averageTask: "Avg Task",
      maxTask: "Largest Task",
      selectedTotal: "Selected Total",
      tasksInView: (count) => `${count} tasks in view`,
      tokensInView: (value) => `${value} tokens in view`,
      input: "Input",
      inputDetail: "Prompt and context tokens",
      output: "Output",
      outputDetail: "Generated response tokens",
      cache: "Cache Hit",
      cacheDetail: "Cached portion of input",
      reasoning: "Reasoning",
      reasoningDetail: "Reasoning portion of output"
    },
    charts: {
      trendEyebrow: "Trend",
      trendTitle: "Token Usage Over Time",
      compositionEyebrow: "Composition",
      compositionTitle: "Input and Output Breakdown",
      noData: "No data in the selected range",
      input: "Input",
      output: "Output",
      cache: "Cache",
      reasoning: "Reasoning",
      uncachedInput: "Uncached input",
      visibleOutput: "Response output",
      includedHint: "Components are already included in the total above"
    },
    projects: {
      ranking: "Project Ranking",
      rankingSubtitle: "By total tokens",
      tasks: (count) => `${count} tasks`,
      average: (value) => `Avg ${value}`
    },
    cost: {
      eyebrow: "Cost estimate",
      title: "Standard API equivalent",
      currentView: "Current filtered view",
      uncachedInput: "Uncached input",
      cachedInput: "Cached input",
      output: "Output",
      coverage: (priced, total) => `${priced}/${total} tasks priced`,
      unknownModels: (models) => `No pricing for: ${models}`,
      approximated: (count) => `${count} legacy tasks lack call details and use aggregate estimates`,
      catalogVersion: (version) => `Pricing version ${version}`,
      previewPricing: "View / edit pricing",
      customPricing: "Custom pricing",
      disclaimer: "USD equivalent using the active Standard API pricing configuration, not a Codex subscription bill."
    },
    pricing: {
      eyebrow: "Pricing settings",
      title: "Preview and customize API-equivalent pricing",
      description: "All rates are USD per 1M tokens. Saving immediately recalculates the current view and task table.",
      close: "Close pricing settings",
      currentSource: (source) => `Current source: ${source}`,
      officialSource: "Bundled official OpenAI pricing",
      customSource: "Local custom pricing",
      viewOfficialPricing: "View official pricing",
      manualSyncHint: "Pricing is not synced automatically. Review the official page and update manually.",
      unitHint: "All rate fields are USD per 1M tokens",
      rateUnit: "$ / 1M tokens",
      model: "Model",
      input: "Input",
      cachedInput: "Cached input",
      output: "Output",
      longContext: "Long-context pricing",
      actions: "Actions",
      threshold: "Per-call input threshold",
      longOrder: "Input / cached / output ($ / 1M tokens)",
      disabled: "Disabled",
      enableLong: "Enable long context",
      disableLong: "Disable long context",
      remove: "Remove",
      modelPlaceholder: "New model ID, for example gpt-5.6",
      addModel: "Add model",
      reset: "Restore official defaults",
      localOnly: "Custom pricing stays on this device and is never uploaded.",
      cancel: "Cancel",
      save: "Save and apply"
    },
    quota: {
      fiveHour: "5h Quota",
      sevenDay: "7d Quota",
      remaining: "Remaining",
      usedLabel: "Used",
      resetAt: "Reset",
      sourceHint: "From Codex local logs",
      unavailable: "No quota data found",
      used: (value) => `Used ${value}`
    },
    table: {
      eyebrow: "Task Details",
      title: "Local Codex Sessions",
      taskCount: (count) => `${count} tasks`,
      time: "Time",
      task: "Task",
      project: "Project",
      model: "Model",
      input: "Input",
      output: "Output",
      cache: "Cache",
      reasoning: "Reasoning",
      apiCost: "API equivalent",
      costUnavailable: "No price",
      total: "Total",
      minutes: (value) => `${value} min`,
      sortBy: "Sort by",
      details: "Details",
      projectPath: "Project path",
      sourcePath: "Log file",
      tokenBreakdown: "Token breakdown",
      modelCalls: "Model call details",
      callCount: (count) => `${count} calls recorded in the log`,
      callNumber: "Call",
      recordedAt: "Recorded at",
      contextTier: "Pricing tier",
      shortContext: "Short context",
      longContext: "Long context",
      contextWindow: (value) => `${value} window`,
      callCostBreakdown: (total, uncached, cached, output) => `Exact cost ${total} · uncached input ${uncached} · cached input ${cached} · output ${output}`,
      callRoundingNote: "Task cost sums unrounded call amounts. Two-decimal call values may differ from the displayed total by about $0.01. Hover a cost to see six decimals.",
      callDetailsUnavailable: "This log contains only the task total and no per-call model usage.",
      callDetailsMismatch: "Call totals do not match the task summary. Task cost now uses an aggregate estimate; the calls below are diagnostic only.",
      openProject: "Open project",
      revealLog: "Reveal log",
      empty: "No tasks match the current filters",
      previous: "Previous",
      next: "Next",
      pageSummary: (start, end, total, page, pages) => `${start}-${end} of ${total} · page ${page}/${pages}`,
      goToPage: "Go to",
      pageUnit: "page",
      status: "Status",
      completed: "Completed",
      inProgress: "In progress",
      aborted: "Aborted"
    },
    taskTitles: {}
  }
};
