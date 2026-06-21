import type { Locale } from "./messages";

export type GuideContent = {
  eyebrow: string;
  title: string;
  subtitle: string;
  verified: string;
  formulaLead: string;
  formulaParts: string[];
  formulaResult: string;
  flowTitle: string;
  flowIntro: string;
  flowSteps: Array<{ title: string; description: string }>;
  termsTitle: string;
  termsIntro: string;
  terms: Array<{ term: string; definition: string }>;
  chaptersTitle: string;
  chaptersIntro: string;
  chapters: Array<{
    number: string;
    title: string;
    summary: string;
    bullets: string[];
    note?: string;
  }>;
  sourcesTitle: string;
  sourcesIntro: string;
  sources: Array<{ label: string; href: string }>;
};

export const guideContent: Record<Locale, GuideContent> = {
  "zh-CN": {
    eyebrow: "AI 智能体认知指南",
    title: "理解 Codex：它如何工作，又为什么会产生这些用量？",
    subtitle: "不需要了解模型数学。先建立正确的心智模型，你就能更清楚地使用 Codex、判断结果，也能真正看懂 TokenLens 中的每一个数字。",
    verified: "内容依据 OpenAI 官方 Codex 文档与 TokenLens 实际读取的本地日志字段整理",
    formulaLead: "Codex 不只是一个大模型",
    formulaParts: ["模型", "指令", "上下文", "工具", "执行循环"],
    formulaResult: "Codex 智能体",
    flowTitle: "发送一条消息后，发生了什么？",
    flowIntro: "一次用户消息会启动一个任务。简单任务可能只调用一次模型；需要读取文件、运行命令或验证结果的任务，通常会循环多次。",
    flowSteps: [
      { title: "你提出任务", description: "说明目标、提供文件或图片，并告诉 Codex 什么结果才算完成。" },
      { title: "Codex 组装上下文", description: "把有效的线程历史、指令、项目背景和本次消息组织成模型可以处理的输入。" },
      { title: "调用模型", description: "模型根据当前输入生成答复，或者提出下一步要执行的工具动作。" },
      { title: "执行工具", description: "Codex 在权限允许的环境里读取文件、修改代码、运行命令或访问已授权的外部工具。" },
      { title: "带着结果继续", description: "工具结果加入上下文，Codex再次调用模型，直到完成、被取消或遇到需要用户决定的事情。" }
    ],
    termsTitle: "先分清八个容易混淆的概念",
    termsIntro: "这些概念一旦分清，调用次数、上下文长度、Token和成本就不再神秘。",
    terms: [
      { term: "大模型", definition: "接收输入并生成输出的模型。它负责分析和生成，但不会脱离产品和工具直接操作你的电脑。" },
      { term: "Codex 智能体", definition: "围绕模型构建的工作系统：包含指令、上下文、工具、权限、执行环境和持续工作的循环。" },
      { term: "线程", definition: "一段可持续的会话，包含多次用户消息、模型输出和工具调用。不同线程通常拥有独立上下文。" },
      { term: "任务", definition: "在 TokenLens 中，指你发送一条用户消息后，Codex从开始处理到本轮结束的全过程。" },
      { term: "模型调用", definition: "Codex把当前所需上下文交给模型并获得一次输出。一个任务可能包含一次或多次模型调用。" },
      { term: "工具调用", definition: "读取文件、执行命令、搜索网页等实际动作。工具调用不是模型调用，但结果可能触发下一次模型调用。" },
      { term: "上下文", definition: "本次模型调用能够使用的信息，包括有效历史、指令、用户消息、文件内容和工具结果。" },
      { term: "Token", definition: "模型处理文本等内容时使用的计量单位。字符数与Token数没有固定的一一对应关系。" }
    ],
    chaptersTitle: "你真正需要知道的八件事",
    chaptersIntro: "先读每章的一句话结论；想深入时再展开。",
    chapters: [
      {
        number: "01",
        title: "模型到底能看到什么？",
        summary: "模型只看到本次调用实际提供给它的内容，不会自动看到你的整个电脑。",
        bullets: [
          "可能包括系统与开发者指令、当前线程的有效历史、你的新消息、已附加的图片和文件。",
          "Codex通过工具读取到的代码、终端输出和搜索结果，也可能进入后续调用的上下文。",
          "没有读取、没有附加、也没有通过工具获得的内容，不能假设模型已经知道。",
          "界面上看得到的信息，也不一定全部原样进入每次模型调用。"
        ],
        note: "正确做法：涉及真实项目状态时，让 Codex先读取文件或运行检查，而不是让它凭描述猜。"
      },
      {
        number: "02",
        title: "线程、上下文与记忆不是一回事",
        summary: "线程保存持续会话，上下文是当前调用实际使用的部分；记忆是另外的可选能力。",
        bullets: [
          "一个线程可以包含多次用户消息，并持续积累模型输出和工具结果。",
          "所有有效信息都要容纳在模型的上下文窗口中；内容过长时，Codex可能压缩总结并舍弃较不相关的细节。",
          "Codex记忆默认关闭；启用后可把部分稳定偏好和工作方式带到未来线程，但它不是全部历史的永久副本。",
          "必须稳定执行的项目规则应写在 AGENTS.md 或项目文档里，不应只依赖记忆。"
        ],
        note: "继续同一主题适合留在旧线程；主题完全变化或旧上下文明显干扰时，更适合新开线程。"
      },
      {
        number: "03",
        title: "一条消息为什么会产生很多 Token？",
        summary: "你的新消息只是输入的一部分，而且一个任务可能把不断增长的上下文多次发送给模型。",
        bullets: [
          "每次模型调用都会单独产生输入Token和输出Token。",
          "后续调用可能再次携带历史、指令、代码和新的工具结果，因此会重复计算一部分上下文。",
          "缓存输入已经包含在输入中，只是适用更低的缓存输入价格；推理输出已经包含在输出中。",
          "TokenLens总Token始终等于输入加输出，不会再次把缓存或推理重复相加。"
        ],
        note: "任务成本按每次调用的普通输入、缓存输入和输出分别计算，再以未四舍五入金额汇总。API等价成本不等于Codex订阅账单。"
      },
      {
        number: "04",
        title: "为什么 AI 会自信地出错？",
        summary: "模型输出不是事实保证；缺少上下文、错误假设和未验证结果都可能带来错误。",
        bullets: [
          "模型可能生成听起来合理、实际上不准确的解释、代码或引用。",
          "工具命令成功，只能证明命令执行了，不代表业务需求一定正确实现。",
          "代码可以通过编译，却仍可能存在边界问题、交互问题或错误理解需求。",
          "联网搜索获得的内容也需要判断来源、时间和可信度。"
        ],
        note: "最可靠的使用方式不是盲目信任，而是让 Codex读取真实状态、运行测试、检查结果并说明不确定性。"
      },
      {
        number: "05",
        title: "权限、沙箱与网络访问",
        summary: "模型提出动作，Codex工具在权限允许的范围内执行；能不能做由环境和授权共同决定。",
        bullets: [
          "沙箱模式限制Codex技术上能访问和修改哪些位置，审批策略决定什么时候必须先询问你。",
          "本地任务通常在当前工作区运行；云端任务运行在隔离环境中，并不等于直接控制你的本机。",
          "网络访问可以关闭或限制。访问不可信网页和依赖时仍要注意提示注入与数据泄露风险。",
          "读取、修改、上传和对外发送是不同风险等级的动作，不能混为一谈。"
        ],
        note: "给足完成任务所需的最小权限，比无条件开放全部权限更安全。"
      },
      {
        number: "06",
        title: "怎样给 Codex 更好的任务？",
        summary: "好提示不需要华丽，但最好说清目标、上下文、约束和完成标准。",
        bullets: [
          "目标：最终想改变或得到什么。",
          "上下文：哪些文件、错误、截图或已有决定最相关。",
          "约束：哪些不能改、要遵守什么规则、风险边界在哪里。",
          "完成标准：需要通过哪些测试、看到什么行为、输出什么说明。"
        ],
        note: "复杂或含糊的任务可以先让 Codex调查并制定计划；完成后要求它验证，而不只是声称已经完成。"
      },
      {
        number: "07",
        title: "并行任务和多个线程如何相处？",
        summary: "不同线程可以并行工作，但它们有独立上下文；同时修改相同文件可能互相冲突。",
        bullets: [
          "项目A和项目B的线程可以同时调用模型，各自的日志和Token累计互不混用。",
          "同一项目里的多个线程也各自维护会话状态，不会自动知道另一个线程刚做了什么。",
          "并行会提高吞吐量，也可能增加模型用量和协调成本。",
          "让并行线程负责边界清楚、文件重叠较少的任务更稳妥。"
        ],
        note: "需要共享的最终决定应写回项目文件、文档或当前线程，而不是假设其他线程已经知道。"
      },
      {
        number: "08",
        title: "TokenLens能告诉你什么，不能告诉你什么？",
        summary: "TokenLens解释本地日志里记录到的用量，不会把推断伪装成官方账单或完整模型请求。",
        bullets: [
          "任务明细展示一次用户消息触发的本轮工作；调用明细展示日志中可确认的逐次模型用量。",
          "可以计算输入、缓存、输出、推理、短/长上下文档位和Standard API等价成本。",
          "旧日志缺少逐次快照时只能展示任务汇总，不能可靠拆分调用次数。",
          "无法仅凭日志完整还原每次请求的所有隐藏上下文，也无法精确复制Codex订阅额度算法。",
          "应用只读取本机Codex日志；自定义价格保存在本机，不会上传。"
        ],
        note: "把TokenLens当作用量分析与理解工具，而不是OpenAI官方账单系统。"
      }
    ],
    sourcesTitle: "内容依据",
    sourcesIntro: "概念与产品边界优先依据OpenAI官方文档；Token口径和日志能力同时以本项目的可重复测试为准。",
    sources: [
      { label: "Codex 提示与执行循环", href: "https://developers.openai.com/codex/prompting" },
      { label: "Codex 最佳实践", href: "https://developers.openai.com/codex/learn/best-practices" },
      { label: "Codex 沙箱与审批", href: "https://developers.openai.com/codex/agent-approvals-security" },
      { label: "OpenAI API 定价", href: "https://developers.openai.com/api/docs/pricing" }
    ]
  },
  "en-US": {
    eyebrow: "A practical guide to AI agents",
    title: "Understand Codex: how it works and where usage comes from",
    subtitle: "You do not need model mathematics. A sound mental model makes Codex easier to direct, its results easier to judge, and every TokenLens number easier to understand.",
    verified: "Based on official OpenAI Codex documentation and the local log fields TokenLens actually reads",
    formulaLead: "Codex is more than a model",
    formulaParts: ["Model", "Instructions", "Context", "Tools", "Agent loop"],
    formulaResult: "Codex agent",
    flowTitle: "What happens after you send a message?",
    flowIntro: "One user message starts a task. A simple task may need one model call; work that reads files, runs commands, or verifies results usually loops through several calls.",
    flowSteps: [
      { title: "You describe the task", description: "State the goal, attach relevant files or images, and explain what done should look like." },
      { title: "Codex assembles context", description: "Relevant thread history, instructions, project context, and your new message become model input." },
      { title: "Codex calls the model", description: "The model generates an answer or requests the next tool action." },
      { title: "Tools perform actions", description: "Within its permissions, Codex can read or edit files, run commands, or use authorized external tools." },
      { title: "Results feed the next step", description: "Tool output joins the context and the loop continues until completion, cancellation, or a decision only you can make." }
    ],
    termsTitle: "Eight concepts worth separating",
    termsIntro: "Once these are distinct, call counts, context length, tokens, and cost become much easier to reason about.",
    terms: [
      { term: "Model", definition: "A model receives input and generates output. It analyzes and produces content but does not independently operate your computer." },
      { term: "Codex agent", definition: "A working system around the model: instructions, context, tools, permissions, an execution environment, and a continuing loop." },
      { term: "Thread", definition: "A continuing session containing user messages, model output, and tool calls. Different threads normally have separate context." },
      { term: "Task", definition: "In TokenLens, the work from one user message until that Codex turn ends." },
      { term: "Model call", definition: "Codex sends the context needed for the next step to a model and receives one output. A task can contain one or many calls." },
      { term: "Tool call", definition: "A real action such as reading a file, running a command, or searching. It is not a model call, but its result may cause another one." },
      { term: "Context", definition: "The information available to one model call, such as relevant history, instructions, user messages, file content, and tool results." },
      { term: "Token", definition: "A unit models use to process content. Characters and tokens do not have a fixed one-to-one conversion." }
    ],
    chaptersTitle: "Eight things that matter in practice",
    chaptersIntro: "Read each one-line takeaway first, then expand the sections you care about.",
    chapters: [
      {
        number: "01", title: "What can the model actually see?", summary: "Only content supplied to the current call—not your entire computer by default.",
        bullets: ["Input may include system and developer instructions, relevant thread history, your message, and attached files or images.", "Code, terminal output, and search results gathered through tools can enter later calls.", "Do not assume the model knows content that was never attached, read, or returned by a tool.", "Not everything visible in an interface is necessarily sent verbatim on every call."],
        note: "For claims about a real project, ask Codex to inspect the files or run a check instead of guessing from a description."
      },
      {
        number: "02", title: "Threads, context, and memory differ", summary: "A thread is the continuing session, context is what a call can use, and memory is a separate optional feature.",
        bullets: ["A thread can contain many user messages, model outputs, and tool results.", "Useful information must fit in the model context window; on long tasks Codex may compact it by summarizing and dropping less relevant detail.", "Codex memories are off by default. When enabled, they can carry selected stable preferences and workflows into future threads, not preserve every prior conversation verbatim.", "Required project rules belong in AGENTS.md or checked-in documentation, not only in memory."],
        note: "Continue a thread when its background still matters; start a new one when the subject changes or old context is getting in the way."
      },
      {
        number: "03", title: "Why can a short message use many tokens?", summary: "Your message is only one part of the input, and a task may resend growing context across several model calls.",
        bullets: ["Every model call produces its own input and output tokens.", "Later calls may carry history, instructions, code, and new tool output again.", "Cached input is part of input at a lower cached-input price; reasoning output is part of output.", "TokenLens total tokens always equal input plus output, without counting cache or reasoning twice."],
        note: "Task cost prices every call's uncached input, cached input, and output, then sums unrounded values. API-equivalent cost is not a Codex subscription bill."
      },
      {
        number: "04", title: "Why can AI be confidently wrong?", summary: "A model output is not a guarantee of truth; missing context, wrong assumptions, and unverified results can all cause errors.",
        bullets: ["A model can generate plausible but inaccurate explanations, code, or citations.", "A command succeeding proves the command ran, not that the product requirement is satisfied.", "Compiling code can still contain edge-case, interaction, or requirement errors.", "Web results still need source, recency, and credibility checks."],
        note: "Reliability comes from inspecting real state, running tests, checking outcomes, and stating uncertainty—not blind trust."
      },
      {
        number: "05", title: "Permissions, sandboxes, and network access", summary: "The model proposes actions; tools execute only within the permissions and environment you grant.",
        bullets: ["Sandbox mode limits what Codex can technically access or change; approval policy controls when it must ask first.", "Local tasks run against a local workspace, while cloud tasks run in an isolated environment rather than directly controlling your computer.", "Network access can be disabled or restricted. Untrusted pages and dependencies can still carry prompt-injection or data-leak risks.", "Reading, modifying, uploading, and transmitting data are different classes of action."],
        note: "Grant the smallest set of permissions that lets the task succeed."
      },
      {
        number: "06", title: "How do you give Codex a strong task?", summary: "Prompts do not need to be fancy, but goals, context, constraints, and done criteria help.",
        bullets: ["Goal: what should change or exist at the end.", "Context: relevant files, errors, screenshots, or prior decisions.", "Constraints: what must not change and which standards or safety boundaries apply.", "Done when: tests, visible behavior, or outputs that prove completion."],
        note: "For ambiguous work, let Codex investigate and plan first. Ask it to verify completion rather than merely claim it."
      },
      {
        number: "07", title: "How do parallel tasks and threads interact?", summary: "Threads can run in parallel with separate context, but overlapping file edits can conflict.",
        bullets: ["Threads in project A and project B maintain independent logs and cumulative token counters.", "Separate threads in one project do not automatically know what each other just changed.", "Parallel work raises throughput but can also raise usage and coordination cost.", "Parallelize work with clear boundaries and little file overlap."],
        note: "Put shared decisions into project files, documentation, or the active thread rather than assuming another thread knows them."
      },
      {
        number: "08", title: "What can TokenLens tell you?", summary: "TokenLens explains usage present in local logs; it does not pretend inferred data is an official bill or full model request.",
        bullets: ["A task row represents one user message and the resulting turn; call details show per-call usage confirmed by the log.", "TokenLens can calculate input, cache, output, reasoning, context pricing tiers, and Standard API-equivalent cost.", "Older logs without call snapshots can show only task totals.", "Logs alone cannot reconstruct every hidden context item or duplicate the Codex subscription-limit algorithm.", "The app reads local Codex logs only, and custom pricing stays on the device."],
        note: "Use TokenLens as an analysis and learning tool, not as an official OpenAI billing system."
      }
    ],
    sourcesTitle: "Sources and accuracy",
    sourcesIntro: "Product concepts and boundaries follow official OpenAI documentation. Token accounting and log support are also protected by repeatable project tests.",
    sources: [
      { label: "Codex prompting and agent loop", href: "https://developers.openai.com/codex/prompting" },
      { label: "Codex best practices", href: "https://developers.openai.com/codex/learn/best-practices" },
      { label: "Codex sandboxing and approvals", href: "https://developers.openai.com/codex/agent-approvals-security" },
      { label: "OpenAI API pricing", href: "https://developers.openai.com/api/docs/pricing" }
    ]
  }
};
