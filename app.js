const STORAGE_KEY = "yanpm-language-project-v1";
const AI_CONFIG_KEY = "yanpm-ai-runtime-v1";
const AUTH_KEY = "yanpm-auth-v1";
const DAY = 24 * 60 * 60 * 1000;
const AI_TIMEOUT_MS = 45000;
const AI_CONNECTION_TEST_MAX_TOKENS = 32;
const AI_OUTPUT_TEST_MAX_TOKENS = 220;
const PROJECT_DATA_KEYS = ["project", "members", "milestones", "tasks", "risks", "decisions", "memory", "proposals", "chat", "audit"];
const volatileStorage = new Map();
const backendBridge = {
  available: false,
  saving: false
};
let authRuntimeConfig = defaultAuthRuntimeConfig();
let storageFallbackActive = false;
let storageFallbackNoticeShown = false;

const AI_PROVIDER_PRESETS = [
  {
    id: "codex",
    label: "Codex 临时测试",
    mode: "codex-test",
    baseUrl: "",
    model: "codex-cli",
    hint: "开发测试专用：通过本地后端调用当前 Codex CLI 登录态。发布正式版本前应移除此模式。"
  },
  {
    id: "mock",
    label: "本地模拟",
    mode: "mock",
    baseUrl: "",
    model: "local-mock",
    hint: "不调用外部 API，适合演示建项、提取、问答和确认流程。"
  },
  {
    id: "openai",
    label: "OpenAI / ChatGPT",
    mode: "openai-responses",
    baseUrl: "https://api.openai.com/v1",
    model: "chat-latest",
    hint: "使用 OpenAI Responses API。也可以切到 Chat Completions 兼容模式。"
  },
  {
    id: "deepseek",
    label: "DeepSeek 深度求索",
    mode: "openai-chat",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash",
    hint: "DeepSeek 支持 OpenAI-compatible Chat Completions，模型名以官方文档和控制台为准。"
  },
  {
    id: "dashscope",
    label: "阿里云通义千问 DashScope",
    mode: "openai-chat",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
    hint: "DashScope 兼容 OpenAI SDK，适合通义千问/Qwen 系列模型；可改成控制台中可用的模型名。"
  },
  {
    id: "kimi",
    label: "Moonshot / Kimi",
    mode: "openai-chat",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "kimi-k2.6",
    hint: "Moonshot/Kimi 提供 OpenAI 兼容接口；如账号使用国际站，可将 Base URL 改为对应域名。"
  },
  {
    id: "zhipu",
    label: "智谱 GLM",
    mode: "openai-chat",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-5.1",
    hint: "智谱 BigModel 兼容 OpenAI Chat Completions；可改用控制台开放的 GLM 模型。"
  },
  {
    id: "doubao",
    label: "火山方舟 / 豆包",
    mode: "openai-chat",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "",
    hint: "火山方舟使用 OpenAI 兼容路径，但模型字段通常需要填写控制台里的模型名或 Endpoint ID。"
  },
  {
    id: "qianfan",
    label: "百度智能云千帆",
    mode: "openai-chat",
    baseUrl: "https://qianfan.baidubce.com/v2",
    model: "ernie-4.5-turbo-128k",
    hint: "千帆提供 OpenAI 兼容的 v2 接口；模型名可替换为账号已开通的 ERNIE 模型。"
  },
  {
    id: "hunyuan",
    label: "腾讯混元",
    mode: "openai-chat",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    model: "hunyuan-turbos-latest",
    hint: "腾讯混元提供 OpenAI 兼容接口；不同账号可用模型会有差异，请按控制台调整。"
  },
  {
    id: "minimax",
    label: "MiniMax",
    mode: "openai-chat",
    baseUrl: "https://api.minimax.io/v1",
    model: "MiniMax-M2",
    hint: "MiniMax 提供 OpenAI 兼容接口；可按官方模型列表替换模型名。"
  },
  {
    id: "siliconflow",
    label: "硅基流动 SiliconFlow",
    mode: "openai-chat",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "deepseek-ai/DeepSeek-V3.2",
    hint: "硅基流动聚合多种开源和商业模型，模型名建议从控制台复制。"
  },
  {
    id: "custom",
    label: "自定义 OpenAI-compatible",
    mode: "openai-chat",
    baseUrl: "",
    model: "",
    hint: "用于接入其他兼容 /chat/completions 的模型服务；填写 Base URL、模型和 API Key 即可测试。"
  }
];

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const icons = {
  alert: '<svg viewBox="0 0 24 24"><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.3 4.3 2.8 17.2A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.8L13.7 4.3a2 2 0 0 0-3.4 0Z"></path></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m20 6-11 11-5-5"></path></svg>',
  database: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"></path><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path></svg>',
  download: '<svg viewBox="0 0 24 24"><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M12 20h9"></path><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>',
  file: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path><path d="M14 2v6h6"></path></svg>',
  layout: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M8 6h13"></path><path d="M8 12h13"></path><path d="M8 18h13"></path><path d="M3 6h.01"></path><path d="M3 12h.01"></path><path d="M3 18h.01"></path></svg>',
  message: '<svg viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"></path></svg>',
  mic: '<svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><path d="M12 19v3"></path></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
  portfolio: '<svg viewBox="0 0 24 24"><path d="M3 7h7l2 3h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path><path d="M3 7V5a2 2 0 0 1 2-2h4l2 4"></path></svg>',
  report: '<svg viewBox="0 0 24 24"><path d="M4 19.5V4a2 2 0 0 1 2-2h12v20H6a2 2 0 0 1-2-2.5Z"></path><path d="M8 7h6"></path><path d="M8 11h8"></path><path d="M8 15h5"></path></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M12.2 2h-.4l-1 3a7.5 7.5 0 0 0-1.7.7L6.3 4.4 4.4 6.3l1.3 2.8a7.5 7.5 0 0 0-.7 1.7l-3 1v.4l3 1a7.5 7.5 0 0 0 .7 1.7l-1.3 2.8 1.9 1.9 2.8-1.3a7.5 7.5 0 0 0 1.7.7l1 3h.4l1-3a7.5 7.5 0 0 0 1.7-.7l2.8 1.3 1.9-1.9-1.3-2.8a7.5 7.5 0 0 0 .7-1.7l3-1v-.4l-3-1a7.5 7.5 0 0 0-.7-1.7l1.3-2.8-1.9-1.9-2.8 1.3a7.5 7.5 0 0 0-1.7-.7Z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  send: '<svg viewBox="0 0 24 24"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>',
  sendUp: '<svg viewBox="0 0 24 24"><path d="M12 19V5"></path><path d="m5 12 7-7 7 7"></path></svg>',
  spark: '<svg viewBox="0 0 24 24"><path d="M13 2 8.6 12.2 2 15l6.6 2.8L13 22l4.4-10.2L24 9l-6.6-2.8Z"></path></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"></rect><rect x="2" y="2" width="13" height="13" rx="2"></rect></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="m19 6-1 14H6L5 6"></path></svg>',
  upload: '<svg viewBox="0 0 24 24"><path d="M12 21V9"></path><path d="m7 14 5-5 5 5"></path><path d="M5 3h14"></path></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>'
};

const statusMap = {
  todo: { label: "待处理", tag: "neutral" },
  doing: { label: "进行中", tag: "blue" },
  blocked: { label: "阻塞", tag: "coral" },
  done: { label: "已完成", tag: "neutral" }
};

const priorityMap = {
  high: "高",
  medium: "中",
  low: "低"
};

const severityMap = {
  high: "高风险",
  medium: "中风险",
  low: "低风险"
};

const viewTitles = {
  portfolio: "项目组合",
  dashboard: "项目工作台",
  review: "待确认变更",
  tasks: "任务管理",
  risks: "风险与阻塞",
  team: "团队跟进",
  reports: "智能汇报",
  memory: "项目记忆",
  audit: "审计追踪"
};

const sampleTranscript = `5月20日站会纪要：
1. 李娜负责支付接口联调，需要在5月28日前完成，当前后端沙箱已经开放。
2. 王强反馈前端验收流程已完成，可以进入测试环境。
3. 赵敏继续跟进供应商接口文档，大家担心文档延期会影响下周三的联调测试。
4. 会议决定 MVP 第一版先支持会议纪要和聊天记录导入，录音转写作为下一阶段接入。
5. 陈晨需要在5月24日前整理试点客户反馈清单。`;

let state = loadState();
let aiConfig = loadAiConfig();
let currentUser = loadAuthUser();
let activeView = "dashboard";
let inputMode = "extract";
let taskFilter = "all";
let taskViewMode = "board";
let reportMode = "weekly";
let recognition = null;
let recognizing = false;
let micRecorder = null;
let micStream = null;
let micChunks = [];
let micStartedAt = 0;
let dialogContext = null;
let projectWizard = null;

const projectWizardQuestions = [
  {
    key: "name",
    question: "这个项目叫什么？",
    help: "给它一个能被团队直接识别的名字。",
    placeholder: "例如：华东试点客户交付、YanPM 内测二期",
    suggestions: ["YanPM 内测二期", "客户交付项目", "新产品上线项目"]
  },
  {
    key: "goal",
    question: "这个项目最终要达成什么结果？",
    help: "说清楚业务目标、交付物或要验证的假设。",
    placeholder: "例如：在 4 周内完成 3 个试点客户交付，验证 AI 项目助理是否能降低项目维护成本。",
    suggestions: ["完成 MVP 上线并收集试点反馈", "交付客户项目并通过验收", "验证新业务流程可行性"]
  },
  {
    key: "deadline",
    question: "有没有关键时间点或截止日期？",
    help: "可以写一个最终日期，也可以写多个阶段节点。",
    placeholder: "例如：6月10日完成方案评审，6月20日上线试点，6月底复盘。",
    suggestions: ["两周内完成方案评审，一个月内上线", "月底前完成验收", "下周完成第一版演示"]
  },
  {
    key: "team",
    question: "谁会参与？分别负责什么？",
    help: "写出负责人、协作方、评审人或关键干系人。",
    placeholder: "例如：李娜负责产品，王强负责前端，赵敏负责客户沟通，陈晨负责测试。",
    suggestions: ["产品、设计、技术、测试各 1 人", "项目经理、客户接口人、研发负责人", "我先负责，后续补充团队成员"]
  },
  {
    key: "scope",
    question: "第一阶段必须做什么？暂时不做什么？",
    help: "这会帮助 AI 生成范围清晰的任务清单。",
    placeholder: "例如：必须支持会议纪要导入、任务提取、人工确认；暂不做企业微信集成。",
    suggestions: ["先做核心闭环，暂不做复杂权限", "先交付高优需求，低优需求放二期", "先跑通试点，不追求完整后台"]
  },
  {
    key: "risks",
    question: "你现在最担心什么风险或阻塞？",
    help: "可以是资源、时间、技术、客户、数据、审批等问题。",
    placeholder: "例如：客户接口人不稳定，录音转写质量不确定，研发时间只有两周。",
    suggestions: ["时间紧，范围容易扩大", "客户需求还不稳定", "技术方案存在不确定性"]
  },
  {
    key: "success",
    question: "怎样算这个项目成功？",
    help: "写出验收标准或可观察的成功信号。",
    placeholder: "例如：3 个试点客户完成真实会议导入，并愿意每周继续使用。",
    suggestions: ["按期上线并完成验收", "试点用户愿意持续使用", "核心指标达到预期"]
  }
];

const projectTemplates = [
  {
    id: "software",
    label: "软件开发",
    phase: "迭代规划",
    scope: "需求澄清、方案设计、开发联调、测试验收、上线复盘。",
    members: "产品负责人、技术负责人、测试负责人、业务验收人",
    success: "核心需求按期上线，阻塞问题闭环，验收人确认通过。"
  },
  {
    id: "delivery",
    label: "客户交付",
    phase: "交付规划",
    scope: "范围确认、实施计划、客户联调、培训验收、上线支持。",
    members: "项目经理、客户接口人、实施负责人、技术支持",
    success: "客户完成验收并进入稳定运行。"
  },
  {
    id: "office",
    label: "办公室筹备",
    phase: "筹备执行",
    scope: "空间规划、办公家具、网络门禁、办公设备、行政验收和入驻支持。",
    members: "行政负责人、IT/网络负责人、采购负责人、工程负责人、人力资源负责人",
    success: "团队可按计划入驻，网络、家具、门禁和办公设备全部验收可用。"
  },
  {
    id: "launch",
    label: "产品上线",
    phase: "上线准备",
    scope: "上线清单、灰度计划、运营物料、风险预案、数据监控和复盘。",
    members: "产品负责人、研发负责人、运营负责人、客服负责人",
    success: "按计划上线，关键指标可监控，问题响应机制可运行。"
  },
  {
    id: "event",
    label: "活动筹备",
    phase: "活动执行",
    scope: "活动方案、嘉宾邀约、场地物料、传播报名、现场执行和复盘。",
    members: "活动负责人、市场负责人、设计负责人、供应商接口人",
    success: "活动按期举行，核心嘉宾和报名目标达成，现场问题可控。"
  },
  {
    id: "hiring",
    label: "招聘与组织建设",
    phase: "组织搭建",
    scope: "岗位画像、招聘渠道、面试安排、入职准备、培训和试用跟进。",
    members: "人力资源负责人、业务负责人、面试官、行政/IT 支持",
    success: "关键岗位按期到岗并完成入职支持。"
  }
];

function seedState() {
  const now = new Date().toISOString();
  const projectId = uid("project");
  return {
    activeProjectId: projectId,
    projects: [],
    project: {
      id: projectId,
      name: "YanPM 语言项目管理内测",
      phase: "MVP 验证",
      updatedAt: now
    },
    members: [
      { id: uid("member"), name: "产品与 AI", role: "产品策略", focus: "语言理解、确认机制、AI 可信度" },
      { id: uid("member"), name: "体验设计", role: "交互设计", focus: "确认流、看板、项目工作台" },
      { id: uid("member"), name: "技术", role: "工程实现", focus: "转写、提取、数据结构" },
      { id: uid("member"), name: "用户研究", role: "试点反馈", focus: "访谈、试点客户、使用场景" }
    ],
    milestones: [
      {
        id: uid("milestone"),
        title: "MVP 可信闭环",
        due: "2026-05-24",
        status: "doing",
        owner: "产品与 AI",
        description: "完成语言输入、AI 候选变更、人确认和项目记忆写入。",
        createdAt: now,
        updatedAt: now
      },
      {
        id: uid("milestone"),
        title: "试点客户验证",
        due: "2026-05-31",
        status: "todo",
        owner: "用户研究",
        description: "收集 3 个真实项目场景，验证会议纪要驱动项目管理是否成立。",
        createdAt: now,
        updatedAt: now
      },
      {
        id: uid("milestone"),
        title: "录音转写接入评估",
        due: "2026-06-05",
        status: "todo",
        owner: "技术",
        description: "完成转写服务选型，并明确成本、延迟和中文会议准确率。",
        createdAt: now,
        updatedAt: now
      }
    ],
    tasks: [
      {
        id: uid("task"),
        title: "完成语言输入到任务提取闭环",
        description: "支持会议纪要、聊天记录和日报文本，提取任务、风险、决策并进入确认队列。",
        owner: "产品与 AI",
        due: "2026-05-24",
        status: "doing",
        priority: "high",
        source: "初始项目设定",
        createdAt: now,
        updatedAt: now
      },
      {
        id: uid("task"),
        title: "设计人工确认机制",
        description: "AI 提取结果先作为候选变更，用户确认后写入项目记忆和任务状态。",
        owner: "体验设计",
        due: "2026-05-22",
        status: "doing",
        priority: "high",
        source: "初始项目设定",
        createdAt: now,
        updatedAt: now
      },
      {
        id: uid("task"),
        title: "准备试点客户访谈提纲",
        description: "围绕会议纪要、项目周报、任务追踪三个高频场景收集反馈。",
        owner: "用户研究",
        due: "2026-05-27",
        status: "todo",
        priority: "medium",
        source: "初始项目设定",
        createdAt: now,
        updatedAt: now
      },
      {
        id: uid("task"),
        title: "录音转写服务选型",
        description: "比较准确率、成本、延迟和中文会议场景表现。",
        owner: "技术",
        due: "2026-05-21",
        status: "blocked",
        priority: "medium",
        source: "初始项目设定",
        createdAt: now,
        updatedAt: now
      }
    ],
    risks: [
      {
        id: uid("risk"),
        title: "AI 自动更新项目状态的可信度不足",
        impact: "如果没有确认机制，用户可能不敢把项目管理交给系统。",
        owner: "产品与 AI",
        severity: "high",
        status: "open",
        source: "初始项目设定",
        createdAt: now,
        updatedAt: now
      },
      {
        id: uid("risk"),
        title: "录音转文字质量影响后续提取",
        impact: "嘈杂会议或多人同时讲话会导致任务、负责人和时间提取错误。",
        owner: "技术",
        severity: "medium",
        status: "open",
        source: "初始项目设定",
        createdAt: now,
        updatedAt: now
      }
    ],
    decisions: [
      {
        id: uid("decision"),
        title: "第一版采用 AI 自动整理 + 人轻量确认",
        detail: "先保证可信闭环，再逐步提高自动化程度。",
        source: "产品定位讨论",
        createdAt: now
      }
    ],
    memory: [
      {
        id: uid("memory"),
        type: "decision",
        title: "确定 MVP 核心闭环",
        detail: "语言输入、AI 提取、人确认、自动更新项目状态。",
        source: "产品定位讨论",
        createdAt: now
      }
    ],
    audit: [
      {
        id: uid("audit"),
        action: "init",
        title: "初始化演示项目",
        actor: "系统",
        projectId,
        projectName: "YanPM 语言项目管理内测",
        detail: "创建本地体验版初始数据。",
        createdAt: now
      }
    ],
    proposals: [],
    chat: [
      {
        id: uid("msg"),
        role: "ai",
        content: "你可以粘贴会议纪要、聊天记录或日报。我会提取任务、风险、决策，并放入待确认队列。",
        createdAt: now
      }
    ]
  };
}

function loadState() {
  try {
    const raw = storageGet(STORAGE_KEY);
    if (!raw) return normalizeState(seedState());
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return normalizeState(seedState());
  }
}

function loadAiConfig() {
  try {
    const raw = storageGet(AI_CONFIG_KEY);
    if (!raw) return defaultAiConfig();
    return normalizeAiConfig({ ...defaultAiConfig(), ...JSON.parse(raw) });
  } catch {
    return defaultAiConfig();
  }
}

function loadAuthUser() {
  try {
    const raw = storageGet(AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.name ? parsed : null;
  } catch {
    return null;
  }
}

function defaultAuthRuntimeConfig() {
  return {
    devMode: true,
    wechat: { enabled: false, startUrl: "/api/auth/wechat/start", reason: "本地开发模式" },
    wecom: { enabled: false, startUrl: "/api/auth/wecom/start", reason: "本地开发模式" }
  };
}

function saveAuthUser(user) {
  currentUser = user?.name ? user : null;
  if (currentUser) storageSet(AUTH_KEY, JSON.stringify(currentUser));
  else storageRemove(AUTH_KEY);
}

function defaultAiConfig() {
  const preset = getAiProviderPreset("codex");
  return {
    provider: preset.id,
    mode: preset.mode,
    baseUrl: preset.baseUrl,
    model: preset.model,
    apiKey: ""
  };
}

function saveAiConfig() {
  storageSet(AI_CONFIG_KEY, JSON.stringify(aiConfig));
}

function getAiProviderPreset(id) {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === id) || AI_PROVIDER_PRESETS.find((preset) => preset.id === "custom");
}

function inferAiProvider(config) {
  if (config.mode === "codex-test") return "codex";
  if (config.mode === "mock") return "mock";
  if (config.provider && getAiProviderPreset(config.provider).id === config.provider) return config.provider;
  const baseUrl = String(config.baseUrl || "").trim().replace(/\/+$/, "");
  const match = AI_PROVIDER_PRESETS.find(
    (preset) => !["codex", "mock", "custom"].includes(preset.id) && preset.baseUrl === baseUrl
  );
  if (match) return match.id;
  if (config.mode === "openai-responses") return "openai";
  return "custom";
}

function normalizeAiConfig(config) {
  const provider = inferAiProvider(config);
  const preset = getAiProviderPreset(provider);
  return {
    provider,
    mode: config.mode || preset.mode,
    baseUrl: String(config.baseUrl ?? preset.baseUrl ?? "").trim().replace(/\/+$/, ""),
    model: String(config.model ?? preset.model ?? "").trim(),
    apiKey: String(config.apiKey || "").trim()
  };
}

function normalizeState(data) {
  const seeded = seedState();
  let normalized = {
    ...seeded,
    ...data,
    project: { ...seeded.project, ...(data.project || {}) },
    members: Array.isArray(data.members) ? data.members : seeded.members,
    milestones: Array.isArray(data.milestones) ? data.milestones : seeded.milestones,
    tasks: Array.isArray(data.tasks) ? data.tasks.map(normalizeTaskRecord) : seeded.tasks.map(normalizeTaskRecord),
    risks: Array.isArray(data.risks) ? data.risks : seeded.risks,
    decisions: Array.isArray(data.decisions) ? data.decisions : seeded.decisions,
    memory: Array.isArray(data.memory) ? data.memory : seeded.memory,
    audit: Array.isArray(data.audit) ? data.audit : seeded.audit,
    proposals: Array.isArray(data.proposals) ? data.proposals.map(normalizeProposalRecord) : [],
    chat: Array.isArray(data.chat) ? data.chat : seeded.chat
  };

  const rawProjects = Array.isArray(data.projects) ? data.projects : [];
  if (!rawProjects.length) {
    const currentRecord = normalizeProjectRecord(projectDataFromState(normalized), seeded);
    normalized.projects = [currentRecord];
    normalized.activeProjectId = currentRecord.id;
    return applyProjectToState(normalized, currentRecord);
  }

  normalized.projects = rawProjects.map((project) => normalizeProjectRecord(project, seeded));
  const active =
    normalized.projects.find((project) => project.id === data.activeProjectId) ||
    normalized.projects.find((project) => !project.archived) ||
    normalized.projects[0];
  normalized.activeProjectId = active.id;
  return applyProjectToState(normalized, active);
}

function normalizeTaskRecord(task) {
  const now = new Date().toISOString();
  const id = task.id || uid("task");
  return {
    ...task,
    id,
    title: task.title || "未命名任务",
    description: task.description || "",
    owner: normalizeOwnerLabel(task.owner),
    start: normalizeDateValue(task.start),
    due: normalizeDateValue(task.due),
    status: ["todo", "doing", "blocked", "done"].includes(task.status) ? task.status : "todo",
    priority: ["high", "medium", "low"].includes(task.priority) ? task.priority : "medium",
    parentId: task.parentId || "",
    parentTitle: task.parentTitle || "",
    dependencies: Array.isArray(task.dependencies) ? task.dependencies.map(String).filter(Boolean) : normalizeDependencyList(task.dependencies),
    acceptanceCriteria: task.acceptanceCriteria || "",
    confidence: normalizeConfidence(task.confidence),
    inferredFields: Array.isArray(task.inferredFields) ? task.inferredFields : [],
    isWorkPackage: Boolean(task.isWorkPackage),
    source: task.source || "项目记录",
    createdAt: task.createdAt || now,
    updatedAt: task.updatedAt || task.createdAt || now
  };
}

function normalizeProposalRecord(proposal) {
  const now = new Date().toISOString();
  const type = ["task", "risk", "decision", "milestone", "update", "question"].includes(proposal.type) ? proposal.type : "task";
  return {
    ...proposal,
    id: proposal.id || uid("proposal"),
    type,
    action: proposal.action === "update" ? "update" : "create",
    title: proposal.title || "未命名变更",
    description: proposal.description || proposal.detail || proposal.impact || "",
    owner: normalizeOwnerLabel(proposal.owner),
    start: normalizeDateValue(proposal.start),
    due: normalizeDateValue(proposal.due),
    status: ["todo", "doing", "blocked", "done"].includes(proposal.status) ? proposal.status : "",
    priority: ["high", "medium", "low"].includes(proposal.priority) ? proposal.priority : "medium",
    severity: ["high", "medium", "low"].includes(proposal.severity) ? proposal.severity : "",
    parentId: proposal.parentId || "",
    parentTitle: proposal.parentTitle || "",
    dependencies: Array.isArray(proposal.dependencies) ? proposal.dependencies.map(String).filter(Boolean) : normalizeDependencyList(proposal.dependencies),
    acceptanceCriteria: proposal.acceptanceCriteria || "",
    confidence: normalizeConfidence(proposal.confidence),
    inferredFields: Array.isArray(proposal.inferredFields) ? proposal.inferredFields : [],
    evidence: proposal.evidence || proposal.description || "",
    state: proposal.state || "pending",
    createdAt: proposal.createdAt || now
  };
}

function normalizeDependencyList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return String(value)
    .split(/、|,|，|;|；|\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.72;
  return clamp(number > 1 ? number / 100 : number, 0.1, 1);
}

function saveState() {
  state.project.updatedAt = new Date().toISOString();
  updateParentTaskRollups();
  syncActiveProject();
  storageSet(STORAGE_KEY, JSON.stringify(state));
  persistStateToBackend();
}

function updateParentTaskRollups() {
  state.tasks
    .filter((task) => state.tasks.some((child) => child.parentId === task.id))
    .forEach((task) => {
      const children = state.tasks.filter((child) => child.parentId === task.id);
      if (!children.length) return;
      if (children.every((child) => child.status === "done")) task.status = "done";
      else if (children.some((child) => child.status === "blocked")) task.status = "blocked";
      else if (children.some((child) => child.status === "doing" || child.status === "done")) task.status = "doing";
      else task.status = "todo";
      const starts = children.map((child) => normalizeDateValue(child.start)).filter(Boolean).sort();
      const dues = children.map((child) => normalizeDateValue(child.due)).filter(Boolean).sort();
      if (starts.length) task.start = starts[0];
      if (dues.length) task.due = dues[dues.length - 1];
      task.updatedAt = new Date().toISOString();
      task.isWorkPackage = true;
    });
}

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    storageFallbackActive = true;
    return volatileStorage.get(key) || null;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    storageFallbackActive = true;
    volatileStorage.set(key, value);
    notifyStorageFallback();
  }
}

function storageRemove(key) {
  try {
    window.localStorage.removeItem(key);
    volatileStorage.delete(key);
  } catch {
    storageFallbackActive = true;
    volatileStorage.delete(key);
    notifyStorageFallback();
  }
}

function notifyStorageFallback() {
  if (storageFallbackNoticeShown || !storageFallbackActive) return;
  storageFallbackNoticeShown = true;
  window.setTimeout(() => {
    if ($("#toast")) showToast("当前环境禁止本地存储，数据仅在本次页面会话中保留。");
  }, 0);
}

function notifyAuthReturn() {
  try {
    const error = window.sessionStorage.getItem("yanpm-auth-error");
    if (error) {
      window.sessionStorage.removeItem("yanpm-auth-error");
      window.setTimeout(() => showToast(`登录失败：${error}`), 0);
      return;
    }
    if (currentUser?.loggedInAt && Date.now() - new Date(currentUser.loggedInAt).getTime() < 5000) {
      window.setTimeout(() => showToast(`已登录：${identityDisplayName(currentUser)}`), 0);
    }
  } catch {
    // Ignore storage access issues.
  }
}

async function initBackendBridge() {
  if (!/^https?:$/.test(window.location.protocol)) return;
  try {
    const health = await fetch("/api/health", { cache: "no-store" }).then((response) => response.json());
    if (!health?.ok) return;
    backendBridge.available = true;
    await loadAuthRuntimeConfig();

    const payload = await fetch("/api/state", { cache: "no-store" }).then((response) => response.json());
    if (payload?.state) {
      state = normalizeState(payload.state);
      showToast("已连接本地后端，项目数据将保存到 data/state.json。");
      render();
    } else {
      persistStateToBackend();
      showToast("已连接本地后端，后续数据会自动持久化。");
    }
  } catch {
    backendBridge.available = false;
  }
}

async function loadAuthRuntimeConfig() {
  if (!/^https?:$/.test(window.location.protocol)) return;
  try {
    authRuntimeConfig = await fetch("/api/auth/config", { cache: "no-store" }).then((response) => response.json());
  } catch {
    authRuntimeConfig = defaultAuthRuntimeConfig();
  }
}

async function persistStateToBackend() {
  if (!backendBridge.available || backendBridge.saving) return;
  backendBridge.saving = true;
  try {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state })
    });
  } catch {
    backendBridge.available = false;
    showToast("本地后端暂时不可用，已回退到浏览器存储。");
  } finally {
    backendBridge.saving = false;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeProjectRecord(record, fallback) {
  const id = record.id || record.project?.id || uid("project");
  const normalized = {
    id,
    archived: Boolean(record.archived),
    createdAt: record.createdAt || record.project?.createdAt || new Date().toISOString()
  };

  PROJECT_DATA_KEYS.forEach((key) => {
    if (key === "project") {
      normalized.project = { ...fallback.project, ...(record.project || {}), id };
    } else if (Array.isArray(record[key])) {
      normalized[key] = key === "tasks" ? record[key].map(normalizeTaskRecord) : key === "proposals" ? record[key].map(normalizeProposalRecord) : clone(record[key]);
    } else if (Array.isArray(fallback[key])) {
      normalized[key] = key === "tasks" ? fallback[key].map(normalizeTaskRecord) : key === "proposals" ? fallback[key].map(normalizeProposalRecord) : clone(fallback[key]);
    } else {
      normalized[key] = clone(fallback[key] || []);
    }
  });
  normalized.updatedAt = normalized.project.updatedAt || new Date().toISOString();
  return normalized;
}

function projectDataFromState(source) {
  const id = source.activeProjectId || source.project?.id || uid("project");
  const data = { id, archived: false };
  PROJECT_DATA_KEYS.forEach((key) => {
    data[key] = clone(source[key] || (Array.isArray(source[key]) ? [] : {}));
  });
  data.project = { ...(data.project || {}), id };
  return data;
}

function applyProjectToState(target, projectRecord) {
  PROJECT_DATA_KEYS.forEach((key) => {
    target[key] = clone(projectRecord[key]);
  });
  target.activeProjectId = projectRecord.id;
  target.project.id = projectRecord.id;
  return target;
}

function syncActiveProject() {
  if (!Array.isArray(state.projects) || !state.projects.length) return;
  const id = state.activeProjectId || state.project?.id || state.projects[0].id;
  const index = state.projects.findIndex((project) => project.id === id);
  const current = projectDataFromState(state);
  if (index >= 0) {
    current.archived = Boolean(state.projects[index].archived);
    current.createdAt = state.projects[index].createdAt || current.project.createdAt || new Date().toISOString();
    state.projects[index] = { ...state.projects[index], ...current, updatedAt: current.project.updatedAt };
  } else {
    state.projects.push(normalizeProjectRecord(current, seedState()));
  }
}

function getProjectRecords() {
  if (!Array.isArray(state.projects)) return [];
  return state.projects.map((project) => {
    if (project.id !== state.activeProjectId) return project;
    const current = projectDataFromState(state);
    return { ...project, ...current, archived: Boolean(project.archived), updatedAt: state.project.updatedAt };
  });
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function shortText(value, length = 120) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function renderIcons(root = document) {
  $$("[data-icon]", root).forEach((node) => {
    const name = node.dataset.icon;
    if (icons[name]) node.innerHTML = icons[name];
  });
}

function formatDate(dateLike) {
  if (!dateLike) return "未设置";
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return dateLike;
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function formatDateTime(dateLike) {
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function parseDateOnly(dateLike) {
  if (!dateLike) return null;
  const value = String(dateLike);
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatInputDate(dateLike) {
  const date = dateLike instanceof Date ? dateLike : parseDateOnly(dateLike);
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addCalendarDays(dateLike, amount) {
  const date = parseDateOnly(dateLike) || new Date();
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + amount);
  return next;
}

function daysUntil(dateLike) {
  if (!dateLike) return Infinity;
  const due = new Date(`${dateLike}T23:59:59`);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((due - start) / DAY);
}

function tag(label, tone = "neutral") {
  return `<span class="tag ${tone}">${escapeHtml(label)}</span>`;
}

function statusTag(status) {
  const item = statusMap[status] || statusMap.todo;
  return tag(item.label, item.tag);
}

function severityTag(severity) {
  const tone = severity === "high" ? "coral" : severity === "medium" ? "amber" : "blue";
  return tag(severityMap[severity] || "风险", tone);
}

function setActiveView(view) {
  if (view === "conversation") {
    focusGlobalLanguageEntry();
    return;
  }
  activeView = view;
  $$(".nav-item").forEach((button) => button.classList.toggle("is-active", button.dataset.view === view));
  $$(".view").forEach((section) => section.classList.toggle("is-active", section.dataset.view === view));
  $("#viewTitle").textContent = viewTitles[view] || "YanPM";
  render();
}

function computeHealth() {
  const total = Math.max(state.tasks.length, 1);
  const done = state.tasks.filter((task) => task.status === "done").length;
  const blocked = state.tasks.filter((task) => task.status === "blocked").length;
  const overdue = state.tasks.filter((task) => task.status !== "done" && daysUntil(task.due) < 0).length;
  const highRisks = state.risks.filter((risk) => risk.status !== "closed" && risk.severity === "high").length;
  const unassigned = state.tasks.filter((task) => task.status !== "done" && !task.owner).length;
  const weakAcceptance = state.tasks.filter((task) => task.status !== "done" && !task.acceptanceCriteria).length;
  const progressBoost = Math.round((done / total) * 10);
  return clamp(88 + progressBoost - blocked * 8 - overdue * 5 - highRisks * 7 - unassigned * 3 - weakAcceptance * 2, 24, 96);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildNarrative(health) {
  const blocked = state.tasks.filter((task) => task.status === "blocked");
  const dueSoon = state.tasks.filter((task) => task.status !== "done" && daysUntil(task.due) >= 0 && daysUntil(task.due) <= 7);
  const riskCount = state.risks.filter((risk) => risk.status !== "closed").length;
  if (blocked.length) {
    return `项目可推进，但有 ${blocked.length} 个阻塞任务需要尽快拆解。当前开放风险 ${riskCount} 个，7 天内到期任务 ${dueSoon.length} 个。`;
  }
  if (health >= 82) {
    return `项目状态稳定。建议继续把会议和聊天记录沉淀到项目记忆中，让状态更新更少依赖人工维护。`;
  }
  return `项目存在一定波动。建议优先确认即将到期任务的负责人、截止时间和下一步动作。`;
}

function buildAdvice() {
  const advice = [];
  const blocked = state.tasks.filter((task) => task.status === "blocked");
  const overdue = state.tasks.filter((task) => task.status !== "done" && daysUntil(task.due) < 0);
  const dueSoon = state.tasks
    .filter((task) => task.status !== "done" && daysUntil(task.due) >= 0 && daysUntil(task.due) <= 7)
    .sort((a, b) => daysUntil(a.due) - daysUntil(b.due));
  const highRisks = state.risks.filter((risk) => risk.status !== "closed" && risk.severity === "high");
  const pending = state.proposals.filter((proposal) => proposal.state === "pending");

  if (pending.length) {
    advice.push({
      title: `确认 ${pending.length} 条 AI 候选变更`,
      body: "这些候选项确认后会写入任务、风险或决策，项目状态会随之更新。"
    });
  }
  if (blocked.length) {
    advice.push({
      title: `拆解阻塞任务：${blocked[0].title}`,
      body: `建议向 ${blocked[0].owner || "负责人"} 追问阻塞原因、可替代方案和最晚恢复时间。`
    });
  }
  if (overdue.length) {
    advice.push({
      title: `处理 ${overdue.length} 个已延期任务`,
      body: "先判断是否需要调整范围、追加人手，或重新承诺截止时间。"
    });
  }
  if (highRisks.length) {
    advice.push({
      title: `升级高风险：${highRisks[0].title}`,
      body: highRisks[0].impact || "建议明确风险 owner 和缓解动作。"
    });
  }
  if (dueSoon.length) {
    advice.push({
      title: `跟进最近到期任务：${dueSoon[0].title}`,
      body: `${dueSoon[0].owner || "负责人"} 需要在 ${formatDate(dueSoon[0].due)} 前给出进展。`
    });
  }
  if (!advice.length) {
    advice.push({
      title: "继续沉淀项目上下文",
      body: "把下一次会议纪要或聊天记录输入进来，系统会自动识别项目变化。"
    });
  }
  return advice.slice(0, 4);
}

function render() {
  renderProjectChrome();
  renderAuthChrome();
  $("#reviewCount").textContent = String(state.proposals.filter((proposal) => proposal.state === "pending").length);
  renderGlobalLanguageEntry();
  renderIcons();
  if (activeView === "portfolio") renderPortfolio();
  if (activeView === "dashboard") renderDashboard();
  if (activeView === "review") renderReview();
  if (activeView === "tasks") renderTasks();
  if (activeView === "risks") renderRisks();
  if (activeView === "team") renderTeam();
  if (activeView === "reports") renderReports();
  if (activeView === "memory") renderMemory();
  if (activeView === "audit") renderAudit();
}

function renderGlobalLanguageEntry() {
  const input = $("#globalLanguageInput");
  if (!input) return;
  input.placeholder = `输入一句项目更新，或直接提问 · 当前：${state.project.name}`;
  const runButton = $("#globalRunBtn");
  if (runButton && !runButton.disabled) {
    runButton.classList.remove("is-busy");
    runButton.innerHTML = icons.sendUp;
    renderIcons(runButton);
  }
}

function renderProjectChrome() {
  const activeProjects = getProjectRecords().filter((project) => !project.archived);
  $("#projectSelect").innerHTML = activeProjects
    .map((project) => `<option value="${project.id}" ${project.id === state.activeProjectId ? "selected" : ""}>${escapeHtml(project.project.name)}</option>`)
    .join("");
}

function renderAuthChrome() {
  const label = $("#authName");
  if (!label) return;
  label.textContent = currentUser ? identityDisplayName(currentUser) : "微信登录";
  $("#authBtn")?.setAttribute("title", currentUser ? identityStatusText(currentUser) : "微信/企业微信登录");
  $("#authBtn")?.classList.toggle("is-logged-in", Boolean(currentUser));
  $("#authBtn")?.classList.toggle("is-verified", Boolean(currentUser?.verified));
}

function renderPortfolio() {
  const projects = getProjectRecords();
  const activeProjects = projects.filter((project) => !project.archived);
  const totalTasks = activeProjects.reduce((sum, project) => sum + project.tasks.filter((task) => task.status !== "done").length, 0);
  const blocked = activeProjects.reduce((sum, project) => sum + project.tasks.filter((task) => task.status === "blocked").length, 0);
  const risks = activeProjects.reduce((sum, project) => sum + project.risks.filter((risk) => risk.status !== "closed").length, 0);
  const pending = activeProjects.reduce((sum, project) => sum + project.proposals.filter((proposal) => proposal.state === "pending").length, 0);

  $("#portfolioMetrics").innerHTML = [
    ["项目", activeProjects.length],
    ["待推进任务", totalTasks],
    ["阻塞", blocked],
    ["开放风险", risks],
    ["待确认", pending]
  ]
    .map(
      ([label, value]) => `<div>
        <span>${value}</span>
        <small>${label}</small>
      </div>`
    )
    .join("");

  $("#projectGrid").innerHTML = projects.length
    ? projects.map(renderProjectCard).join("")
    : `<div class="empty-state">暂无项目。</div>`;
  $("#portfolioPeople").innerHTML = renderPortfolioPeople();
  renderIcons($("#portfolioView"));
}

function renderProjectCard(project) {
  const health = computeProjectHealth(project);
  const openTasks = project.tasks.filter((task) => task.status !== "done").length;
  const blocked = project.tasks.filter((task) => task.status === "blocked").length;
  const risks = project.risks.filter((risk) => risk.status !== "closed").length;
  const pending = project.proposals.filter((proposal) => proposal.state === "pending").length;
  const isActive = project.id === state.activeProjectId;
  return `<article class="project-card ${project.archived ? "is-archived" : ""}" data-id="${project.id}">
    <div class="project-card-top">
      <div>
        <div class="task-meta">
          ${tag(project.project.phase || "未设置阶段", project.archived ? "neutral" : "blue")}
          ${isActive ? tag("当前", "blue") : ""}
          ${project.archived ? tag("已归档", "neutral") : ""}
        </div>
        <strong>${escapeHtml(project.project.name)}</strong>
        <p>${escapeHtml(shortText(buildProjectCardSummary(project), 120))}</p>
      </div>
      <div class="project-health">${health}<small>健康度</small></div>
    </div>
    <div class="person-metrics">
      <span><strong>${openTasks}</strong><small>待办</small></span>
      <span><strong>${blocked}</strong><small>阻塞</small></span>
      <span><strong>${risks}</strong><small>风险</small></span>
      <span><strong>${pending}</strong><small>确认</small></span>
    </div>
    <div class="item-actions">
      <button class="tiny-button approve" data-action="switch-project" type="button">进入</button>
      <button class="tiny-button" data-action="duplicate-project" type="button">复制</button>
      <button class="tiny-button ${project.archived ? "" : "reject"}" data-action="${project.archived ? "restore-project" : "archive-project"}" type="button">${project.archived ? "恢复" : "归档"}</button>
    </div>
  </article>`;
}

function buildProjectCardSummary(project) {
  const blocked = project.tasks.find((task) => task.status === "blocked");
  const risk = project.risks.find((item) => item.status !== "closed");
  if (blocked) return `阻塞：${blocked.title}`;
  if (risk) return `风险：${risk.title}`;
  const milestone = project.milestones?.find((item) => item.status !== "done");
  if (milestone) return `下一里程碑：${milestone.title}，截止 ${formatDate(milestone.due)}`;
  return "项目状态平稳，等待新的语言输入继续更新。";
}

function computeProjectHealth(project) {
  const total = Math.max(project.tasks.length, 1);
  const done = project.tasks.filter((task) => task.status === "done").length;
  const blocked = project.tasks.filter((task) => task.status === "blocked").length;
  const overdue = project.tasks.filter((task) => task.status !== "done" && daysUntil(task.due) < 0).length;
  const highRisks = project.risks.filter((risk) => risk.status !== "closed" && risk.severity === "high").length;
  const unassigned = project.tasks.filter((task) => task.status !== "done" && !task.owner).length;
  const weakAcceptance = project.tasks.filter((task) => task.status !== "done" && !task.acceptanceCriteria).length;
  const progressBoost = Math.round((done / total) * 10);
  return clamp(88 + progressBoost - blocked * 8 - overdue * 5 - highRisks * 7 - unassigned * 3 - weakAcceptance * 2, 24, 96);
}

function renderPortfolioPeople() {
  const people = getPortfolioPeopleStats();
  if (!people.length) return `<div class="empty-state">暂无跨项目负责人。</div>`;
  return people
    .map(
      (person) => `<article class="portfolio-person">
        <strong>${escapeHtml(person.name)}</strong>
        <div class="task-meta">
          ${tag(`${person.projects.size} 个项目`, "blue")}
          ${tag(`${person.active} 个待办`, "neutral")}
          ${person.blocked ? tag(`${person.blocked} 个阻塞`, "coral") : ""}
          ${person.risks ? tag(`${person.risks} 个风险`, "amber") : ""}
        </div>
      </article>`
    )
    .join("");
}

function getPortfolioPeopleStats() {
  const people = new Map();
  getProjectRecords()
    .filter((project) => !project.archived)
    .forEach((project) => {
      project.tasks.forEach((task) => {
        if (!task.owner) return;
        const item = people.get(task.owner) || { name: task.owner, projects: new Set(), active: 0, blocked: 0, risks: 0 };
        item.projects.add(project.id);
        if (task.status !== "done") item.active += 1;
        if (task.status === "blocked") item.blocked += 1;
        people.set(task.owner, item);
      });
      project.risks.forEach((risk) => {
        if (!risk.owner || risk.status === "closed") return;
        const item = people.get(risk.owner) || { name: risk.owner, projects: new Set(), active: 0, blocked: 0, risks: 0 };
        item.projects.add(project.id);
        item.risks += 1;
        people.set(risk.owner, item);
      });
    });
  return [...people.values()].sort((a, b) => b.blocked - a.blocked || b.risks - a.risks || b.active - a.active);
}

function renderDashboard() {
  const health = computeHealth();
  const active = state.tasks.filter((task) => ["todo", "doing"].includes(task.status)).length;
  const blocked = state.tasks.filter((task) => task.status === "blocked").length;
  const dueSoon = state.tasks.filter((task) => task.status !== "done" && daysUntil(task.due) >= 0 && daysUntil(task.due) <= 7).length;
  const openRisks = state.risks.filter((risk) => risk.status !== "closed").length;

  $("#projectName").textContent = state.project.name;
  $("#projectPhase").textContent = state.project.phase;
  $("#healthScore").textContent = String(health);
  $(".health-score").style.setProperty("--score-angle", `${health * 3.6}deg`);
  $("#healthBar").style.width = `${health}%`;
  $("#projectNarrative").textContent = buildNarrative(health);
  $("#healthReasonList").innerHTML = buildHealthReasons()
    .map((item) => `<span class="health-reason ${item.tone}">${escapeHtml(item.label)}</span>`)
    .join("");
  $("#metricActive").textContent = String(active);
  $("#metricBlocked").textContent = String(blocked);
  $("#metricDue").textContent = String(dueSoon);
  $("#metricRisks").textContent = String(openRisks);

  $("#adviceList").innerHTML = buildAdvice()
    .map(
      (item) => `<article class="advice-item">
        <div class="advice-icon"><span data-icon="spark"></span></div>
        <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.body)}</p></div>
      </article>`
    )
    .join("");

  const priorityTasks = [...state.tasks]
    .filter((task) => task.status !== "done")
    .sort((a, b) => priorityWeight(b.priority) - priorityWeight(a.priority) || daysUntil(a.due) - daysUntil(b.due))
    .slice(0, 4);
  $("#priorityTaskList").innerHTML = priorityTasks.length
    ? priorityTasks.map(renderTaskItem).join("")
    : `<div class="empty-state">暂无待推进任务。</div>`;
  $("#trackingSignalList").innerHTML = buildTrackingSignals()
    .map(
      (item) => `<article class="signal-item ${item.tone}">
        <strong>${escapeHtml(item.title)}</strong>
        <p>${escapeHtml(item.body)}</p>
      </article>`
    )
    .join("");
  $("#milestoneSummaryList").innerHTML = state.milestones?.length
    ? state.milestones.map(renderMilestoneItem).join("")
    : `<div class="empty-state">暂无里程碑。</div>`;
  renderIcons($("#dashboardView"));
  drawSignalCanvas();
}

function priorityWeight(priority) {
  return priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}

function renderTaskItem(task) {
  return `<article class="task-item">
    <strong>${escapeHtml(task.title)}</strong>
    <p>${escapeHtml(shortText(task.description, 110))}</p>
    <div class="task-meta">
      ${statusTag(task.status)}
      ${tag(`负责人：${task.owner || "待确认"}`, "neutral")}
      ${tag(`截止：${formatDate(task.due)}`, daysUntil(task.due) < 0 && task.status !== "done" ? "coral" : "neutral")}
      ${tag(`优先级：${priorityMap[task.priority] || "中"}`, task.priority === "high" ? "amber" : "neutral")}
    </div>
  </article>`;
}

function renderMilestoneItem(milestone) {
  const progress = computeMilestoneProgress(milestone);
  const overdue = milestone.status !== "done" && daysUntil(milestone.due) < 0;
  return `<article class="milestone-item">
    <div class="milestone-top">
      <div>
        <strong>${escapeHtml(milestone.title)}</strong>
        <p>${escapeHtml(shortText(milestone.description, 100))}</p>
      </div>
      ${tag(statusMap[milestone.status]?.label || "待处理", milestone.status === "done" ? "neutral" : overdue ? "coral" : "blue")}
    </div>
    <div class="progress-track slim" aria-label="里程碑进度">
      <span style="width: ${progress}%"></span>
    </div>
    <div class="task-meta">
      ${tag(`负责人：${milestone.owner || "待确认"}`, "neutral")}
      ${tag(`截止：${formatDate(milestone.due)}`, overdue ? "coral" : "neutral")}
      ${tag(`进度：${progress}%`, "neutral")}
    </div>
  </article>`;
}

function computeMilestoneProgress(milestone) {
  if (milestone.status === "done") return 100;
  const related = state.tasks.filter((task) => task.owner === milestone.owner);
  if (!related.length) return milestone.status === "doing" ? 45 : 15;
  const done = related.filter((task) => task.status === "done").length;
  const blocked = related.filter((task) => task.status === "blocked").length;
  return clamp(Math.round((done / related.length) * 70 + (milestone.status === "doing" ? 25 : 10) - blocked * 12), 5, 96);
}

function buildTrackingSignals() {
  const pending = state.proposals.filter((proposal) => proposal.state === "pending");
  const unassigned = state.tasks.filter((task) => task.status !== "done" && !task.owner);
  const missingAcceptance = state.tasks.filter((task) => task.status !== "done" && !task.acceptanceCriteria);
  const dependencyBlocked = state.tasks.filter((task) => task.status !== "done" && task.dependencies?.some((dep) => {
    const matched = findTaskByTitle(dep);
    return matched && matched.status !== "done";
  }));
  const overdue = state.tasks.filter((task) => task.status !== "done" && daysUntil(task.due) < 0);
  const blocked = state.tasks.filter((task) => task.status === "blocked");
  const stale = state.tasks.filter((task) => task.status === "doing" && daysSince(task.updatedAt || task.createdAt) >= 3);
  const milestoneDue = (state.milestones || []).filter((milestone) => milestone.status !== "done" && daysUntil(milestone.due) >= 0 && daysUntil(milestone.due) <= 7);
  const signals = [];

  if (pending.length) signals.push({ tone: "amber", title: "有 AI 变更等待确认", body: `${pending.length} 条候选变更还没有写入项目状态。` });
  if (blocked.length) signals.push({ tone: "coral", title: "阻塞需要拆解", body: `${blocked[0].title} 当前阻塞，建议今天确认恢复路径。` });
  if (overdue.length) signals.push({ tone: "coral", title: "存在延期任务", body: `${overdue.length} 个任务已超过截止时间，需要重新承诺交付。` });
  if (unassigned.length) signals.push({ tone: "amber", title: "任务缺少负责人", body: `${unassigned.length} 个任务无法自动跟踪负责人。` });
  if (missingAcceptance.length) signals.push({ tone: "amber", title: "验收标准不清", body: `${missingAcceptance.length} 个任务缺少验收标准，完成状态可能不可判定。` });
  if (dependencyBlocked.length) signals.push({ tone: "coral", title: "存在依赖阻塞", body: `${dependencyBlocked[0].title} 依赖未完成任务，需要确认先后顺序。` });
  if (stale.length) signals.push({ tone: "blue", title: "进行中任务缺少近况", body: `${stale.length} 个任务超过 3 天没有状态变化。` });
  if (milestoneDue.length) signals.push({ tone: "blue", title: "里程碑临近", body: `${milestoneDue[0].title} 将在 ${formatDate(milestoneDue[0].due)} 到期。` });

  if (!signals.length) {
    signals.push({ tone: "neutral", title: "追踪信号平稳", body: "当前没有明显延期、阻塞或缺失负责人。继续保持会议输入即可。" });
  }
  return signals.slice(0, 5);
}

function buildHealthReasons() {
  const overdue = state.tasks.filter((task) => task.status !== "done" && daysUntil(task.due) < 0).length;
  const blocked = state.tasks.filter((task) => task.status === "blocked").length;
  const highRisks = state.risks.filter((risk) => risk.status !== "closed" && risk.severity === "high").length;
  const unassigned = state.tasks.filter((task) => task.status !== "done" && !task.owner).length;
  const unaccepted = state.tasks.filter((task) => task.status !== "done" && !task.acceptanceCriteria).length;
  const pending = state.proposals.filter((proposal) => proposal.state === "pending").length;
  const stale = state.tasks.filter((task) => task.status === "doing" && daysSince(task.updatedAt || task.createdAt) >= 3).length;
  return [
    { label: `延期 ${overdue}`, tone: overdue ? "coral" : "blue" },
    { label: `阻塞 ${blocked}`, tone: blocked ? "coral" : "blue" },
    { label: `高风险 ${highRisks}`, tone: highRisks ? "coral" : "blue" },
    { label: `负责人缺失 ${unassigned}`, tone: unassigned ? "amber" : "blue" },
    { label: `验收缺失 ${unaccepted}`, tone: unaccepted ? "amber" : "blue" },
    { label: `待确认 ${pending}`, tone: pending ? "amber" : "blue" },
    { label: `久未更新 ${stale}`, tone: stale ? "amber" : "blue" }
  ];
}

function daysSince(dateLike) {
  if (!dateLike) return 0;
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.floor((Date.now() - date.getTime()) / DAY);
}

function drawSignalCanvas() {
  const canvas = $("#signalCanvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#dff4e8");
  gradient.addColorStop(1, "#e0f0fb");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(32, 35, 31, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 40; x < width; x += 80) {
    ctx.beginPath();
    ctx.moveTo(x, 28);
    ctx.lineTo(x, height - 28);
    ctx.stroke();
  }
  for (let y = 50; y < height; y += 52) {
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(width - 28, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#20342a";
  ctx.font = "700 18px Inter, sans-serif";
  ctx.fillText("项目状态信号", 30, 36);
  ctx.font = "500 12px Inter, sans-serif";
  ctx.fillStyle = "#687169";
  ctx.fillText("任务、风险、决策会随每次语言输入持续更新", 30, 57);

  const items = [
    ...state.tasks.slice(0, 8).map((task, index) => ({ kind: "task", item: task, index })),
    ...state.risks.slice(0, 4).map((risk, index) => ({ kind: "risk", item: risk, index })),
    ...state.decisions.slice(0, 3).map((decision, index) => ({ kind: "decision", item: decision, index }))
  ];
  const lanes = [92, 142, 192];

  items.forEach((entry, index) => {
    const x = 58 + (index % 8) * 86;
    const y = lanes[index % lanes.length];
    const color =
      entry.kind === "risk"
        ? entry.item.severity === "high"
          ? "#c7513a"
          : "#b86e15"
        : entry.kind === "decision"
          ? "#6e5aa8"
          : entry.item.status === "done"
            ? "#2f7d57"
            : entry.item.status === "blocked"
              ? "#c7513a"
              : "#326d9a";

    if (index > 0) {
      const prevX = 58 + ((index - 1) % 8) * 86;
      const prevY = lanes[(index - 1) % lanes.length];
      ctx.strokeStyle = "rgba(32, 35, 31, 0.18)";
      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, entry.kind === "risk" ? 13 : 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(entry.kind === "risk" ? "R" : entry.kind === "decision" ? "D" : "T", x, y);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const legend = [
    ["#326d9a", "任务"],
    ["#c7513a", "风险"],
    ["#6e5aa8", "决策"]
  ];
  legend.forEach(([color, label], index) => {
    const x = width - 210 + index * 66;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, 34, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#20342a";
    ctx.font = "700 12px Inter, sans-serif";
    ctx.fillText(label, x + 12, 38);
  });
}

function renderConversation() {
  if (!$("#chatFeed")) return;
  $("#aiModeLabel").textContent = inputMode === "extract" ? "提取模式" : "问答模式";
  $("#chatFeed").innerHTML = state.chat
    .slice(-18)
    .map(
      (message) => `<div class="message ${message.role}">
        <strong>${message.role === "ai" ? "AI 项目助理" : "你"}</strong>
        ${formatMessage(message.content)}
      </div>`
    )
    .join("");
  $("#chatFeed").scrollTop = $("#chatFeed").scrollHeight;
}

function formatMessage(content) {
  const lines = String(content || "").split("\n");
  if (lines.some((line) => line.trim().startsWith("- "))) {
    const html = [];
    let inList = false;
    lines.forEach((line) => {
      if (line.trim().startsWith("- ")) {
        if (!inList) {
          html.push("<ul>");
          inList = true;
        }
        html.push(`<li>${escapeHtml(line.trim().slice(2))}</li>`);
      } else {
        if (inList) {
          html.push("</ul>");
          inList = false;
        }
        if (line.trim()) html.push(`<p>${escapeHtml(line)}</p>`);
      }
    });
    if (inList) html.push("</ul>");
    return html.join("");
  }
  return `<p>${escapeHtml(content)}</p>`;
}

function renderReview() {
  const proposals = state.proposals.filter((proposal) => proposal.state !== "approved");
  $("#proposalList").innerHTML = proposals.length
    ? renderProposalGroups(proposals)
    : `<div class="empty-state">暂无待确认变更。在底部全局输入框粘贴会议纪要，AI 会把项目变化放到这里。</div>`;
  renderIcons($("#reviewView"));
}

function renderProposalGroups(proposals) {
  const groups = [
    ["task", "新增任务", "AI 拆出的可执行任务，确认后进入任务管理和甘特图。"],
    ["question", "需要追问", "负责人、截止时间或验收标准缺失时，先向人确认。"],
    ["risk", "风险与阻塞", "确认后进入风险管理。"],
    ["milestone", "里程碑", "确认后进入工作台里程碑。"],
    ["update", "状态更新", "确认后更新已有任务。"],
    ["decision", "决策记录", "确认后进入项目记忆。"]
  ];
  return groups
    .map(([type, title, description]) => {
      const items = proposals.filter((proposal) => proposal.type === type);
      if (!items.length) return "";
      return `<section class="proposal-group">
        <div class="proposal-group-head">
          <div>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(description)}</p>
          </div>
          ${tag(`${items.length} 条`, type === "question" ? "amber" : "blue")}
        </div>
        ${items.map(renderProposal).join("")}
      </section>`;
    })
    .join("");
}

function renderProposal(proposal) {
  const stateTone = proposal.state === "rejected" ? "coral" : "amber";
  return `<article class="proposal-item" data-id="${proposal.id}">
    <div class="proposal-top">
      <div>
        <div class="proposal-meta">
          ${tag(proposalTypeLabel(proposal.type), proposalTypeTone(proposal.type))}
          ${tag(proposal.action === "update" ? "更新" : "新建", "neutral")}
          ${tag(proposal.state === "rejected" ? "已忽略" : "待确认", stateTone)}
          ${proposal.parentTitle ? tag(`父任务：${proposal.parentTitle}`, "violet") : ""}
          ${isPotentialDuplicateProposal(proposal) ? tag("可能重复", "amber") : ""}
        </div>
        <strong>${escapeHtml(proposal.title)}</strong>
        <p>${escapeHtml(proposal.description || proposal.impact || proposal.detail || "等待补充说明")}</p>
      </div>
      <div class="proposal-actions">
        <button class="tiny-button approve" data-action="approve-proposal" type="button">确认</button>
        ${isPotentialDuplicateProposal(proposal) ? `<button class="tiny-button" data-action="merge-proposal" type="button">合并</button>` : ""}
        <button class="tiny-button" data-action="edit-proposal" type="button">编辑</button>
        <button class="tiny-button reject" data-action="reject-proposal" type="button">忽略</button>
      </div>
    </div>
    <div class="proposal-meta">
      ${proposal.owner ? tag(`负责人：${proposal.owner}`, "neutral") : tag("负责人待确认", "amber")}
      ${proposal.start ? tag(`开始：${formatDate(proposal.start)}`, "neutral") : ""}
      ${proposal.due ? tag(`截止：${formatDate(proposal.due)}`, "neutral") : ""}
      ${proposal.status ? statusTag(proposal.status) : ""}
      ${proposal.severity ? severityTag(proposal.severity) : ""}
      ${proposal.acceptanceCriteria ? tag("有验收标准", "blue") : proposal.type === "task" ? tag("验收待确认", "amber") : ""}
      ${renderConfidenceTag(proposal)}
      ${tag(`来源：${proposal.source}`, "neutral")}
    </div>
    ${proposal.dependencies?.length ? `<p class="acceptance-line">依赖：${escapeHtml(proposal.dependencies.join("、"))}</p>` : ""}
    ${proposal.acceptanceCriteria ? `<p class="acceptance-line">验收：${escapeHtml(proposal.acceptanceCriteria)}</p>` : ""}
    <p>${escapeHtml(shortText(proposal.evidence, 180))}</p>
  </article>`;
}

function proposalTypeLabel(type) {
  return { task: "任务", risk: "风险", decision: "决策", milestone: "里程碑", update: "状态更新", question: "追问" }[type] || "变更";
}

function proposalTypeTone(type) {
  return { task: "blue", risk: "coral", decision: "violet", milestone: "blue", update: "amber", question: "neutral" }[type] || "neutral";
}

function isPotentialDuplicateProposal(proposal) {
  if (!["task", "risk", "milestone"].includes(proposal.type)) return false;
  const titleWords = keywordSet(proposal.title);
  const collection = proposal.type === "risk" ? state.risks : proposal.type === "milestone" ? state.milestones : state.tasks;
  return collection.some((item) => {
    const words = keywordSet(`${item.title} ${item.description || item.impact || ""}`);
    return [...titleWords].filter((word) => words.has(word)).length >= 2;
  });
}

function renderTasks() {
  $$("#taskFilters button").forEach((button) => button.classList.toggle("is-active", button.dataset.filter === taskFilter));
  $$("#taskViewMode button").forEach((button) => button.classList.toggle("is-active", button.dataset.taskView === taskViewMode));
  const tasks = getVisibleTasks();
  $("#taskBoard").className = taskViewMode === "gantt" ? "task-board gantt-board" : "task-board";
  $("#taskBoard").innerHTML = taskViewMode === "gantt" ? renderTaskGantt(tasks) : renderTaskColumns(tasks);
  renderIcons($("#tasksView"));
}

function getVisibleTasks() {
  return state.tasks.filter((task) => taskFilter === "all" || task.status === taskFilter);
}

function renderTaskColumns(visibleTasks) {
  return Object.entries(statusMap)
    .map(([status, item]) => {
      const tasks = sortTasksForDisplay(visibleTasks.filter((task) => task.status === status));
      return `<section class="task-column">
        <h3>${item.label} · ${tasks.length}</h3>
        ${tasks.length ? tasks.map(renderTaskCard).join("") : `<div class="empty-state">暂无${item.label}任务。</div>`}
      </section>`;
    })
    .join("");
}

function renderTaskCard(task) {
  const rollup = computeTaskRollup(task);
  const blockedByDependencies = getOpenDependencies(task);
  return `<article class="task-card ${task.parentId ? "is-child" : ""} ${task.isWorkPackage ? "is-package" : ""}" data-id="${task.id}" style="--task-depth: ${taskDepth(task)};">
    <div class="task-meta">
      ${task.parentId ? tag("子任务", "blue") : task.isWorkPackage ? tag("工作包", "violet") : ""}
      ${tag(`优先级：${priorityMap[task.priority] || "中"}`, task.priority === "high" ? "amber" : "neutral")}
      ${daysUntil(task.due) < 0 && task.status !== "done" ? tag("已延期", "coral") : ""}
    </div>
    <strong>${escapeHtml(task.title)}</strong>
    <p>${escapeHtml(shortText(task.description, 118))}</p>
    ${task.acceptanceCriteria ? `<p class="acceptance-line">验收：${escapeHtml(shortText(task.acceptanceCriteria, 82))}</p>` : ""}
    <div class="task-meta">
      ${tag(`负责人：${task.owner || "待确认"}`, "neutral")}
      ${tag(`截止：${formatDate(task.due)}`, "neutral")}
      ${blockedByDependencies.length ? tag(`依赖未完成 ${blockedByDependencies.length}`, "coral") : task.dependencies?.length ? tag(`依赖 ${task.dependencies.length}`, "neutral") : ""}
      ${renderConfidenceTag(task)}
      ${rollup.total ? tag(`子任务 ${rollup.done}/${rollup.total}`, "blue") : ""}
    </div>
    ${rollup.total ? `<div class="progress-track slim"><span style="width: ${rollup.progress}%"></span></div>` : ""}
    <select data-action="change-task-status" aria-label="修改任务状态">
      ${Object.entries(statusMap)
        .map(([value, item]) => `<option value="${value}" ${task.status === value ? "selected" : ""}>${item.label}</option>`)
        .join("")}
    </select>
    <div class="item-actions">
      ${canDecomposeTask(task) ? `<button class="tiny-button" data-action="decompose-task" type="button"><span data-icon="list"></span> 拆解</button>` : ""}
      <button class="tiny-button" data-action="edit-task" type="button"><span data-icon="edit"></span> 编辑</button>
      <button class="tiny-button reject" data-action="delete-task" type="button"><span data-icon="trash"></span> 删除</button>
    </div>
  </article>`;
}

function renderTaskGantt(tasks) {
  if (!tasks.length) return `<div class="empty-state">暂无符合筛选条件的任务。</div>`;

  const entries = sortTasksForDisplay(tasks)
    .map((task) => {
      const start = getTaskStartDate(task);
      const end = getTaskEndDate(task, start);
      return { task, start, end };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const today = parseDateOnly(new Date().toISOString());
  const minTime = Math.min(today.getTime(), ...entries.map((entry) => entry.start.getTime()));
  const maxTime = Math.max(today.getTime(), ...entries.map((entry) => entry.end.getTime()));
  const rangeStart = addCalendarDays(new Date(minTime), -2);
  const rangeEnd = addCalendarDays(new Date(maxTime), 4);
  const totalDays = Math.max(14, Math.round((rangeEnd - rangeStart) / DAY) + 1);
  const todayOffset = Math.round((today - rangeStart) / DAY);
  const todayLine =
    todayOffset >= 0 && todayOffset < totalDays ? `<span class="gantt-today-line" style="grid-column: ${todayOffset + 1};"></span>` : "";

  return `<div class="gantt-shell" style="--gantt-days: ${totalDays}; --timeline-width: ${totalDays * 34}px;">
    <div class="gantt-grid">
      <div class="gantt-label-head">任务</div>
      <div class="gantt-timeline-head">${buildGanttHeader(rangeStart, totalDays)}${todayLine}</div>
      ${entries.map((entry) => renderTaskGanttRow(entry, rangeStart, totalDays, todayLine)).join("")}
    </div>
  </div>`;
}

function buildGanttHeader(rangeStart, totalDays) {
  return Array.from({ length: totalDays }, (_, index) => {
    const date = addCalendarDays(rangeStart, index);
    const isMonthStart = date.getDate() === 1;
    const isWeekStart = date.getDay() === 1;
    const label = isMonthStart ? `${date.getMonth() + 1}月` : isWeekStart || index === 0 ? `${date.getMonth() + 1}/${date.getDate()}` : "";
    return `<span class="${date.getDay() === 0 || date.getDay() === 6 ? "is-weekend" : ""}">${label}</span>`;
  }).join("");
}

function renderTaskGanttRow(entry, rangeStart, totalDays, todayLine) {
  const { task, start, end } = entry;
  const startOffset = clamp(Math.round((start - rangeStart) / DAY), 0, totalDays - 1);
  const duration = Math.max(1, Math.round((end - start) / DAY) + 1);
  const visibleDuration = clamp(duration, 1, totalDays - startOffset);
  const progress = getTaskProgress(task.status);
  const overdue = daysUntil(task.due) < 0 && task.status !== "done";

  const rollup = computeTaskRollup(task);
  const blockedByDependencies = getOpenDependencies(task);
  return `<article class="gantt-row-label ${task.parentId ? "is-child" : ""} ${task.isWorkPackage ? "is-package" : ""}" data-id="${task.id}" style="--task-depth: ${taskDepth(task)};">
      <strong>${escapeHtml(task.title)}</strong>
      <div class="task-meta">
        ${task.parentId ? tag("子任务", "blue") : task.isWorkPackage ? tag("工作包", "violet") : ""}
        ${statusTag(task.status)}
        ${tag(task.owner || "待确认负责人", "neutral")}
        ${overdue ? tag("已延期", "coral") : tag(`截止：${formatDate(task.due)}`, "neutral")}
        ${blockedByDependencies.length ? tag(`依赖 ${blockedByDependencies.length}`, "coral") : task.dependencies?.length ? tag(`依赖 ${task.dependencies.length}`, "neutral") : ""}
        ${renderConfidenceTag(task)}
      </div>
      ${task.acceptanceCriteria ? `<p class="acceptance-line">验收：${escapeHtml(shortText(task.acceptanceCriteria, 72))}</p>` : ""}
      ${rollup.total ? `<div class="progress-track slim"><span style="width: ${rollup.progress}%"></span></div>` : ""}
      <select data-action="change-task-status" aria-label="修改任务状态">
        ${Object.entries(statusMap)
          .map(([value, item]) => `<option value="${value}" ${task.status === value ? "selected" : ""}>${item.label}</option>`)
          .join("")}
      </select>
      <div class="item-actions">
        ${canDecomposeTask(task) ? `<button class="tiny-button" data-action="decompose-task" type="button"><span data-icon="list"></span> 拆解</button>` : ""}
        <button class="tiny-button" data-action="edit-task" type="button"><span data-icon="edit"></span> 编辑</button>
        <button class="tiny-button reject" data-action="delete-task" type="button"><span data-icon="trash"></span> 删除</button>
      </div>
    </article>
    <div class="gantt-row-timeline" data-id="${task.id}">
      ${todayLine}
      <button class="gantt-bar ${task.status || "todo"}" data-action="edit-task" type="button" style="grid-column: ${startOffset + 1} / span ${visibleDuration}; --progress: ${progress}%;" title="${escapeHtml(task.title)}：${formatDate(start)} - ${formatDate(end)}">
        <span>${escapeHtml(shortText(task.title, 22))}</span>
      </button>
    </div>`;
}

function getTaskStartDate(task) {
  const explicit = parseDateOnly(task.start);
  if (explicit) return explicit;
  const due = parseDateOnly(task.due);
  const created = parseDateOnly(task.createdAt);
  if (created && due && created <= due) return created;
  if (due) return addCalendarDays(due, task.priority === "high" ? -7 : task.priority === "low" ? -3 : -5);
  return parseDateOnly(new Date().toISOString());
}

function getTaskEndDate(task, start) {
  const due = parseDateOnly(task.due);
  if (!due) return addCalendarDays(start, 1);
  return due < start ? start : due;
}

function getTaskProgress(status) {
  return { todo: 12, doing: 55, blocked: 32, done: 100 }[status] || 12;
}

function canDecomposeTask(task) {
  return !state.tasks.some((child) => child.parentId === task.id) && shouldDecomposeWorkPackage(`${task.title || ""} ${task.description || ""}`);
}

function sortTasksForDisplay(tasks) {
  const visible = new Map(tasks.map((task) => [task.id, task]));
  const children = new Map();
  tasks.forEach((task) => {
    if (!task.parentId || !visible.has(task.parentId)) return;
    const list = children.get(task.parentId) || [];
    list.push(task);
    children.set(task.parentId, list);
  });
  const roots = tasks.filter((task) => !task.parentId || !visible.has(task.parentId));
  const sortFn = (a, b) => getTaskStartDate(a) - getTaskStartDate(b) || daysUntil(a.due) - daysUntil(b.due) || a.title.localeCompare(b.title, "zh-CN");
  const ordered = [];
  const visit = (task) => {
    ordered.push(task);
    (children.get(task.id) || []).sort(sortFn).forEach(visit);
  };
  roots.sort(sortFn).forEach(visit);
  return ordered;
}

function taskDepth(task) {
  let depth = 0;
  let current = task;
  const seen = new Set();
  while (current?.parentId && depth < 3 && !seen.has(current.parentId)) {
    seen.add(current.parentId);
    current = state.tasks.find((item) => item.id === current.parentId);
    if (current) depth += 1;
  }
  return depth;
}

function computeTaskRollup(task) {
  const children = state.tasks.filter((item) => item.parentId === task.id);
  const total = children.length;
  const done = children.filter((item) => item.status === "done").length;
  const blocked = children.filter((item) => item.status === "blocked").length;
  return {
    total,
    done,
    blocked,
    progress: total ? clamp(Math.round((done / total) * 100 - blocked * 8), 0, 100) : getTaskProgress(task.status)
  };
}

function getOpenDependencies(task) {
  return (task.dependencies || [])
    .map(findTaskByTitle)
    .filter((item) => item && item.status !== "done");
}

function renderConfidenceTag(item) {
  const value = Math.round(normalizeConfidence(item.confidence) * 100);
  const tone = value >= 82 ? "blue" : value >= 60 ? "amber" : "coral";
  const inferred = item.inferredFields?.length ? ` · 推断${item.inferredFields.length}项` : "";
  return tag(`置信度 ${value}%${inferred}`, tone);
}

function renderRisks() {
  const risks = [...state.risks].sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));
  $("#riskList").innerHTML = risks.length
    ? risks.map(renderRiskItem).join("")
    : `<div class="empty-state">暂无开放风险。</div>`;
  renderIcons($("#risksView"));
}

function severityWeight(severity) {
  return severity === "high" ? 3 : severity === "medium" ? 2 : 1;
}

function renderRiskItem(risk) {
  return `<article class="risk-item" data-id="${risk.id}">
    <div>
      <div class="risk-meta">
        ${severityTag(risk.severity)}
        ${tag(risk.status === "closed" ? "已关闭" : "开放", risk.status === "closed" ? "neutral" : "amber")}
        ${tag(`负责人：${risk.owner || "待确认"}`, "neutral")}
      </div>
      <strong>${escapeHtml(risk.title)}</strong>
      <p>${escapeHtml(risk.impact || "暂无影响说明")}</p>
      <div class="risk-meta">
        ${tag(`来源：${risk.source || "手动创建"}`, "neutral")}
        ${tag(`更新时间：${formatDate(risk.updatedAt || risk.createdAt)}`, "neutral")}
      </div>
    </div>
    <div class="item-actions">
      <button class="tiny-button" data-action="edit-risk" type="button"><span data-icon="edit"></span> 编辑</button>
      <button class="tiny-button" data-action="toggle-risk" type="button">${risk.status === "closed" ? "重新打开" : "关闭"}</button>
      <button class="tiny-button reject" data-action="delete-risk" type="button"><span data-icon="trash"></span> 删除</button>
    </div>
  </article>`;
}

function renderTeam() {
  const people = getPeopleStats();
  $("#peopleGrid").innerHTML = people.length
    ? people.map(renderPersonCard).join("")
    : `<div class="empty-state">暂无团队负责人。</div>`;

  const followups = buildFollowupMessages();
  $("#followupList").innerHTML = followups.length
    ? followups
        .map(
          (item) => `<article class="followup-item">
            <div class="task-meta">${tag(item.owner, "blue")}${tag(item.reason, item.tone)}</div>
            <p>${escapeHtml(item.message)}</p>
          </article>`
        )
        .join("")
    : `<div class="empty-state">暂无需要主动跟进的负责人。</div>`;
  renderIcons($("#teamView"));
}

function getPeopleStats() {
  const names = new Set((state.members || []).map((member) => member.name));
  state.tasks.forEach((task) => {
    if (task.owner) names.add(task.owner);
  });
  state.risks.forEach((risk) => {
    if (risk.owner) names.add(risk.owner);
  });

  return [...names]
    .map((name) => {
      const member = (state.members || []).find((item) => item.name === name) || {};
      const tasks = state.tasks.filter((task) => task.owner === name);
      const risks = state.risks.filter((risk) => risk.owner === name && risk.status !== "closed");
      const active = tasks.filter((task) => ["todo", "doing"].includes(task.status));
      const blocked = tasks.filter((task) => task.status === "blocked");
      const overdue = tasks.filter((task) => task.status !== "done" && daysUntil(task.due) < 0);
      const dueSoon = tasks.filter((task) => task.status !== "done" && daysUntil(task.due) >= 0 && daysUntil(task.due) <= 7);
      const load = active.length + blocked.length * 2 + risks.length + overdue.length * 2;
      return { name, member, tasks, risks, active, blocked, overdue, dueSoon, load };
    })
    .sort((a, b) => b.load - a.load || a.name.localeCompare(b.name, "zh-CN"));
}

function renderPersonCard(person) {
  const loadTone = person.load >= 6 ? "coral" : person.load >= 3 ? "amber" : "blue";
  return `<article class="person-card">
    <div class="person-top">
      <div>
        <strong>${escapeHtml(person.name)}</strong>
        <p>${escapeHtml(person.member.role || "项目成员")}</p>
      </div>
      ${tag(`负载 ${person.load}`, loadTone)}
    </div>
    <p>${escapeHtml(person.member.focus || "根据任务和风险自动聚合。")}</p>
    <div class="person-metrics">
      <span><strong>${person.active.length}</strong><small>待办</small></span>
      <span><strong>${person.blocked.length}</strong><small>阻塞</small></span>
      <span><strong>${person.overdue.length}</strong><small>延期</small></span>
      <span><strong>${person.risks.length}</strong><small>风险</small></span>
    </div>
    <div class="task-meta">
      ${person.dueSoon.length ? tag(`临近：${person.dueSoon[0].title}`, "amber") : tag("暂无临期任务", "neutral")}
    </div>
  </article>`;
}

function buildFollowupMessages() {
  return getPeopleStats()
    .map((person) => {
      if (person.blocked.length) {
        return {
          owner: person.name,
          reason: "阻塞",
          tone: "coral",
          message: `${person.name}，${person.blocked[0].title} 当前处于阻塞状态。请确认阻塞原因、需要谁支持，以及最晚什么时候能恢复推进。`
        };
      }
      if (person.overdue.length) {
        return {
          owner: person.name,
          reason: "延期",
          tone: "coral",
          message: `${person.name}，${person.overdue[0].title} 已超过原截止时间。请更新当前进展、剩余工作量和新的交付时间。`
        };
      }
      if (person.dueSoon.length) {
        return {
          owner: person.name,
          reason: "临期",
          tone: "amber",
          message: `${person.name}，${person.dueSoon[0].title} 将在 ${formatDate(person.dueSoon[0].due)} 到期。请同步是否能按期完成，以及是否存在需要提前暴露的风险。`
        };
      }
      if (person.risks.length) {
        return {
          owner: person.name,
          reason: "风险",
          tone: "amber",
          message: `${person.name}，请更新风险“${person.risks[0].title}”的缓解动作和当前判断。`
        };
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 8);
}

function renderReports() {
  $$("#reportMode button").forEach((button) => button.classList.toggle("is-active", button.dataset.report === reportMode));
  $("#reportOutput").value = generateReport(reportMode);
  $("#reportEvidence").innerHTML = buildReportEvidence().join("");
  renderIcons($("#reportsView"));
}

function generateReport(mode = "weekly") {
  const health = computeHealth();
  const active = state.tasks.filter((task) => ["todo", "doing"].includes(task.status));
  const done = state.tasks.filter((task) => task.status === "done");
  const blocked = state.tasks.filter((task) => task.status === "blocked");
  const overdue = state.tasks.filter((task) => task.status !== "done" && daysUntil(task.due) < 0);
  const dueSoon = state.tasks.filter((task) => task.status !== "done" && daysUntil(task.due) >= 0 && daysUntil(task.due) <= 7);
  const openRisks = state.risks.filter((risk) => risk.status !== "closed");
  const milestones = state.milestones || [];

  if (mode === "executive") {
    return [
      `${state.project.name}｜管理层摘要`,
      "",
      `整体判断：项目健康度 ${health}，当前处于${state.project.phase}阶段。`,
      `关键进展：已完成 ${done.length} 个任务，进行中/待处理 ${active.length} 个。`,
      `主要风险：开放风险 ${openRisks.length} 个，高风险 ${openRisks.filter((risk) => risk.severity === "high").length} 个，阻塞任务 ${blocked.length} 个。`,
      `近期节点：${milestones.slice(0, 3).map((item) => `${item.title} ${formatDate(item.due)}`).join("；") || "暂无明确里程碑"}`,
      "",
      "建议管理动作：",
      ...buildAdvice().slice(0, 3).map((item) => `- ${item.title}：${item.body}`)
    ].join("\n");
  }

  if (mode === "risk") {
    return [
      `${state.project.name}｜风险升级摘要`,
      "",
      `开放风险：${openRisks.length} 个`,
      `阻塞任务：${blocked.length} 个`,
      `延期任务：${overdue.length} 个`,
      "",
      "重点风险：",
      ...(openRisks.length ? openRisks.map((risk) => `- ${risk.title}｜级别：${severityMap[risk.severity]}｜负责人：${risk.owner || "待确认"}｜影响：${risk.impact || "待补充"}`) : ["- 暂无开放风险"]),
      "",
      "建议动作：",
      ...buildTrackingSignals().slice(0, 4).map((item) => `- ${item.title}：${item.body}`)
    ].join("\n");
  }

  return [
    `${state.project.name}｜项目周报`,
    "",
    `项目阶段：${state.project.phase}`,
    `项目健康度：${health}`,
    "",
    "本周进展：",
    ...(done.slice(0, 5).map((task) => `- ${task.title} 已完成，来源：${task.source || "项目记录"}`) || []),
    done.length ? "" : "- 暂无已完成任务，需要继续输入会议进展。",
    "",
    "进行中任务：",
    ...(active.length ? active.slice(0, 8).map((task) => `- ${task.title}｜负责人：${task.owner || "待确认"}｜截止：${formatDate(task.due)}`) : ["- 暂无进行中任务"]),
    "",
    "风险与阻塞：",
    ...(openRisks.length ? openRisks.slice(0, 6).map((risk) => `- ${risk.title}｜${severityMap[risk.severity]}｜${risk.impact || "待补充影响"}`) : ["- 暂无开放风险"]),
    "",
    "下周重点：",
    ...(dueSoon.length ? dueSoon.slice(0, 5).map((task) => `- ${task.title}，${formatDate(task.due)} 前由 ${task.owner || "待确认"} 推进`) : buildAdvice().slice(0, 3).map((item) => `- ${item.title}`))
  ].join("\n");
}

function buildReportEvidence() {
  const items = [];
  const dueSoon = state.tasks.filter((task) => task.status !== "done" && daysUntil(task.due) >= 0 && daysUntil(task.due) <= 7);
  const openRisks = state.risks.filter((risk) => risk.status !== "closed");
  const recentMemory = [...state.memory].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 3);

  items.push(`<article class="evidence-item"><strong>任务依据</strong><p>${state.tasks.length} 个任务，${dueSoon.length} 个 7 天内到期。</p></article>`);
  items.push(`<article class="evidence-item"><strong>风险依据</strong><p>${openRisks.length} 个开放风险，${openRisks.filter((risk) => risk.severity === "high").length} 个高风险。</p></article>`);
  items.push(`<article class="evidence-item"><strong>里程碑依据</strong><p>${(state.milestones || []).map((item) => `${item.title} ${formatDate(item.due)}`).join("；") || "暂无里程碑"}</p></article>`);
  recentMemory.forEach((item) => {
    items.push(`<article class="evidence-item"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail || item.source || "")}</p></article>`);
  });
  return items;
}

function renderMemory() {
  const memory = [...state.memory].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $("#memoryTimeline").innerHTML = memory.length
    ? memory
        .map(
          (item) => `<article class="timeline-item">
            <div class="timeline-meta">
              ${tag(memoryTypeLabel(item.type), proposalTypeTone(item.type))}
              ${tag(formatDateTime(item.createdAt), "neutral")}
              ${tag(`来源：${item.source || "项目更新"}`, "neutral")}
            </div>
            <strong>${escapeHtml(item.title)}</strong>
            <p>${escapeHtml(item.detail || "")}</p>
          </article>`
        )
        .join("")
    : `<div class="empty-state">暂无项目记忆。</div>`;

  $("#decisionList").innerHTML = state.decisions.length
    ? [...state.decisions]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(
          (decision) => `<article class="decision-item">
            <div class="timeline-meta">
              ${tag(formatDateTime(decision.createdAt), "neutral")}
              ${tag(`来源：${decision.source || "项目更新"}`, "neutral")}
            </div>
            <strong>${escapeHtml(decision.title)}</strong>
            <p>${escapeHtml(decision.detail || "")}</p>
          </article>`
        )
        .join("")
    : `<div class="empty-state">暂无决策记录。</div>`;
}

function renderAudit() {
  const audit = [...(state.audit || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  $("#auditList").innerHTML = audit.length
    ? audit
        .slice(0, 160)
        .map(
          (item) => `<article class="audit-item">
            <div class="timeline-meta">
              ${tag(auditActionLabel(item.action), auditActionTone(item.action))}
              ${tag(formatDateTime(item.createdAt), "neutral")}
              ${tag(`操作者：${item.actor || "未登录用户"}`, "neutral")}
            </div>
            <strong>${escapeHtml(item.title || "项目操作")}</strong>
            <p>${escapeHtml(item.detail || "")}</p>
            <small>${escapeHtml(item.projectName || state.project.name)}</small>
          </article>`
        )
        .join("")
    : `<div class="empty-state">暂无审计记录。</div>`;
  renderIcons($("#auditView"));
}

function auditActionLabel(action) {
  return {
    init: "初始化",
    login: "登录",
    logout: "退出",
    create: "新增",
    update: "更新",
    approve: "确认",
    reject: "忽略",
    merge: "合并",
    delete: "删除",
    import: "导入",
    export: "导出",
    archive: "归档",
    restore: "恢复",
    switch: "切换"
  }[action] || "操作";
}

function auditActionTone(action) {
  if (["delete", "reject", "archive"].includes(action)) return "coral";
  if (["approve", "merge", "restore", "login"].includes(action)) return "blue";
  if (["import", "export", "switch"].includes(action)) return "amber";
  return "neutral";
}

function memoryTypeLabel(type) {
  return { task: "任务", risk: "风险", decision: "决策", milestone: "里程碑", update: "更新", question: "追问" }[type] || "记录";
}

async function runAssistant() {
  const input = $("#globalLanguageInput")?.value.trim() || "";
  await runAssistantFromText(input, {
    mode: "auto",
    source: "global",
    clear: () => {
      $("#globalLanguageInput").value = "";
    }
  });
}

async function runGlobalAssistant(mode = "auto") {
  const input = $("#globalLanguageInput").value.trim();
  await runAssistantFromText(input, {
    mode,
    source: "global",
    clear: () => {
      $("#globalLanguageInput").value = "";
    }
  });
}

async function runAssistantFromText(input, options = {}) {
  const mode = options.mode === "auto" || !options.mode ? inferInputMode(input) : options.mode;
  if (!input) {
    showToast("先输入一段会议纪要、聊天记录或问题。");
    return;
  }

  let route = { reason: `已归入当前项目“${state.project.name}”` };

  setAiBusy(true, options.source);
  try {
    route = routeInputToProject(input);
    const routedToAnotherProject = route.projectId !== state.activeProjectId;
    if (routedToAnotherProject) switchProject(route.projectId, { silent: true });

    addChat("user", input);
    if (mode === "ask") {
      const answer = await answerQuestionWithRuntime(input);
      addChat("ai", answer);
      options.clear?.();
      saveState();
      if (options.source === "global") showToast(`${route.reason}，已完成问答。`);
      render();
      return;
    }

    const proposals = await extractProposalsWithRuntime(input);
    if (!proposals.length) {
      addChat(
        "ai",
        "我没有识别到足够明确的项目变更。建议补充：任务动作、负责人、截止时间、当前状态或风险影响。"
      );
    } else {
      state.proposals.unshift(...proposals);
      addChat(
        "ai",
        `我识别到 ${proposals.length} 条候选变更，已放入“待确认”。\n${proposals
          .slice(0, 5)
          .map((proposal) => `- ${proposalTypeLabel(proposal.type)}：${proposal.title}`)
          .join("\n")}`
      );
      showToast(`${route.reason}，已生成 ${proposals.length} 条待确认变更。`);
    }
    options.clear?.();
    saveState();
    render();
  } catch (error) {
    showToast(`处理失败：${error.message || "请稍后再试"}`);
  } finally {
    setAiBusy(false, options.source);
  }
}

function inferInputMode(input) {
  const text = String(input || "");
  const explicitQuestion = /[?？]|^(请问|问一下|我想知道|帮我看|帮我查)|谁|什么|哪些|是否|有没有|怎么样|如何|为什么|状态如何|进展如何|风险有哪些/.test(text);
  const projectUpdate = /(负责|需要|完成|已完成|推进|跟进|处理|交付|开发|设计|测试|联调|整理|上线|发布|验收|修复|准备|确认|决定|新增|延期|阻塞)/.test(text);
  return explicitQuestion && !projectUpdate ? "ask" : "extract";
}

function routeInputToProject(input) {
  const match = detectProjectForInput(input);
  if (!match || match.id === state.activeProjectId) {
    return {
      projectId: state.activeProjectId,
      reason: `已归入当前项目“${state.project.name}”`
    };
  }
  return {
    projectId: match.id,
    reason: `已识别并归入项目“${match.project.name}”`
  };
}

function detectProjectForInput(input) {
  const text = normalizeProjectMatchText(input);
  const active = getProjectRecords().find((project) => project.id === state.activeProjectId);
  const candidates = getProjectRecords()
    .filter((project) => !project.archived)
    .map((project) => ({ project, score: scoreProjectMention(project, text) }))
    .filter((item) => item.score >= 4)
    .sort((a, b) => b.score - a.score);
  if (!candidates.length) return active;
  if (active && scoreProjectMention(active, text) >= candidates[0].score) return active;
  return candidates[0].project;
}

function normalizeProjectMatchText(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function scoreProjectMention(project, text) {
  const name = normalizeProjectMatchText(project.project?.name || "");
  if (!name) return 0;
  let score = text.includes(name) ? 10 : 0;
  const tokens = (project.project?.name || "")
    .split(/[\s·｜|/、，,：:（）()_-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
  tokens.forEach((token) => {
    if (text.includes(normalizeProjectMatchText(token))) score += 3;
  });
  if (project.project?.phase && text.includes(normalizeProjectMatchText(project.project.phase))) score += 1;
  return score;
}

function setAiBusy(isBusy, source = "global") {
  const runButton = $("#globalRunBtn");
  if (!runButton) return;
  runButton.disabled = isBusy;
  $("#globalVoiceBtn").disabled = isBusy;
  $("#globalAddBtn").disabled = isBusy;
  runButton.classList.toggle("is-busy", Boolean(isBusy && source === "global"));
  runButton.setAttribute("aria-label", isBusy ? "发送中" : "发送");
  runButton.title = isBusy ? "发送中" : "发送";
  runButton.innerHTML = isBusy && source === "global" ? `<span class="send-spinner" aria-hidden="true"></span>` : icons.sendUp;
  renderIcons(runButton);
}

function addChat(role, content) {
  state.chat.push({
    id: uid("msg"),
    role,
    content,
    createdAt: new Date().toISOString()
  });
  state.chat = state.chat.slice(-40);
}

async function answerQuestionWithRuntime(question) {
  if (aiConfig.mode === "mock") return answerQuestion(question);
  try {
    return await callAiText({
      purpose: "project-question",
      instruction:
        "你是一个中文 AI 项目管理助理。基于项目上下文回答用户问题，重点给出项目状态、风险、任务、负责人、下一步动作。回答要简洁、可执行。",
      user: question,
      context: buildAiProjectContext()
    });
  } catch (error) {
    showToast(`AI 调用失败，已使用本地模拟：${error.message}`);
    return answerQuestion(question);
  }
}

async function extractProposalsWithRuntime(text) {
  if (aiConfig.mode === "mock") return extractProposals(text);
  try {
    const result = await callAiJson({
      purpose: "extract-project-changes",
      instruction:
        "你是项目管理信息抽取器。请从中文会议纪要、聊天记录或日报中提取项目变更，只返回 JSON。需要把宽泛工作包拆成可监督、可执行的小任务：每条任务应尽量只有一个交付动作、一个负责人、一个完成时间。遇到“办公家具、网络等行政准备”“设计、招聘、培训、工程”等并列事项时，要按事项和责任角色拆开；原文没有负责人或日期时，可以给出合理责任角色和建议日期，但 evidence 必须保留原文依据。",
      user: text,
      context: buildAiProjectContext(),
      schemaHint: {
        proposals: [
          {
            type: "task|risk|decision|milestone|update|question",
            action: "create|update",
            title: "简短标题",
            description: "说明",
            owner: "负责人，没有则空字符串",
            start: "YYYY-MM-DD，没有则空字符串",
            due: "YYYY-MM-DD，没有则空字符串",
            parentTitle: "父任务或工作包标题，没有则空字符串",
            dependencies: ["依赖的任务标题"],
            acceptanceCriteria: "验收标准，没有则空字符串",
            confidence: "0-1 之间的置信度",
            inferredFields: ["AI 推断字段名，例如 owner/due/start/acceptanceCriteria"],
            status: "todo|doing|blocked|done，没有则空字符串",
            priority: "high|medium|low",
            severity: "high|medium|low",
            evidence: "原文依据"
          }
        ]
      }
    });
    const proposals = Array.isArray(result?.proposals) ? result.proposals : Array.isArray(result) ? result : [];
    return normalizeAiProposals(proposals, text);
  } catch (error) {
    showToast(`AI 调用失败，已使用本地模拟：${error.message}`);
    return extractProposals(text);
  }
}

async function frameworkWithRuntime(answers) {
  const fallback = buildProjectFramework(answers);
  if (aiConfig.mode === "mock") return fallback;
  try {
    const result = await callAiJson({
      purpose: "project-framework",
      instruction:
        "你是资深项目经理。根据立项访谈答案生成项目管理框架，只返回 JSON。内容要具体、可执行，适合中文团队使用。",
      user: JSON.stringify(answers, null, 2),
      context: {
        today: toDateValue(new Date().getFullYear(), new Date().getMonth() + 1, new Date().getDate())
      },
      schemaHint: {
        name: "项目名称",
        phase: "项目阶段",
        goal: "项目目标",
        scope: "第一阶段范围",
        members: [{ name: "成员或角色", role: "职责", focus: "关注点" }],
        milestones: [{ title: "里程碑", due: "YYYY-MM-DD", owner: "负责人", description: "说明" }],
        tasks: [{ title: "任务", description: "说明", owner: "负责人", start: "YYYY-MM-DD", due: "YYYY-MM-DD", dependencies: ["依赖任务"], acceptanceCriteria: "验收标准", priority: "high|medium|low" }],
        risks: [{ title: "风险", impact: "影响", owner: "负责人", severity: "high|medium|low" }],
        decisions: [{ title: "决策", detail: "说明" }]
      }
    });
    return mergeAiFramework(fallback, result);
  } catch (error) {
    showToast(`AI 建项失败，已使用本地模拟框架：${error.message}`);
    return fallback;
  }
}

function normalizeAiProposals(items, sourceText) {
  const source = `AI 提取 · ${formatDateTime(new Date())}`;
  const normalized = items
    .flatMap((item) => {
      const type = ["task", "risk", "decision", "milestone", "update", "question"].includes(item.type) ? item.type : "task";
      const proposal = {
        id: uid("proposal"),
        type,
        action: item.action === "update" ? "update" : "create",
        title: shortText(item.title || item.description || item.evidence || "未命名变更", 56),
        description: item.description || item.detail || item.impact || item.evidence || "",
        detail: item.detail || item.description || "",
        impact: item.impact || item.description || "",
        owner: normalizeOwnerLabel(item.owner),
        start: normalizeDateValue(item.start),
        due: normalizeDateValue(item.due) || normalizeDue(item.evidence || item.description || ""),
        parentTitle: item.parentTitle || "",
        dependencies: normalizeDependencyList(item.dependencies),
        acceptanceCriteria: item.acceptanceCriteria || "",
        confidence: normalizeConfidence(item.confidence),
        inferredFields: Array.isArray(item.inferredFields) ? item.inferredFields : [],
        status: ["todo", "doing", "blocked", "done"].includes(item.status) ? item.status : "",
        priority: ["high", "medium", "low"].includes(item.priority) ? item.priority : "medium",
        severity: ["high", "medium", "low"].includes(item.severity) ? item.severity : "",
        source,
        evidence: item.evidence || item.description || shortText(sourceText, 180),
        state: "pending",
        createdAt: new Date().toISOString()
      };
      if (proposal.type === "task" && proposal.action === "create") {
        const decomposed = decomposeWorkPackage(`${proposal.title} ${proposal.description}`, source, proposal);
        if (decomposed.length) return decomposed;
      }
      return [proposal];
    })
    .filter((item) => item.title && item.evidence);
  return enrichProposalsForReview(normalized, sourceText).slice(0, 18);
}

function enrichProposalsForReview(proposals, sourceText) {
  const normalized = proposals.map(normalizeProposalRecord);
  const questions = buildMissingInfoQuestions(normalized, sourceText);
  return mergeSimilarProposals([...normalized, ...questions]);
}

function buildMissingInfoQuestions(proposals, sourceText) {
  const source = `AI 追问 · ${formatDateTime(new Date())}`;
  return proposals
    .filter((proposal) => proposal.type === "task" && proposal.action !== "update")
    .flatMap((proposal) => {
      const missing = [];
      if (!proposal.owner) missing.push("负责人");
      if (!proposal.due) missing.push("截止时间");
      if (!proposal.acceptanceCriteria) missing.push("验收标准");
      if (!missing.length) return [];
      return [
        normalizeProposalRecord({
          id: uid("proposal"),
          type: "question",
          action: "create",
          title: `补充“${shortText(proposal.title, 18)}”的${missing.join("、")}`,
          description: `为了让这项工作可监督，请确认：${missing.join("、")}。`,
          source,
          evidence: proposal.evidence || shortText(sourceText, 180),
          confidence: 1,
          state: "pending",
          createdAt: new Date().toISOString()
        })
      ];
    })
    .slice(0, 6);
}

function normalizeDateValue(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return normalizeDue(text);
}

function buildAiProjectContext() {
  return {
    project: state.project,
    milestones: state.milestones.slice(0, 8),
    tasks: state.tasks.slice(0, 16),
    risks: state.risks.slice(0, 10),
    decisions: state.decisions.slice(0, 8),
    pendingProposals: state.proposals.filter((proposal) => proposal.state === "pending").slice(0, 10)
  };
}

async function callAiJson(payload) {
  const text = await callAiText({
    ...payload,
    instruction: `${payload.instruction}\n\n返回格式必须是合法 JSON，不要输出 Markdown，不要输出解释。`
  });
  return parseJsonFromText(text);
}

async function callAiText({ purpose, instruction, user, context, schemaHint, maxTokens }) {
  assertLiveAiConfig();
  const baseUrl = aiConfig.baseUrl.replace(/\/+$/, "");
  const prompt = [
    instruction,
    "",
    `任务：${purpose}`,
    "",
    "项目上下文：",
    JSON.stringify(context || {}, null, 2),
    schemaHint ? `\n期望结构：\n${JSON.stringify(schemaHint, null, 2)}` : "",
    "",
    "用户输入：",
    user
  ].join("\n");

  if (aiConfig.mode === "codex-test") {
    if (!backendBridge.available) {
      throw new Error("Codex 临时测试需要通过本地服务运行，请使用 npm start 后打开 http://127.0.0.1:8787。");
    }
    const data = await postJson("/api/ai", {
      mode: aiConfig.mode,
      purpose,
      instruction,
      prompt
    });
    return data?.text || "";
  }

  if (backendBridge.available && aiConfig.mode !== "mock") {
    const data = await postJson("/api/ai", {
      mode: aiConfig.mode,
      baseUrl,
      model: aiConfig.model,
      apiKey: aiConfig.apiKey,
      purpose,
      instruction,
      prompt,
      maxTokens
    });
    return data?.text || extractResponseText(data?.raw);
  }

  if (!aiConfig.apiKey) throw new Error("缺少 API Key");

  if (aiConfig.mode === "openai-responses") {
    const data = await postJson(buildAiEndpointUrl(baseUrl, "/responses"), {
      model: aiConfig.model,
      input: prompt,
      ...(maxTokens ? { max_output_tokens: maxTokens } : {})
    });
    return extractResponseText(data);
  }

  if (aiConfig.mode === "openai-chat") {
    const data = await postJson(buildAiEndpointUrl(baseUrl, "/chat/completions"), {
      model: aiConfig.model,
      messages: [
        { role: "system", content: instruction },
        { role: "user", content: prompt }
      ],
      temperature: resolveChatTemperature(baseUrl, aiConfig.model),
      ...(maxTokens ? { max_tokens: maxTokens } : {})
    });
    return extractResponseText(data);
  }

  return "";
}

function assertLiveAiConfig() {
  if (aiConfig.mode === "mock") return;
  if (aiConfig.mode === "codex-test") return;
  if (!aiConfig.baseUrl) throw new Error("请先填写 Base URL");
  if (!aiConfig.model) throw new Error("请先填写模型名或 Endpoint ID");
}

function buildAiEndpointUrl(baseUrl, suffix) {
  const cleanBase = String(baseUrl || "").trim().replace(/\/+$/, "");
  const cleanSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  if (cleanBase.endsWith(cleanSuffix)) return cleanBase;
  return `${cleanBase}${cleanSuffix}`;
}

function resolveChatTemperature(baseUrl, model) {
  const text = `${baseUrl} ${model}`.toLowerCase();
  if (text.includes("moonshot") || text.includes("kimi-k2.6")) return 1;
  return 0.2;
}

async function postJson(url, body) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  const headers = {
    "Content-Type": "application/json"
  };
  if (aiConfig.apiKey && !url.startsWith("/api/")) {
    headers.Authorization = `Bearer ${aiConfig.apiKey}`;
  }
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`请求超过 ${AI_TIMEOUT_MS / 1000} 秒未返回`);
    }
    throw new Error(error.message || "网络请求失败");
  } finally {
    window.clearTimeout(timer);
  }
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.error || data?.message || data?.raw || `HTTP ${response.status}`);
  }
  return data;
}

function extractResponseText(data) {
  const parts = [];
  appendTextPart(parts, data?.output_text);
  appendTextPart(parts, data?.text);
  (data?.choices || []).forEach((choice) => {
    appendTextPart(parts, choice?.message?.content);
    appendTextPart(parts, choice?.delta?.content);
    appendTextPart(parts, choice?.text);
  });
  (data?.output || []).forEach((item) => {
    appendTextPart(parts, item?.content);
    appendTextPart(parts, item?.output_text);
    appendTextPart(parts, item?.text);
  });
  return parts.filter(Boolean).join("\n").trim();
}

function appendTextPart(parts, value) {
  if (!value) return;
  if (typeof value === "string") {
    const text = value.trim();
    if (text) parts.push(text);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => appendTextPart(parts, item));
    return;
  }
  if (typeof value !== "object") return;
  appendTextPart(parts, value.text);
  appendTextPart(parts, value.output_text);
  appendTextPart(parts, value.content);
}

function emptyAiOutputMessage() {
  return "模型请求已完成，但没有返回可展示文本。请检查模型名和运行模式是否匹配；Kimi 可先试 kimi-latest 或 moonshot-v1-8k。";
}

function parseJsonFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) throw new Error("AI 没有返回内容");
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!match) throw new Error("AI 返回不是 JSON");
    return JSON.parse(match[0]);
  }
}

function mergeAiFramework(fallback, result) {
  const now = new Date().toISOString();
  const members = Array.isArray(result?.members) && result.members.length ? result.members : fallback.members;
  const owner = members[0]?.name || "项目负责人";
  return {
    ...fallback,
    name: cleanProjectName(result?.name) || fallback.name,
    phase: result?.phase || fallback.phase,
    goal: result?.goal || fallback.goal,
    scope: result?.scope || fallback.scope,
    members: members.map((member) => ({
      id: uid("member"),
      name: member.name || member.role || "项目成员",
      role: member.role || "项目成员",
      focus: member.focus || "根据 AI 建项结果补充职责。"
    })),
    milestones: normalizeFrameworkMilestones(result?.milestones, fallback.milestones, owner, now),
    tasks: normalizeFrameworkTasks(result?.tasks, fallback.tasks, owner, now),
    risks: normalizeFrameworkRisks(result?.risks, fallback.risks, owner, now),
    decisions: normalizeFrameworkDecisions(result?.decisions, fallback.decisions, now)
  };
}

function normalizeFrameworkMilestones(items, fallback, owner, now) {
  if (!Array.isArray(items) || !items.length) return fallback;
  return items.slice(0, 6).map((item) => ({
    id: uid("milestone"),
    title: item.title || "未命名里程碑",
    due: normalizeDateValue(item.due) || addDays(14),
    status: ["todo", "doing", "done"].includes(item.status) ? item.status : "todo",
    owner: item.owner || owner,
    description: item.description || "",
    createdAt: now,
    updatedAt: now
  }));
}

function normalizeFrameworkTasks(items, fallback, owner, now) {
  if (!Array.isArray(items) || !items.length) return fallback;
  return items.slice(0, 12).map((item) => {
    const due = normalizeDateValue(item.due) || addDays(7);
    return {
      id: uid("task"),
      title: item.title || "未命名任务",
      description: item.description || "",
      owner: item.owner || owner,
      start: normalizeDateValue(item.start) || formatInputDate(now),
      due,
      status: "todo",
      priority: ["high", "medium", "low"].includes(item.priority) ? item.priority : "medium",
      parentId: "",
      dependencies: normalizeDependencyList(item.dependencies),
      acceptanceCriteria: item.acceptanceCriteria || inferAcceptanceCriteria(item.title || "任务"),
      confidence: normalizeConfidence(item.confidence || 0.82),
      inferredFields: Array.isArray(item.inferredFields) ? item.inferredFields : [],
      source: "AI 建项向导",
      createdAt: now,
      updatedAt: now
    };
  });
}

function normalizeFrameworkRisks(items, fallback, owner, now) {
  if (!Array.isArray(items) || !items.length) return fallback;
  return items.slice(0, 8).map((item) => ({
    id: uid("risk"),
    title: item.title || "未命名风险",
    impact: item.impact || item.description || "",
    owner: item.owner || owner,
    severity: ["high", "medium", "low"].includes(item.severity) ? item.severity : "medium",
    status: "open",
    source: "AI 建项向导",
    createdAt: now,
    updatedAt: now
  }));
}

function normalizeFrameworkDecisions(items, fallback, now) {
  if (!Array.isArray(items) || !items.length) return fallback;
  return items.slice(0, 6).map((item) => ({
    id: uid("decision"),
    title: item.title || "未命名决策",
    detail: item.detail || item.description || "",
    source: "AI 建项向导",
    createdAt: now
  }));
}

function extractProposals(text) {
  const source = `语言输入 · ${formatDateTime(new Date())}`;
  const clauses = splitClauses(text);
  const proposals = [];

  clauses.forEach((clause) => {
    const clean = clause.trim();
    if (clean.length < 4) return;

    const decomposed = decomposeWorkPackage(clean, source);
    if (decomposed.length) {
      proposals.push(...decomposed);
      return;
    }

    if (isDecisionClause(clean)) {
      proposals.push({
        id: uid("proposal"),
        type: "decision",
        action: "create",
        title: cleanDecisionTitle(clean),
        detail: clean,
        description: clean,
        source,
        evidence: clean,
        state: "pending",
        createdAt: new Date().toISOString()
      });
      return;
    }

    if (isRiskClause(clean)) {
      proposals.push({
        id: uid("proposal"),
        type: "risk",
        action: "create",
        title: cleanRiskTitle(clean),
        impact: clean,
        description: clean,
        owner: extractOwner(clean),
        severity: inferSeverity(clean),
        source,
        evidence: clean,
        state: "pending",
        createdAt: new Date().toISOString()
      });
    }

    if (isMilestoneClause(clean)) {
      proposals.push({
        id: uid("proposal"),
        type: "milestone",
        action: "create",
        title: cleanMilestoneTitle(clean),
        description: clean,
        owner: extractOwner(clean),
        due: normalizeDue(clean),
        status: inferStatus(clean) || "todo",
        source,
        evidence: clean,
        state: "pending",
        createdAt: new Date().toISOString()
      });
      return;
    }

    if (isTaskClause(clean) && (!isRiskClause(clean) || hasExplicitAction(clean))) {
      const status = inferStatus(clean);
      const matched = findLikelyTask(clean);
      const owner = extractOwner(clean);
      const due = normalizeDue(clean);
      proposals.push({
        id: uid("proposal"),
        type: matched && status ? "update" : "task",
        action: matched && status ? "update" : "create",
        targetId: matched?.id,
        title: matched && status ? `更新任务状态：${matched.title}` : cleanTaskTitle(clean),
        description: clean,
        owner,
        due,
        status: status || "todo",
        priority: inferPriority(clean),
        dependencies: extractDependencies(clean),
        acceptanceCriteria: inferAcceptanceCriteria(clean),
        confidence: owner && due ? 0.9 : 0.68,
        inferredFields: [owner ? "" : "owner", due ? "" : "due"].filter(Boolean),
        source,
        evidence: clean,
        state: "pending",
        createdAt: new Date().toISOString()
      });
    }
  });

  if (proposals.length && proposals.some((proposal) => proposal.type === "task" && !proposal.owner)) {
    proposals.push({
      id: uid("proposal"),
      type: "question",
      action: "create",
      title: "有任务缺少负责人",
      description: "建议确认这些任务由谁负责，否则后续无法自动追踪。",
      source,
      evidence: shortText(text, 180),
      state: "pending",
      createdAt: new Date().toISOString()
    });
  }

  return enrichProposalsForReview(mergeSimilarProposals(proposals), text).slice(0, 18);
}

function splitClauses(text) {
  return text
    .replace(/\r/g, "\n")
    .replace(/([：:]\s*)(\d+)[、，,.)）]/g, "\n$2、")
    .replace(/([，,；;]\s*)(\d+)[、，,.)）]/g, "\n$2、")
    .split(/[\n。；;]+/)
    .map((line) => line.replace(/^\s*[-*\d.、，,)）]+/, "").trim())
    .filter(Boolean);
}

const workPackageTemplates = {
  "办公家具": [
    ["确认办公家具需求清单", "统计工位、会议室、储物等家具数量和规格，确认预算、到场时间和安装条件。", "行政负责人", 2, "high"],
    ["完成办公家具采购与到场安装", "推进采购或租赁下单，协调供应商到场并完成安装。", "采购/行政负责人", 5, "high"],
    ["验收办公家具可用状态", "检查数量、位置、安全性和可用性，形成验收记录。", "行政负责人", 7, "medium"]
  ],
  "家具": [
    ["确认办公家具需求清单", "统计工位、会议室、储物等家具数量和规格，确认预算、到场时间和安装条件。", "行政负责人", 2, "high"],
    ["完成办公家具采购与到场安装", "推进采购或租赁下单，协调供应商到场并完成安装。", "采购/行政负责人", 5, "high"]
  ],
  "网络": [
    ["确认网络点位和带宽需求", "明确办公区网络点位、带宽、Wi-Fi 覆盖和权限要求。", "IT/网络负责人", 2, "high"],
    ["完成网络开通、布线和设备配置", "协调运营商、布线、路由交换设备和无线网络配置。", "IT/网络负责人", 5, "high"],
    ["完成网络连通性与安全验收", "验证办公区网络可用性、稳定性、访问权限和基础安全策略。", "IT/网络负责人", 7, "high"]
  ],
  "布线": [
    ["确认网络布线点位", "明确点位数量、位置和施工窗口。", "IT/网络负责人", 2, "high"],
    ["完成网络布线施工验收", "协调施工并验收链路连通性。", "IT/网络负责人", 5, "high"]
  ],
  "工位": [
    ["确认工位规划和座位表", "确认团队人数、座位布局、扩展余量和入驻批次。", "行政负责人", 2, "medium"],
    ["完成工位布置与验收", "协调桌椅、电源、网络和标识，确保入驻可用。", "行政负责人", 5, "medium"]
  ],
  "门禁": [
    ["确认门禁权限范围", "明确人员名单、权限分组和开通时间。", "行政/IT 负责人", 2, "medium"],
    ["完成门禁开通与验证", "开通门禁权限并验证关键人员可正常通行。", "行政/IT 负责人", 4, "medium"]
  ],
  "办公设备": [
    ["确认办公设备清单", "明确电脑、显示器、打印机等设备数量、规格和领用人。", "行政/IT 负责人", 2, "medium"],
    ["完成办公设备采购配置", "完成设备采购、到货、资产登记和基础配置。", "行政/IT 负责人", 6, "medium"]
  ],
  "办公用品": [
    ["确认办公用品清单", "统计入驻初期必需耗材、标识和公共用品。", "行政负责人", 2, "low"],
    ["完成办公用品采购入库", "完成采购、到货验收和领用规则。", "行政负责人", 5, "low"]
  ],
  "账号": [
    ["确认系统账号和权限清单", "明确成员需要开通的系统、角色和审批人。", "IT/系统管理员", 2, "high"],
    ["完成账号开通与权限验证", "开通账号并验证登录、访问权限和安全策略。", "IT/系统管理员", 4, "high"]
  ],
  "权限": [
    ["确认系统账号和权限清单", "明确成员需要开通的系统、角色和审批人。", "IT/系统管理员", 2, "high"],
    ["完成账号开通与权限验证", "开通账号并验证登录、访问权限和安全策略。", "IT/系统管理员", 4, "high"]
  ],
  "招聘": [
    ["确认招聘需求和岗位画像", "明确岗位数量、能力要求、到岗时间和面试流程。", "人力资源负责人", 2, "high"],
    ["推进候选人筛选和面试安排", "同步候选人漏斗，安排面试并输出候选人状态。", "人力资源负责人", 6, "high"]
  ],
  "培训": [
    ["制定培训计划和材料", "明确培训对象、课程内容、讲师和考核方式。", "培训负责人", 3, "medium"],
    ["完成培训组织与效果确认", "完成培训签到、答疑和效果反馈收集。", "培训负责人", 7, "medium"]
  ],
  "设计": [
    ["明确设计输入和验收标准", "确认设计目标、约束、交付物和评审人。", "设计负责人", 2, "high"],
    ["完成设计方案并组织评审", "输出设计方案，完成评审问题闭环。", "设计负责人", 6, "high"]
  ],
  "工程": [
    ["确认工程实施范围和施工计划", "明确施工内容、供应商、窗口期和验收标准。", "工程负责人", 3, "high"],
    ["完成工程实施与验收", "推进现场实施并完成验收记录。", "工程负责人", 8, "high"]
  ]
};

function decomposeWorkPackage(text, source, base = {}) {
  if (!shouldDecomposeWorkPackage(text)) return [];
  const items = extractWorkItems(text);
  if (!items.length) return [];

  const explicitOwner = normalizeOwnerLabel(base.owner) || normalizeOwnerLabel(extractOwner(text));
  const explicitDue = base.due || normalizeDue(text);
  const explicitStart = base.start || "";
  const parentTitle = base.parentTitle || cleanTaskTitle(text);
  const tasks = [];

  items.forEach((item) => {
    const template = workPackageTemplates[item] || buildGenericWorkTemplate(item, explicitOwner);
    template.forEach(([title, description, owner, offset, priority]) => {
      const due = explicitDue || addDays(offset);
      const inferredFields = [];
      if (!explicitOwner) inferredFields.push("owner");
      if (!explicitDue) inferredFields.push("due");
      if (!explicitStart) inferredFields.push("start");
      tasks.push(makeTaskProposal({
        title,
        description: `${description}${explicitDue ? "" : " 原文未给出明确截止时间，系统先给出建议日期，可在确认前修改。"}`,
        owner: explicitOwner || owner,
        start: explicitStart || addDays(Math.max(0, offset - 2)),
        due,
        parentId: base.parentId || "",
        parentTitle,
        acceptanceCriteria: inferAcceptanceCriteria(title),
        dependencies: [],
        confidence: explicitOwner && explicitDue ? 0.92 : 0.76,
        inferredFields,
        priority: base.priority || priority,
        source,
        evidence: base.evidence || text
      }));
    });
  });

  return tasks.slice(0, 12);
}

function shouldDecomposeWorkPackage(text) {
  if (!isTaskClause(text)) return false;
  const hasPackageSignal = /(等|准备工作|相关工作|各项|整体|统筹|工作包|配套|行政功能|行政准备|拆解)/.test(text);
  const hasListSignal = /[、/]|以及|和|及|与/.test(text);
  const knownMatches = Object.keys(workPackageTemplates).filter((item) => text.includes(item)).length;
  return (hasPackageSignal && (hasListSignal || knownMatches >= 1)) || knownMatches >= 2;
}

function extractWorkItems(text) {
  const known = Object.keys(workPackageTemplates)
    .filter((item) => text.includes(item))
    .filter((item, index, list) => !list.some((other, otherIndex) => otherIndex !== index && other.includes(item)));
  if (known.length) return [...new Set(known)];

  const match = text.match(/(?:完成|准备|推进|处理|落实|交付)(.+?)(?:的?(?:准备工作|相关工作|各项工作|事项|功能|工作))?$/);
  const raw = (match?.[1] || text)
    .replace(/此外|还需要|需要|必须|请|由.+?负责/g, "")
    .replace(/等.+$/g, "")
    .trim();
  return raw
    .split(/、|，|,|\/|以及|和|及|与/)
    .map((item) => item.replace(/^(完成|准备|推进|处理|落实|交付)/, "").replace(/(准备|工作|事项|功能)$/g, "").trim())
    .filter((item) => item.length >= 2 && !/(项目|任务|相关|各项|整体|统筹)/.test(item))
    .slice(0, 6);
}

function buildGenericWorkTemplate(item, explicitOwner) {
  const owner = explicitOwner || inferOwnerForWorkItem(item);
  return [
    [`确认${item}需求与验收标准`, `把“${item}”拆成清单、范围、负责人、资源和验收标准。`, owner, 2, "medium"],
    [`完成${item}交付与验收`, `推进“${item}”执行并形成可验收结果。`, owner, 6, "medium"]
  ];
}

function inferOwnerForWorkItem(item) {
  if (/(网络|布线|账号|权限|系统|设备|电脑)/.test(item)) return "IT/网络负责人";
  if (/(招聘|入职|人员)/.test(item)) return "人力资源负责人";
  if (/(设计|方案|图纸)/.test(item)) return "设计负责人";
  if (/(工程|施工|装修|物业|水电)/.test(item)) return "工程负责人";
  if (/(采购|家具|工位|办公|行政|门禁)/.test(item)) return "行政负责人";
  return "项目负责人";
}

function inferAcceptanceCriteria(title) {
  if (/确认|明确|制定/.test(title)) return "相关清单、标准或方案已被负责人确认，并能作为后续执行依据。";
  if (/验收|验证/.test(title)) return "完成现场或交付物检查，问题已记录并明确闭环负责人。";
  if (/采购|安装|开通|配置|完成/.test(title)) return "交付物已到位并可正常使用，关键干系人确认通过。";
  return "输出物明确、负责人确认完成，并留下可追溯记录。";
}

function makeTaskProposal({ title, description, owner, start, due, parentId = "", parentTitle = "", dependencies = [], acceptanceCriteria = "", confidence = 0.72, inferredFields = [], priority, source, evidence }) {
  return {
    id: uid("proposal"),
    type: "task",
    action: "create",
    title: shortText(title, 56),
    description,
    owner,
    start,
    due,
    parentId,
    parentTitle,
    dependencies,
    acceptanceCriteria,
    confidence,
    inferredFields,
    status: "todo",
    priority: priority || "medium",
    source,
    evidence,
    state: "pending",
    createdAt: new Date().toISOString()
  };
}

function isTaskClause(text) {
  return /(负责|需要|完成|推进|跟进|处理|交付|开发|设计|测试|联调|整理|上线|发布|验收|修复|准备|确认)/.test(text);
}

function hasExplicitAction(text) {
  return /(负责|需要|必须|要在|完成|推进|跟进|处理|交付|开发|设计|联调|整理|上线|发布|验收|修复|准备|确认|由|请)/.test(text);
}

function isRiskClause(text) {
  return /(风险|阻塞|卡住|延期|延迟|担心|影响|依赖|不确定|问题|无法|缺少|等待|瓶颈)/.test(text);
}

function isDecisionClause(text) {
  return /(决定|决议|结论|确认|同意|拍板|定下来|会议决定|最终选择)/.test(text);
}

function isMilestoneClause(text) {
  return /(里程碑|关键节点|版本节点|上线节点|发布节点|阶段目标|试点验证)/.test(text);
}

function extractOwner(text) {
  const patterns = [
    /(?:负责人|owner|Owner)[:：]\s*([\u4e00-\u9fa5A-Za-z0-9_-]{2,12})/,
    /([\u4e00-\u9fa5A-Za-z0-9_-]{2,12})\s*(?:负责|继续跟进|跟进|推进|处理|完成|整理|对接)/,
    /@([\u4e00-\u9fa5A-Za-z0-9_-]{2,12})/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeOwnerLabel(match[1]);
  }
  return "";
}

function cleanupPerson(person) {
  return person.replace(/^(由|请|让)/, "").replace(/[，,。；;：:]+$/g, "").trim();
}

function normalizeOwnerLabel(person) {
  const clean = cleanupPerson(String(person || ""));
  if (!clean || clean.length > 16) return "";
  if (/(此外|还需要|需要|完成|准备|工作|任务|项目|截止|未设置|没有)/.test(clean)) return "";
  return clean;
}

function normalizeDue(text) {
  const now = new Date();
  const full = text.match(/(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})[日号]?/);
  if (full) return toDateValue(Number(full[1]), Number(full[2]), Number(full[3]));

  const monthDay = text.match(/(\d{1,2})月(\d{1,2})[日号]?/);
  if (monthDay) {
    const month = Number(monthDay[1]);
    const day = Number(monthDay[2]);
    let year = now.getFullYear();
    const candidate = new Date(year, month - 1, day);
    if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2)) year += 1;
    return toDateValue(year, month, day);
  }

  if (/今天/.test(text)) return addDays(0);
  if (/明天/.test(text)) return addDays(1);
  if (/后天/.test(text)) return addDays(2);
  if (/本周五|周五/.test(text)) return nextWeekday(5, /下周五/.test(text));
  if (/本周四|周四/.test(text)) return nextWeekday(4, /下周四/.test(text));
  if (/本周三|周三/.test(text)) return nextWeekday(3, /下周三/.test(text));
  if (/本周二|周二/.test(text)) return nextWeekday(2, /下周二/.test(text));
  if (/本周一|周一/.test(text)) return nextWeekday(1, /下周一/.test(text));
  if (/下周/.test(text)) return addDays(7);
  if (/月底/.test(text)) return toDateValue(now.getFullYear(), now.getMonth() + 1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate());
  return "";
}

function extractDependencies(text) {
  const match = String(text || "").match(/(?:依赖|等待|前置|需要先)([^，。；;]+)/);
  if (!match?.[1]) return [];
  return match[1]
    .replace(/才能|之后|完成后|再.+$/g, "")
    .split(/、|,|，|和|及|与/)
    .map((item) => cleanTaskTitle(item))
    .filter((item) => item.length >= 2)
    .slice(0, 4);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateValue(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function nextWeekday(target, forceNextWeek = false) {
  const date = new Date();
  const current = date.getDay() || 7;
  let diff = target - current;
  if (diff < 0 || forceNextWeek) diff += 7;
  date.setDate(date.getDate() + diff);
  return toDateValue(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function toDateValue(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function inferStatus(text) {
  if (/(已完成|完成了|已经完成|结束|搞定|验收通过)/.test(text)) return "done";
  if (/(阻塞|卡住|无法|等待|依赖|暂停)/.test(text)) return "blocked";
  if (/(进行中|正在|继续|推进|联调中|开发中|测试中)/.test(text)) return "doing";
  return "";
}

function inferPriority(text) {
  if (/(紧急|高优|关键|必须|今天|明天|阻塞|卡住|风险)/.test(text)) return "high";
  if (/(下周|本周|需要|影响)/.test(text)) return "medium";
  return "medium";
}

function inferSeverity(text) {
  if (/(严重|阻塞|无法|影响上线|高风险|延期|卡住)/.test(text)) return "high";
  if (/(担心|可能|依赖|不确定|等待)/.test(text)) return "medium";
  return "low";
}

function cleanTaskTitle(text) {
  return text
    .replace(/^(今天|明天|本周|下周|会议确认|站会确认|纪要)[:：,\s]*/g, "")
    .replace(/需要在.*?(前|之前)/, "需要")
    .trim()
    .slice(0, 56);
}

function cleanRiskTitle(text) {
  return text
    .replace(/^(风险|问题|阻塞)[:：,\s]*/g, "")
    .replace(/大家|我们|团队/g, "")
    .trim()
    .slice(0, 56);
}

function cleanDecisionTitle(text) {
  return text
    .replace(/^(会议)?(决定|决议|结论|确认)[:：,\s]*/g, "")
    .trim()
    .slice(0, 56);
}

function cleanMilestoneTitle(text) {
  return text
    .replace(/^(里程碑|关键节点|版本节点|上线节点|发布节点|阶段目标)[:：,\s]*/g, "")
    .trim()
    .slice(0, 56);
}

function findLikelyTask(text) {
  const words = keywordSet(text);
  let best = null;
  let bestScore = 0;
  state.tasks.forEach((task) => {
    const taskWords = keywordSet(`${task.title} ${task.description}`);
    const score = [...words].filter((word) => taskWords.has(word)).length;
    if (score > bestScore) {
      best = task;
      bestScore = score;
    }
  });
  return bestScore >= 2 ? best : null;
}

function findTaskByTitle(title) {
  const exact = state.tasks.find((task) => task.id === title || task.title === title);
  if (exact) return exact;
  return findLikelyTask(title);
}

function keywordSet(text) {
  const generic = new Set(["负责", "需要", "完成", "继续", "推进", "跟进", "确认", "当前", "已经", "可以", "进入"]);
  const matches = String(text).match(/[\u4e00-\u9fa5A-Za-z0-9]{2,}/g) || [];
  return new Set(matches.filter((word) => !generic.has(word)).slice(0, 14));
}

function mergeSimilarProposals(proposals) {
  const seen = new Set();
  return proposals.filter((proposal) => {
    const key = `${proposal.type}:${proposal.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function answerQuestion(question) {
  const text = question.toLowerCase();
  const blocked = state.tasks.filter((task) => task.status === "blocked");
  const dueSoon = state.tasks.filter((task) => task.status !== "done" && daysUntil(task.due) >= 0 && daysUntil(task.due) <= 7);
  const overdue = state.tasks.filter((task) => task.status !== "done" && daysUntil(task.due) < 0);
  const openRisks = state.risks.filter((risk) => risk.status !== "closed");

  if (/风险|risk|卡|阻塞|问题/.test(text)) {
    if (!openRisks.length && !blocked.length) return "当前没有开放风险或阻塞任务。建议继续输入最新会议纪要，保持项目记忆更新。";
    return `当前主要风险和阻塞：\n${openRisks
      .slice(0, 4)
      .map((risk) => `- ${risk.title}：${risk.impact || "需要补充影响说明"}`)
      .join("\n")}${blocked.length ? `\n- 阻塞任务：${blocked.map((task) => task.title).join("、")}` : ""}`;
  }

  if (/谁|负责人|owner|待办|任务/.test(text)) {
    const tasks = state.tasks.filter((task) => task.status !== "done").slice(0, 8);
    return tasks.length
      ? `当前待推进任务：\n${tasks.map((task) => `- ${task.title}，负责人：${task.owner || "待确认"}，截止：${formatDate(task.due)}`).join("\n")}`
      : "当前没有待推进任务。";
  }

  if (/周报|汇报|状态|进展|summary/.test(text)) {
    return generateReport(/管理层|老板|领导|executive/.test(text) ? "executive" : /风险/.test(text) ? "risk" : "weekly");
  }

  return `我可以回答项目状态、风险、负责人、待办和周报。当前项目健康度 ${computeHealth()}，开放风险 ${openRisks.length} 个，待确认 AI 变更 ${state.proposals.filter((proposal) => proposal.state === "pending").length} 条。`;
}

function approveProposal(id) {
  const proposal = state.proposals.find((item) => item.id === id);
  if (!proposal || proposal.state === "approved") return;

  const now = new Date().toISOString();
  if (proposal.type === "task") {
    const parentId = resolveParentTaskForProposal(proposal, now);
    const task = {
      id: uid("task"),
      title: proposal.title,
      description: proposal.description || proposal.evidence || "",
      owner: proposal.owner || "",
      start: proposal.start || "",
      due: proposal.due || "",
      status: proposal.status || "todo",
      priority: proposal.priority || "medium",
      parentId,
      parentTitle: proposal.parentTitle || "",
      dependencies: normalizeDependencyList(proposal.dependencies),
      acceptanceCriteria: proposal.acceptanceCriteria || "",
      confidence: normalizeConfidence(proposal.confidence),
      inferredFields: Array.isArray(proposal.inferredFields) ? proposal.inferredFields : [],
      source: proposal.source,
      createdAt: now,
      updatedAt: now
    };
    state.tasks.unshift(task);
    addMemory("task", `新增任务：${task.title}`, task.description, proposal.source);
  }

  if (proposal.type === "update") {
    const task = state.tasks.find((item) => item.id === proposal.targetId) || findLikelyTask(proposal.evidence || proposal.title);
    if (task) {
      task.status = proposal.status || task.status;
      task.owner = proposal.owner || task.owner;
      task.start = proposal.start || task.start;
      task.due = proposal.due || task.due;
      task.acceptanceCriteria = proposal.acceptanceCriteria || task.acceptanceCriteria;
      task.updatedAt = now;
      addMemory("update", `更新任务：${task.title}`, proposal.description || proposal.evidence || "状态已更新", proposal.source);
    } else {
      addMemory("update", proposal.title, proposal.description || proposal.evidence || "", proposal.source);
    }
  }

  if (proposal.type === "risk") {
    const risk = {
      id: uid("risk"),
      title: proposal.title,
      impact: proposal.impact || proposal.description || proposal.evidence || "",
      owner: proposal.owner || "",
      severity: proposal.severity || "medium",
      status: "open",
      source: proposal.source,
      createdAt: now,
      updatedAt: now
    };
    state.risks.unshift(risk);
    addMemory("risk", `新增风险：${risk.title}`, risk.impact, proposal.source);
  }

  if (proposal.type === "decision") {
    const decision = {
      id: uid("decision"),
      title: proposal.title,
      detail: proposal.detail || proposal.description || proposal.evidence || "",
      source: proposal.source,
      createdAt: now
    };
    state.decisions.unshift(decision);
    addMemory("decision", `新增决策：${decision.title}`, decision.detail, proposal.source);
  }

  if (proposal.type === "milestone") {
    const milestone = {
      id: uid("milestone"),
      title: proposal.title,
      description: proposal.description || proposal.evidence || "",
      owner: proposal.owner || "",
      due: proposal.due || "",
      status: proposal.status || "todo",
      source: proposal.source,
      createdAt: now,
      updatedAt: now
    };
    state.milestones.unshift(milestone);
    addMemory("milestone", `新增里程碑：${milestone.title}`, milestone.description, proposal.source);
  }

  if (proposal.type === "question") {
    addMemory("question", proposal.title, proposal.description || "", proposal.source);
  }

  proposal.state = "approved";
  proposal.approvedAt = now;
  recordAudit("approve", `确认候选变更：${proposal.title}`, proposal.description || proposal.evidence || "");
  saveState();
  showToast("已确认并更新项目。");
  render();
}

function resolveParentTaskForProposal(proposal, now) {
  if (proposal.parentId && state.tasks.some((task) => task.id === proposal.parentId)) return proposal.parentId;
  const title = shortText(proposal.parentTitle || "", 56);
  if (!title) return "";
  const existing = state.tasks.find((task) => task.title === title || task.id === proposal.parentId);
  if (existing) return existing.id;
  const parent = normalizeTaskRecord({
    id: uid("task"),
    title,
    description: `由 AI 根据语言输入识别的工作包，子任务完成后自动汇总进度。`,
    owner: proposal.owner || "",
    start: proposal.start || "",
    due: proposal.due || "",
    status: "todo",
    priority: proposal.priority || "medium",
    isWorkPackage: true,
    acceptanceCriteria: "所有子任务完成并通过验收，工作包视为完成。",
    confidence: proposal.confidence || 0.72,
    inferredFields: proposal.inferredFields || [],
    source: proposal.source || "AI 拆解",
    createdAt: now,
    updatedAt: now
  });
  state.tasks.unshift(parent);
  return parent.id;
}

function addMemory(type, title, detail, source) {
  state.memory.unshift({
    id: uid("memory"),
    type,
    title,
    detail,
    source: source || "项目更新",
    createdAt: new Date().toISOString()
  });
  state.memory = state.memory.slice(0, 120);
}

function currentActor() {
  return currentUser ? identityDisplayName(currentUser) : "本地未登录用户";
}

function identityDisplayName(user = currentUser) {
  return user?.realName || user?.name || user?.nickname || "未命名用户";
}

function identityStatusText(user = currentUser) {
  if (!user) return "未登录";
  const provider = user.providerLabel || providerLabel(user.provider);
  const status = user.verified ? "已核验" : "待实名补全";
  return `${identityDisplayName(user)}｜${provider}｜${status}${user.org ? `｜${user.org}` : ""}`;
}

function providerLabel(provider) {
  return { wechat: "微信", wecom: "企业微信", dev: "开发模式" }[provider] || provider || "本地身份";
}

function recordAudit(action, title, detail = "") {
  state.audit ||= [];
  state.audit.unshift({
    id: uid("audit"),
    action,
    title,
    detail,
    actor: currentActor(),
    actorId: currentUser?.id || "",
    projectId: state.project?.id || state.activeProjectId || "",
    projectName: state.project?.name || "未命名项目",
    createdAt: new Date().toISOString()
  });
  state.audit = state.audit.slice(0, 300);
}

function exportAuditLog() {
  const rows = [["时间", "操作者", "项目", "动作", "标题", "详情"]];
  [...(state.audit || [])]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .forEach((item) => {
      rows.push([formatDateTime(item.createdAt), item.actor || "", item.projectName || "", auditActionLabel(item.action), item.title || "", item.detail || ""]);
    });
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `yanpm-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  recordAudit("export", "导出审计日志", `${rows.length - 1} 条记录`);
  saveState();
  showToast("审计日志已导出。");
  render();
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function rejectProposal(id) {
  const proposal = state.proposals.find((item) => item.id === id);
  if (!proposal) return;
  proposal.state = "rejected";
  proposal.rejectedAt = new Date().toISOString();
  recordAudit("reject", `忽略候选变更：${proposal.title}`, proposal.description || proposal.evidence || "");
  saveState();
  showToast("已忽略该候选变更。");
  render();
}

function mergeProposalIntoExisting(id) {
  const proposal = state.proposals.find((item) => item.id === id);
  if (!proposal) return;
  const target =
    proposal.type === "task"
      ? findLikelyTask(`${proposal.title} ${proposal.description} ${proposal.evidence}`)
      : proposal.type === "risk"
        ? state.risks.find((risk) => keywordOverlap(risk.title, proposal.title) >= 2)
        : proposal.type === "milestone"
          ? state.milestones.find((milestone) => keywordOverlap(milestone.title, proposal.title) >= 2)
          : null;
  if (!target) {
    showToast("暂未找到可合并的已有记录。");
    return;
  }
  target.owner = proposal.owner || target.owner;
  target.start = proposal.start || target.start;
  target.due = proposal.due || target.due;
  if (proposal.type === "risk") target.impact = proposal.impact || proposal.description || target.impact;
  else target.description = proposal.description || target.description;
  target.acceptanceCriteria = proposal.acceptanceCriteria || target.acceptanceCriteria;
  target.updatedAt = new Date().toISOString();
  proposal.state = "approved";
  proposal.approvedAt = new Date().toISOString();
  addMemory("update", `合并候选变更：${target.title}`, proposal.description || proposal.evidence || "", proposal.source);
  recordAudit("merge", `合并候选变更：${target.title}`, proposal.description || proposal.evidence || "");
  saveState();
  showToast("已合并到已有记录。");
  render();
}

function keywordOverlap(a, b) {
  const left = keywordSet(a);
  const right = keywordSet(b);
  return [...left].filter((word) => right.has(word)).length;
}

function approveAll() {
  const pending = state.proposals.filter((proposal) => proposal.state === "pending");
  if (!pending.length) {
    showToast("没有待确认变更。");
    return;
  }
  pending.forEach((proposal) => approveProposal(proposal.id));
  showToast(`已确认 ${pending.length} 条变更。`);
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 2300);
}

function switchProject(id, options = {}) {
  if (!id || id === state.activeProjectId) return;
  syncActiveProject();
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  applyProjectToState(state, project);
  taskFilter = "all";
  if (!options.silent) recordAudit("switch", `切换项目：${state.project.name}`, "从项目组合或项目选择器进入。");
  saveState();
  if (!options.silent) showToast(`已切换到：${state.project.name}`);
  render();
}

function createBlankProjectRecord(name, phase = "启动") {
  const now = new Date().toISOString();
  const id = uid("project");
  return normalizeProjectRecord(
    {
      id,
      archived: false,
      createdAt: now,
      project: { id, name, phase, updatedAt: now },
      members: clone(state.members || []),
      milestones: [],
      tasks: [],
      risks: [],
      decisions: [],
      memory: [
        {
          id: uid("memory"),
          type: "update",
          title: "创建项目",
          detail: `${name} 已加入项目组合。`,
          source: "项目组合",
          createdAt: now
        }
      ],
      audit: [
        {
          id: uid("audit"),
          action: "create",
          title: "创建空白项目",
          actor: currentActor(),
          projectId: id,
          projectName: name,
          detail: `${name} 已加入项目组合。`,
          createdAt: now
        }
      ],
      proposals: [],
      chat: [
        {
          id: uid("msg"),
          role: "ai",
          content: "这是一个新的项目空间。粘贴会议纪要、聊天记录或日报，我会开始维护这个项目的任务、风险、决策和记忆。",
          createdAt: now
        }
      ]
    },
    seedState()
  );
}

function createProject(name, phase) {
  syncActiveProject();
  const project = createBlankProjectRecord(name || "未命名项目", phase || "启动");
  state.projects.unshift(project);
  applyProjectToState(state, project);
  saveState();
  setActiveView("dashboard");
  showToast("新项目已创建。");
}

function startProjectWizard() {
  projectWizard = {
    step: 0,
    answers: {},
    templateId: "software"
  };
  renderProjectWizard();
  $("#projectWizardDialog").showModal();
}

function closeProjectWizard() {
  $("#projectWizardDialog").close();
  projectWizard = null;
}

function renderProjectWizard() {
  if (!projectWizard) return;
  const question = projectWizardQuestions[projectWizard.step];
  const progress = Math.round(((projectWizard.step + 1) / projectWizardQuestions.length) * 100);
  $("#wizardStepLabel").textContent = `第 ${projectWizard.step + 1} / ${projectWizardQuestions.length} 步`;
  $("#wizardQuestion").textContent = question.question;
  $("#wizardHelp").textContent = question.help;
  renderProjectTemplateSelect();
  $("#wizardAnswer").placeholder = question.placeholder;
  $("#wizardAnswer").value = projectWizard.answers[question.key] || "";
  $("#wizardProgressBar").style.width = `${progress}%`;
  $("#wizardBackBtn").disabled = projectWizard.step === 0;
  $("#wizardNextBtn").disabled = false;
  $("#wizardNextBtn").textContent = projectWizard.step === projectWizardQuestions.length - 1 ? "生成项目" : "下一步";
  $("#wizardSuggestions").innerHTML = question.suggestions
    .map((text) => `<button class="tiny-button" data-suggestion="${escapeHtml(text)}" type="button">${escapeHtml(text)}</button>`)
    .join("");
  $("#wizardPreview").innerHTML = renderFrameworkPreview(buildProjectFramework(projectWizard.answers));
  renderIcons($("#projectWizardDialog"));
}

function renderProjectTemplateSelect() {
  const select = $("#projectTemplateSelect");
  if (!select || !projectWizard) return;
  select.innerHTML = projectTemplates.map((template) => `<option value="${template.id}" ${projectWizard.templateId === template.id ? "selected" : ""}>${escapeHtml(template.label)}</option>`).join("");
}

function applyProjectTemplate(templateId) {
  if (!projectWizard) return;
  const template = projectTemplates.find((item) => item.id === templateId) || projectTemplates[0];
  projectWizard.templateId = template.id;
  projectWizard.answers.scope ||= template.scope;
  projectWizard.answers.team ||= template.members;
  projectWizard.answers.success ||= template.success;
  renderProjectWizard();
  showToast(`已套用${template.label}模板。`);
}

function saveWizardAnswer() {
  if (!projectWizard) return;
  const question = projectWizardQuestions[projectWizard.step];
  projectWizard.answers[question.key] = $("#wizardAnswer").value.trim();
}

async function wizardNext(skip = false) {
  if (!projectWizard) return;
  if (!skip) saveWizardAnswer();
  if (projectWizard.step < projectWizardQuestions.length - 1) {
    projectWizard.step += 1;
    renderProjectWizard();
    return;
  }
  $("#wizardNextBtn").disabled = true;
  $("#wizardNextBtn").textContent = "生成中";
  $("#wizardHelp").textContent = aiConfig.mode === "mock" ? "正在用本地模拟生成项目框架。" : `正在调用 AI 生成项目框架，最多等待 ${AI_TIMEOUT_MS / 1000} 秒。`;
  const answers = { ...projectWizard.answers };
  try {
    const framework = await frameworkWithRuntime(answers);
    createProjectFromFramework(framework);
    closeProjectWizard();
  } catch (error) {
    showToast(`生成失败：${error.message}`);
    if (projectWizard) {
      $("#wizardNextBtn").disabled = false;
      $("#wizardNextBtn").textContent = "生成项目";
      $("#wizardHelp").textContent = "生成时遇到问题。你可以重试，或在 AI 设置里切回本地模拟模式。";
    }
  }
}

function wizardBack() {
  if (!projectWizard || projectWizard.step === 0) return;
  saveWizardAnswer();
  projectWizard.step -= 1;
  renderProjectWizard();
}

function buildProjectFramework(answers) {
  const now = new Date().toISOString();
  const template = projectTemplates.find((item) => item.id === projectWizard?.templateId) || null;
  const name = cleanProjectName(answers.name) || inferProjectName(answers.goal) || "未命名项目";
  const goal = answers.goal || "通过项目执行达成预期业务目标。";
  const phase = template?.phase || (/上线|交付|验收/.test(goal) ? "交付规划" : "启动规划");
  const members = buildFrameworkMembers(answers.team || template?.members);
  const owner = members[0]?.name || "项目负责人";
  const dates = extractDateValues(`${answers.deadline || ""} ${answers.goal || ""}`);
  const firstDue = dates[0] || addDays(7);
  const secondDue = dates[1] || addDays(14);
  const finalDue = dates[dates.length - 1] || addDays(30);
  const scope = answers.scope || template?.scope || "先完成项目核心闭环，再根据反馈扩展范围。";
  const risks = buildFrameworkRisks(answers.risks, owner, now);
  const milestones = [
    {
      id: uid("milestone"),
      title: "项目范围与方案确认",
      due: firstDue,
      status: "todo",
      owner,
      description: `确认目标、范围、交付物和验收方式。目标：${goal}`,
      createdAt: now,
      updatedAt: now
    },
    {
      id: uid("milestone"),
      title: "核心交付物完成",
      due: secondDue,
      status: "todo",
      owner: pickMember(members, "技术") || owner,
      description: `完成第一阶段必须交付的内容：${scope}`,
      createdAt: now,
      updatedAt: now
    },
    {
      id: uid("milestone"),
      title: "验收与复盘",
      due: finalDue,
      status: "todo",
      owner: pickMember(members, "测试") || pickMember(members, "用户") || owner,
      description: answers.success || "完成验收，形成复盘结论和下一阶段计划。",
      createdAt: now,
      updatedAt: now
    }
  ];

  const tasks = [
    buildFrameworkTask("补齐项目章程", `明确项目目标、范围、成功标准和关键干系人。目标：${goal}`, owner, addDays(2), "high", now),
    buildFrameworkTask("确认第一阶段范围", scope, owner, firstDue, "high", now),
    buildFrameworkTask("拆解核心交付任务", "把核心交付物拆成可追踪任务，并确认每项负责人和截止时间。", pickMember(members, "技术") || owner, firstDue, "high", now),
    buildFrameworkTask("建立周会与进度同步节奏", "确定会议节奏、纪要输入方式、待确认变更处理人和风险升级机制。", owner, addDays(3), "medium", now),
    buildFrameworkTask("准备验收材料和反馈清单", answers.success || "整理验收标准、试点反馈问题和复盘模板。", pickMember(members, "测试") || pickMember(members, "用户") || owner, finalDue, "medium", now)
  ];

  const decisions = [
    {
      id: uid("decision"),
      title: "采用 AI 建项向导生成初始项目框架",
      detail: "项目目标、里程碑、任务、风险和记忆由问答信息自动生成，后续通过会议纪要持续更新。",
      source: "AI 建项向导",
      createdAt: now
    },
    {
      id: uid("decision"),
      title: "第一阶段范围",
      detail: scope,
      source: "AI 建项向导",
      createdAt: now
    }
  ];

  const memory = [
    {
      id: uid("memory"),
      type: "update",
      title: "AI 完成立项访谈",
      detail: projectWizardQuestions
        .map((item) => `${item.question} ${answers[item.key] || "未填写"}`)
        .join("\n"),
      source: "AI 建项向导",
      createdAt: now
    },
    {
      id: uid("memory"),
      type: "decision",
      title: "生成项目管理框架",
      detail: `已生成 ${milestones.length} 个里程碑、${tasks.length} 个初始任务、${risks.length} 个风险和 ${members.length} 个成员。`,
      source: "AI 建项向导",
      createdAt: now
    }
  ];

  return {
    name,
    phase,
    goal,
    scope,
    members,
    milestones,
    tasks,
    risks,
    decisions,
    memory,
    chat: [
      {
        id: uid("msg"),
        role: "ai",
        content: `我已经根据立项问答生成了项目框架。下一步建议先确认“${tasks[0].title}”，再输入第一次会议纪要来更新项目状态。`,
        createdAt: now
      }
    ]
  };
}

function createProjectFromFramework(framework) {
  const now = new Date().toISOString();
  const id = uid("project");
  syncActiveProject();
  const project = normalizeProjectRecord(
    {
      id,
      archived: false,
      createdAt: now,
      project: { id, name: framework.name, phase: framework.phase, updatedAt: now },
      members: framework.members,
      milestones: framework.milestones,
      tasks: framework.tasks,
      risks: framework.risks,
      decisions: framework.decisions,
      memory: framework.memory,
      audit: [
        {
          id: uid("audit"),
          action: "create",
          title: "AI 建项创建项目",
          actor: currentActor(),
          projectId: id,
          projectName: framework.name,
          detail: `生成 ${framework.tasks?.length || 0} 个任务、${framework.risks?.length || 0} 个风险。`,
          createdAt: now
        }
      ],
      proposals: [],
      chat: framework.chat
    },
    seedState()
  );
  state.projects.unshift(project);
  applyProjectToState(state, project);
  saveState();
  setActiveView("dashboard");
  showToast("AI 已生成项目管理框架。");
}

function renderFrameworkPreview(framework) {
  return `<div class="framework-preview">
    <article class="evidence-item">
      <strong>${escapeHtml(framework.name)}</strong>
      <p>${escapeHtml(framework.goal)}</p>
    </article>
    <article class="evidence-item">
      <strong>里程碑</strong>
      <p>${framework.milestones.map((item) => `${item.title} ${formatDate(item.due)}`).join("；")}</p>
    </article>
    <article class="evidence-item">
      <strong>初始任务</strong>
      <p>${framework.tasks.map((item) => item.title).join("；")}</p>
    </article>
    <article class="evidence-item">
      <strong>风险</strong>
      <p>${framework.risks.map((item) => item.title).join("；")}</p>
    </article>
  </div>`;
}

function cleanProjectName(value) {
  return String(value || "")
    .replace(/项目(叫|名称是|名字是)?[:：]*/g, "")
    .trim()
    .slice(0, 32);
}

function inferProjectName(goal) {
  const text = String(goal || "").trim();
  if (!text) return "";
  const match = text.match(/(?:完成|交付|上线|验证|建设|开发)([\u4e00-\u9fa5A-Za-z0-9 ]{2,18})/);
  return match?.[1] ? `${match[1].trim()}项目` : `${text.slice(0, 14)}项目`;
}

function buildFrameworkMembers(teamText) {
  const text = String(teamText || "").trim();
  const names = [];
  const roleHints = [
    ["产品", "产品负责人", "目标、范围、需求确认"],
    ["设计", "体验设计", "流程、原型、可用性"],
    ["技术", "技术负责人", "方案、开发、集成"],
    ["研发", "研发负责人", "方案、开发、集成"],
    ["测试", "测试负责人", "验收、质量、缺陷跟踪"],
    ["客户", "客户接口人", "反馈、验收、外部协调"],
    ["项目经理", "项目经理", "节奏、风险、资源协调"]
  ];

  const explicit = text.match(/[\u4e00-\u9fa5A-Za-z0-9_-]{2,12}(?=负责|：|:)/g) || [];
  explicit.forEach((name) => names.push({ name: cleanupPerson(name), role: "项目成员", focus: "根据立项问答补充职责。" }));
  roleHints.forEach(([keyword, role, focus]) => {
    if (text.includes(keyword) && !names.some((item) => item.role === role)) {
      names.push({ name: role, role, focus });
    }
  });

  if (!names.length) {
    names.push(
      { name: "项目负责人", role: "项目经理", focus: "节奏、风险、资源协调" },
      { name: "业务负责人", role: "业务验收", focus: "目标、范围、验收标准" },
      { name: "技术负责人", role: "技术交付", focus: "方案、开发、集成" }
    );
  }

  return names.slice(0, 8).map((member) => ({
    id: uid("member"),
    name: member.name,
    role: member.role,
    focus: member.focus
  }));
}

function pickMember(members, keyword) {
  return members.find((member) => member.name.includes(keyword) || member.role.includes(keyword) || member.focus.includes(keyword))?.name || "";
}

function extractDateValues(text) {
  const source = String(text || "");
  const values = [];
  const now = new Date();
  const fullPattern = /(20\d{2})[年\-/.](\d{1,2})[月\-/.](\d{1,2})[日号]?/g;
  const monthDayPattern = /(\d{1,2})月(\d{1,2})[日号]?/g;
  const monthEndPattern = /(\d{1,2})月底/g;
  let match;

  while ((match = fullPattern.exec(source))) {
    values.push(toDateValue(Number(match[1]), Number(match[2]), Number(match[3])));
  }
  while ((match = monthDayPattern.exec(source))) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = now.getFullYear();
    const candidate = new Date(year, month - 1, day);
    if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2)) year += 1;
    values.push(toDateValue(year, month, day));
  }
  while ((match = monthEndPattern.exec(source))) {
    const month = Number(match[1]);
    let year = now.getFullYear();
    const day = new Date(year, month, 0).getDate();
    const candidate = new Date(year, month - 1, day);
    if (candidate < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2)) year += 1;
    values.push(toDateValue(year, month, new Date(year, month, 0).getDate()));
  }
  if (/月底/.test(source) && !/\d{1,2}月底/.test(source)) {
    values.push(toDateValue(now.getFullYear(), now.getMonth() + 1, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()));
  }

  splitClauses(source)
    .map((part) => normalizeDue(part))
    .filter(Boolean)
    .forEach((value) => values.push(value));
  return [...new Set(values)].sort();
}

function buildFrameworkTask(title, description, owner, due, priority, now) {
  return {
    id: uid("task"),
    title,
    description,
    owner,
    start: formatInputDate(now),
    due,
    status: "todo",
    priority,
    parentId: "",
    dependencies: [],
    acceptanceCriteria: inferAcceptanceCriteria(title),
    confidence: 0.86,
    inferredFields: [],
    source: "AI 建项向导",
    createdAt: now,
    updatedAt: now
  };
}

function buildFrameworkRisks(riskText, owner, now) {
  const clauses = splitClauses(riskText || "")
    .map((item) => item.trim())
    .filter(Boolean);
  const risks = clauses.length
    ? clauses.slice(0, 4).map((item) => ({
        id: uid("risk"),
        title: cleanRiskTitle(item),
        impact: item,
        owner,
        severity: inferSeverity(item),
        status: "open",
        source: "AI 建项向导",
        createdAt: now,
        updatedAt: now
      }))
    : [
        {
          id: uid("risk"),
          title: "项目范围可能扩大",
          impact: "如果第一阶段范围持续增加，可能影响交付节奏和验收质量。",
          owner,
          severity: "medium",
          status: "open",
          source: "AI 建项向导",
          createdAt: now,
          updatedAt: now
        },
        {
          id: uid("risk"),
          title: "关键负责人信息不足",
          impact: "如果任务负责人和截止时间不明确，后续自动跟踪会变弱。",
          owner,
          severity: "medium",
          status: "open",
          source: "AI 建项向导",
          createdAt: now,
          updatedAt: now
        }
      ];
  return risks;
}

function duplicateProject(id = state.activeProjectId) {
  syncActiveProject();
  const source = state.projects.find((project) => project.id === id);
  if (!source) return;
  const copy = clone(source);
  const newId = uid("project");
  copy.id = newId;
  copy.archived = false;
  copy.createdAt = new Date().toISOString();
  copy.project.id = newId;
  copy.project.name = `${copy.project.name} 副本`;
  copy.project.updatedAt = new Date().toISOString();
  copy.memory = [
    {
      id: uid("memory"),
      type: "update",
      title: "复制项目",
      detail: `从 ${source.project.name} 复制而来。`,
      source: "项目组合",
      createdAt: new Date().toISOString()
    },
    ...(copy.memory || [])
  ];
  copy.audit = [
    {
      id: uid("audit"),
      action: "create",
      title: "复制项目",
      actor: currentActor(),
      projectId: newId,
      projectName: copy.project.name,
      detail: `从 ${source.project.name} 复制而来。`,
      createdAt: new Date().toISOString()
    },
    ...(copy.audit || [])
  ];
  state.projects.unshift(normalizeProjectRecord(copy, seedState()));
  applyProjectToState(state, state.projects[0]);
  saveState();
  setActiveView("dashboard");
  showToast("已复制并切换到新项目。");
}

function archiveProject(id = state.activeProjectId) {
  syncActiveProject();
  const activeProjects = state.projects.filter((project) => !project.archived);
  if (activeProjects.length <= 1 && activeProjects.some((project) => project.id === id)) {
    showToast("至少保留一个未归档项目。");
    return;
  }
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  const archivedName = project.project.name;
  project.archived = true;
  if (id === state.activeProjectId) {
    const next = state.projects.find((item) => !item.archived);
    if (next) applyProjectToState(state, next);
  }
  recordAudit("archive", `归档项目：${archivedName}`, "项目已从活跃组合中隐藏。");
  saveState();
  showToast("项目已归档。");
  render();
}

function restoreProject(id) {
  const project = state.projects.find((item) => item.id === id);
  if (!project) return;
  syncActiveProject();
  project.archived = false;
  applyProjectToState(state, project);
  recordAudit("restore", `恢复项目：${project.project.name}`, "项目已重新进入活跃组合。");
  saveState();
  setActiveView("dashboard");
  showToast("项目已恢复。");
}

async function copyText(text, message = "已复制。") {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "readonly");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
    showToast(message);
  } catch {
    showToast("复制失败，可以手动选中文本复制。");
  }
}

async function openAuthDialog() {
  await loadAuthRuntimeConfig();
  $("#wechatName").value = currentUser?.name || currentUser?.nickname || "";
  $("#realName").value = currentUser?.realName || "";
  $("#wechatOrg").value = currentUser?.org || "";
  $("#identityContact").value = currentUser?.mobile || currentUser?.email || "";
  $("#logoutBtn").disabled = !currentUser;
  updateAuthDialogStatus();
  $("#authDialog").showModal();
}

function updateAuthDialogStatus() {
  const wechat = authRuntimeConfig.wechat || {};
  const wecom = authRuntimeConfig.wecom || {};
  $("#wechatLoginBtn").disabled = !wechat.enabled;
  $("#wecomLoginBtn").disabled = !wecom.enabled;
  $("#wechatLoginBtn").title = wechat.enabled ? "使用微信开放平台扫码授权" : wechat.reason || "微信开放平台未配置";
  $("#wecomLoginBtn").title = wecom.enabled ? "使用企业微信授权" : wecom.reason || "企业微信未配置";
  const lines = [
    currentUser ? `当前身份：${identityStatusText(currentUser)}` : "当前身份：未登录",
    `微信开放平台：${wechat.enabled ? "已配置" : `未配置（${wechat.reason || "缺少环境变量"}）`}`,
    `企业微信：${wecom.enabled ? "已配置" : `未配置（${wecom.reason || "缺少环境变量"}）`}`,
    authRuntimeConfig.devMode ? "本地开发实名保存：可用" : "本地开发实名保存：已关闭"
  ];
  $("#authStatusText").value = lines.join("\n");
}

function startOAuthLogin(provider) {
  const config = provider === "wecom" ? authRuntimeConfig.wecom : authRuntimeConfig.wechat;
  if (!config?.enabled) {
    showToast(config?.reason || "该登录方式尚未配置。");
    updateAuthDialogStatus();
    return;
  }
  window.location.href = config.startUrl;
}

async function saveAuthFromForm(event) {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const form = new FormData($("#authForm"));
  const name = form.get("name")?.toString().trim() || "微信用户";
  const realName = form.get("realName")?.toString().trim() || "";
  const org = form.get("org")?.toString().trim() || "未设置团队";
  const contact = form.get("contact")?.toString().trim() || "";
  const profile = {
    ...(currentUser || {}),
    id: currentUser?.id || uid("local"),
    provider: currentUser?.provider || "dev",
    providerLabel: currentUser?.providerLabel || "开发模式",
    name,
    realName,
    org,
    email: contact.includes("@") ? contact : currentUser?.email || "",
    mobile: contact && !contact.includes("@") ? contact : currentUser?.mobile || "",
    avatar: currentUser?.avatar || name.slice(0, 1),
    verificationStatus: realName && contact ? "profile_completed" : currentUser?.verificationStatus || "pending_profile",
    verified: Boolean(currentUser?.verified || (realName && contact)),
    loggedInAt: currentUser?.loggedInAt || new Date().toISOString()
  };

  if (backendBridge.available && authRuntimeConfig.devMode && profile.provider === "dev") {
    try {
      const data = await postJson("/api/auth/dev", profile);
      saveAuthUser({ ...profile, ...(data.user || {}) });
    } catch {
      saveAuthUser(profile);
    }
  } else {
    saveAuthUser(profile);
  }
  recordAudit("login", `实名信息更新：${identityDisplayName(currentUser)}`, identityStatusText(currentUser));
  saveState();
  $("#authDialog").close();
  showToast(currentUser?.verified ? "身份信息已保存，可用于审计追踪。" : "身份信息已保存，请补充真实姓名和联系方式完成核验。");
  render();
}

function logoutAuth() {
  const name = currentUser?.name || "微信用户";
  recordAudit("logout", `退出登录：${name}`, "保留本地项目数据和审计记录。");
  saveAuthUser(null);
  saveState();
  $("#authDialog").close();
  showToast("已退出登录。");
  render();
}

function openAiSettings() {
  renderAiProviderOptions();
  syncAiFieldsFromConfig();
  $("#aiSettingsDialog").showModal();
}

function aiRuntimeStatus(config = aiConfig) {
  const preset = getAiProviderPreset(config.provider);
  const backend = backendBridge.available ? "本地后端：已连接，会优先通过后端代理调用 AI 并持久化项目数据。" : "本地后端：未连接，当前使用浏览器本地能力。";
  if (config.mode === "codex-test") {
    return `供应商：${preset.label}\n当前为开发期临时测试模式：通过本地后端调用 Codex CLI，不需要在浏览器里填写 API Key。\n${backendBridge.available ? "Codex 通道：可测试。发布正式版本前应移除此模式。" : "Codex 通道：需要先启动本地服务，并从 http://127.0.0.1:8787 打开应用。"}\n${backend}`;
  }
  if (config.mode === "mock") {
    return `供应商：${preset.label}\n当前为本地模拟模式：不调用外部 API，适合演示流程，但智能程度有限。\n${backend}`;
  }
  return `供应商：${preset.label}\n当前会调用 ${config.mode === "openai-responses" ? "Responses API" : "Chat Completions API"}。\nBase URL：${config.baseUrl || "未填写"}\n模型：${config.model || "未填写"}\nAPI Key：${config.apiKey ? "已填写" : backendBridge.available ? "未填写，将尝试使用后端环境变量" : "未填写"}\n请求超时：${AI_TIMEOUT_MS / 1000} 秒\n${backend}`;
}

function renderAiProviderOptions() {
  const select = $("#aiProvider");
  if (!select) return;
  select.innerHTML = AI_PROVIDER_PRESETS.map((preset) => `<option value="${preset.id}">${escapeHtml(preset.label)}</option>`).join("");
}

function syncAiFieldsFromConfig() {
  const preset = getAiProviderPreset(aiConfig.provider);
  $("#aiProvider").value = preset.id;
  $("#aiMode").value = aiConfig.mode;
  $("#aiBaseUrl").value = aiConfig.baseUrl;
  $("#aiModel").value = aiConfig.model;
  $("#aiApiKey").value = aiConfig.apiKey || "";
  $("#aiProviderHint").value = preset.hint;
  $("#aiStatus").value = aiRuntimeStatus();
}

function applyAiProviderPreset(providerId) {
  const preset = getAiProviderPreset(providerId);

  if (preset.id === "codex") {
    $("#aiMode").value = "codex-test";
    $("#aiBaseUrl").value = "";
    $("#aiModel").value = preset.model;
    $("#aiApiKey").value = "";
  } else if (preset.id === "custom") {
    if ($("#aiMode").value === "mock") $("#aiMode").value = "openai-chat";
  } else {
    $("#aiMode").value = preset.mode;
    $("#aiBaseUrl").value = preset.baseUrl;
    $("#aiModel").value = preset.model;
  }

  $("#aiProvider").value = preset.id;
  $("#aiProviderHint").value = preset.hint;
  $("#aiStatus").value = aiRuntimeStatus(
    normalizeAiConfig({
      provider: preset.id,
      mode: $("#aiMode").value,
      baseUrl: $("#aiBaseUrl").value,
      model: $("#aiModel").value,
      apiKey: $("#aiApiKey").value
    })
  );
}

function saveAiSettingsFromForm() {
  const provider = $("#aiProvider").value || "custom";
  const preset = getAiProviderPreset(provider);
  const mode = provider === "codex" ? "codex-test" : $("#aiMode").value;
  const baseUrl = $("#aiBaseUrl").value.trim().replace(/\/+$/, "") || (["mock", "codex-test"].includes(mode) ? "" : preset.baseUrl);
  const model = mode === "codex-test" ? "codex-cli" : $("#aiModel").value.trim() || preset.model || (provider === "custom" && mode !== "mock" ? "chat-latest" : "");
  aiConfig = {
    provider: mode === "codex-test" ? "codex" : provider,
    mode,
    baseUrl,
    model,
    apiKey: mode === "codex-test" ? "" : $("#aiApiKey").value.trim()
  };
  aiConfig = normalizeAiConfig(aiConfig);
  saveAiConfig();
  syncAiFieldsFromConfig();
  $("#aiStatus").value = aiRuntimeStatus();
  showToast(aiConfig.mode === "mock" ? "已切换为本地模拟模式。" : aiConfig.mode === "codex-test" ? "已切换为 Codex 临时测试模式。" : "AI 设置已保存。");
}

async function testAiConnection() {
  saveAiSettingsFromForm();
  if (aiConfig.mode === "mock") {
    $("#aiStatus").value = "本地模拟模式可用。你可以直接体验提取、问答和建项流程。";
    return;
  }
  if (aiConfig.mode === "codex-test" && !backendBridge.available) {
    $("#aiStatus").value = "Codex 临时测试需要本地后端。请在项目目录运行 npm start，然后打开 http://127.0.0.1:8787。";
    return;
  }
  $("#testAiBtn").disabled = true;
  $("#aiStatus").value = "正在测试 AI 连接...";
  try {
    const text = await callAiText({
      purpose: "connection-test",
      instruction: "你是连接测试助手。请只回复：连接成功。",
      user: "请回复连接成功。",
      context: {},
      maxTokens: AI_CONNECTION_TEST_MAX_TOKENS
    });
    $("#aiStatus").value = `连接成功。\n模型返回：${text || "已收到响应"}`;
  } catch (error) {
    $("#aiStatus").value = `连接失败：${error.message}\n\n如果在浏览器里调用外部 API 被拦截，通常是 CORS 或网络策略问题。可以改用允许浏览器请求的代理服务，或部署一个后端转发接口作为 Base URL。`;
  } finally {
    $("#testAiBtn").disabled = false;
  }
}

async function runAiOutputTest() {
  saveAiSettingsFromForm();
  const prompt = $("#aiTestPrompt").value.trim() || "请生成一段项目状态摘要。";
  $("#runAiTestBtn").disabled = true;
  $("#aiTestOutput").value = `正在生成测试输出，最多等待 ${AI_TIMEOUT_MS / 1000} 秒...`;
  try {
    const text =
      aiConfig.mode === "mock"
        ? answerQuestion(prompt)
        : await callAiText({
            purpose: "manual-output-test",
            instruction:
              "你是中文 AI 项目管理助理。请基于项目上下文回答用户测试提示，输出要具体、自然、可执行，控制在 300 字以内。",
            user: prompt,
            context: buildAiProjectContext(),
            maxTokens: AI_OUTPUT_TEST_MAX_TOKENS
          });
    $("#aiTestOutput").value = text || emptyAiOutputMessage();
  } catch (error) {
    $("#aiTestOutput").value = `测试失败：${error.message}\n\n如果浏览器直连 API 失败，请切换到本地模拟，或使用后端代理作为 Base URL。`;
  } finally {
    $("#runAiTestBtn").disabled = false;
  }
}

function openTaskDialog(task = null) {
  dialogContext = { type: "task", id: task?.id || null };
  $("#dialogTitle").textContent = task ? "编辑任务" : "新建任务";
  $("#dialogFields").innerHTML = `
    ${field("title", "任务名称", task?.title || "", "text", true)}
    ${field("owner", "负责人", task?.owner || "", "text")}
    ${field("start", "开始时间", task?.start || "", "date")}
    ${field("due", "截止时间", task?.due || "", "date")}
    ${taskParentField(task)}
    ${selectField("status", "状态", task?.status || "todo", statusMap)}
    ${selectField("priority", "优先级", task?.priority || "medium", { high: { label: "高" }, medium: { label: "中" }, low: { label: "低" } })}
    ${dependencyTaskField(task)}
    ${textareaField("acceptanceCriteria", "验收标准", task?.acceptanceCriteria || "", true)}
    ${textareaField("description", "说明", task?.description || "", true)}
  `;
  $("#editDialog").showModal();
}

function taskParentField(task = null) {
  const options = state.tasks
    .filter((item) => item.id !== task?.id)
    .map((item) => `<option value="${item.id}" ${task?.parentId === item.id ? "selected" : ""}>${escapeHtml(item.title)}</option>`)
    .join("");
  return `<div class="field">
    <label for="field_parentId">父任务</label>
    <select id="field_parentId" name="parentId">
      <option value="">无父任务</option>
      ${options}
    </select>
  </div>`;
}

function dependencyTaskField(record = null) {
  const selected = new Set(normalizeDependencyList(record?.dependencies || []));
  const options = state.tasks
    .filter((item) => item.id !== record?.id)
    .map((item) => {
      const isSelected = selected.has(item.id) || selected.has(item.title);
      return `<option value="${item.id}" ${isSelected ? "selected" : ""}>${escapeHtml(item.title)}${item.owner ? ` · ${escapeHtml(item.owner)}` : ""}</option>`;
    })
    .join("");
  return `<div class="field">
    <label for="field_dependencies">依赖任务</label>
    <select id="field_dependencies" name="dependencies" multiple size="5">
      ${options || `<option value="" disabled>暂无可选任务</option>`}
    </select>
    <small class="field-hint">可多选；依赖未完成时任务会被标记为受阻风险。</small>
  </div>`;
}

function openRiskDialog(risk = null) {
  dialogContext = { type: "risk", id: risk?.id || null };
  $("#dialogTitle").textContent = risk ? "编辑风险" : "新建风险";
  $("#dialogFields").innerHTML = `
    ${field("title", "风险名称", risk?.title || "", "text", true)}
    ${field("owner", "负责人", risk?.owner || "", "text")}
    ${selectField("severity", "风险级别", risk?.severity || "medium", { high: { label: "高" }, medium: { label: "中" }, low: { label: "低" } })}
    ${selectField("status", "状态", risk?.status || "open", { open: { label: "开放" }, closed: { label: "已关闭" } })}
    ${textareaField("impact", "影响说明", risk?.impact || "", true)}
  `;
  $("#editDialog").showModal();
}

function openProposalDialog(proposal) {
  dialogContext = { type: "proposal", id: proposal.id };
  $("#dialogTitle").textContent = "编辑候选变更";
  $("#dialogFields").innerHTML = `
    ${field("title", "标题", proposal.title || "", "text", true)}
    ${field("owner", "负责人", proposal.owner || "", "text")}
    ${proposal.type !== "risk" && proposal.type !== "decision" && proposal.type !== "question" ? field("start", "开始时间", proposal.start || "", "date") : ""}
    ${field("due", "截止时间", proposal.due || "", "date")}
    ${proposal.type === "task" ? field("parentTitle", "父任务/工作包", proposal.parentTitle || "", "text") : ""}
    ${proposal.type === "task" ? dependencyTaskField(proposal) : ""}
    ${proposal.type === "risk" ? selectField("severity", "风险级别", proposal.severity || "medium", { high: { label: "高" }, medium: { label: "中" }, low: { label: "低" } }) : ""}
    ${proposal.type !== "decision" && proposal.type !== "risk" ? selectField("status", "状态", proposal.status || "todo", statusMap) : ""}
    ${proposal.type === "task" ? textareaField("acceptanceCriteria", "验收标准", proposal.acceptanceCriteria || "", true) : ""}
    ${textareaField("description", "说明", proposal.description || proposal.impact || proposal.detail || "", true)}
  `;
  $("#editDialog").showModal();
}

function field(name, label, value, type = "text", full = false) {
  return `<div class="field ${full ? "full" : ""}">
    <label for="field_${name}">${label}</label>
    <input id="field_${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" />
  </div>`;
}

function textareaField(name, label, value, full = false) {
  return `<div class="field ${full ? "full" : ""}">
    <label for="field_${name}">${label}</label>
    <textarea id="field_${name}" name="${name}">${escapeHtml(value)}</textarea>
  </div>`;
}

function selectField(name, label, value, options) {
  return `<div class="field">
    <label for="field_${name}">${label}</label>
    <select id="field_${name}" name="${name}">
      ${Object.entries(options)
        .map(([key, item]) => `<option value="${key}" ${key === value ? "selected" : ""}>${item.label}</option>`)
        .join("")}
    </select>
  </div>`;
}

function saveDialog(event) {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const form = new FormData($("#editForm"));
  const now = new Date().toISOString();

  if (dialogContext.type === "project") {
    const name = form.get("name")?.toString().trim() || "未命名项目";
    const phase = form.get("phase")?.toString().trim() || "启动";
    $("#editDialog").close();
    createProject(name, phase);
    return;
  }

  if (dialogContext.type === "task") {
    const task =
      state.tasks.find((item) => item.id === dialogContext.id) ||
      state.tasks.unshift({
        id: uid("task"),
        source: "手动创建",
        createdAt: now
      }) && state.tasks[0];
    task.title = form.get("title")?.toString().trim() || "未命名任务";
    task.owner = form.get("owner")?.toString().trim() || "";
    task.start = form.get("start")?.toString() || "";
    task.due = form.get("due")?.toString() || "";
    task.parentId = form.get("parentId")?.toString() || "";
    task.status = form.get("status")?.toString() || "todo";
    task.priority = form.get("priority")?.toString() || "medium";
    task.dependencies = normalizeDependencyList(form.getAll("dependencies"));
    task.acceptanceCriteria = form.get("acceptanceCriteria")?.toString().trim() || "";
    task.description = form.get("description")?.toString().trim() || "";
    task.updatedAt = now;
    addMemory(dialogContext.id ? "update" : "task", `${dialogContext.id ? "更新" : "新增"}任务：${task.title}`, task.description, "手动编辑");
    recordAudit(dialogContext.id ? "update" : "create", `${dialogContext.id ? "更新" : "新增"}任务：${task.title}`, `负责人：${task.owner || "未设置"}；截止：${formatDate(task.due)}`);
  }

  if (dialogContext.type === "risk") {
    const risk =
      state.risks.find((item) => item.id === dialogContext.id) ||
      state.risks.unshift({
        id: uid("risk"),
        source: "手动创建",
        createdAt: now
      }) && state.risks[0];
    risk.title = form.get("title")?.toString().trim() || "未命名风险";
    risk.owner = form.get("owner")?.toString().trim() || "";
    risk.severity = form.get("severity")?.toString() || "medium";
    risk.status = form.get("status")?.toString() || "open";
    risk.impact = form.get("impact")?.toString().trim() || "";
    risk.updatedAt = now;
    addMemory(dialogContext.id ? "update" : "risk", `${dialogContext.id ? "更新" : "新增"}风险：${risk.title}`, risk.impact, "手动编辑");
    recordAudit(dialogContext.id ? "update" : "create", `${dialogContext.id ? "更新" : "新增"}风险：${risk.title}`, `级别：${severityMap[risk.severity] || risk.severity}`);
  }

  if (dialogContext.type === "proposal") {
    const proposal = state.proposals.find((item) => item.id === dialogContext.id);
    if (proposal) {
      proposal.title = form.get("title")?.toString().trim() || proposal.title;
      proposal.owner = form.get("owner")?.toString().trim() || "";
      proposal.start = form.get("start")?.toString() || "";
      proposal.due = form.get("due")?.toString() || "";
      proposal.parentTitle = form.get("parentTitle")?.toString().trim() || proposal.parentTitle || "";
      proposal.dependencies = normalizeDependencyList(form.getAll("dependencies"));
      proposal.status = form.get("status")?.toString() || proposal.status;
      proposal.severity = form.get("severity")?.toString() || proposal.severity;
      proposal.acceptanceCriteria = form.get("acceptanceCriteria")?.toString().trim() || proposal.acceptanceCriteria || "";
      const description = form.get("description")?.toString().trim() || "";
      proposal.description = description;
      if (proposal.type === "risk") proposal.impact = description;
      if (proposal.type === "decision") proposal.detail = description;
      recordAudit("update", `编辑候选变更：${proposal.title}`, proposal.description || proposal.evidence || "");
    }
  }

  $("#editDialog").close();
  saveState();
  showToast("已保存。");
  render();
}

function exportData() {
  recordAudit("export", "导出项目数据", "导出当前工作台完整 JSON 数据。");
  saveState();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `yanpm-project-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("项目数据已导出。");
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = normalizeState(JSON.parse(String(reader.result)));
      recordAudit("import", "导入项目数据", file.name || "JSON 文件");
      saveState();
      showToast("项目数据已导入。");
      render();
    } catch {
      showToast("导入失败，请选择有效的 JSON 文件。");
    }
  };
  reader.readAsText(file);
}

function importText(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    insertIntoGlobalInput(String(reader.result || ""));
    showToast("文本已导入输入框。");
  };
  reader.onerror = () => showToast("文本读取失败，请重新选择文件。");
  reader.readAsText(file);
}

function importAudio(file) {
  if (!file) return;
  const note = [
    `录音文件：${describeFile(file)}`,
    "已作为语音来源加入输入。若浏览器支持语音听写，可直接点麦克风转成文字；录音文件转写将在后续接入。"
  ].join("\n");
  insertIntoGlobalInput(note);
  showToast("录音文件已加入输入框。");
}

function importAttachments(files, kind = "附件") {
  const list = Array.from(files || []);
  if (!list.length) return;
  const note = list.map((file) => `${kind}：${describeFile(file)}`).join("\n");
  insertIntoGlobalInput(note);
  showToast(`${kind}已加入输入框，可补充说明后发送。`);
}

function describeFile(file) {
  return `${file.name}${file.type ? ` · ${file.type}` : ""} · ${formatFileSize(file.size)}`;
}

function formatFileSize(size) {
  const number = Number(size || 0);
  if (number >= 1024 * 1024) return `${(number / 1024 / 1024).toFixed(1)} MB`;
  if (number >= 1024) return `${(number / 1024).toFixed(1)} KB`;
  return `${number} B`;
}

function insertIntoGlobalInput(text) {
  const input = $("#globalLanguageInput");
  if (!input) return;
  const current = input.value.trim();
  input.value = current ? `${current}\n${text}` : text;
  input.focus();
}

function focusGlobalLanguageEntry() {
  const input = $("#globalLanguageInput");
  if (!input) return;
  input.focus();
  input.closest(".floating-input-shell")?.classList.add("is-attending");
  window.setTimeout(() => input.closest(".floating-input-shell")?.classList.remove("is-attending"), 900);
}

async function toggleVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    await toggleMicRecorderFallback();
    return;
  }
  if (!recognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      recognizing = true;
      updateVoiceButton("停止听写");
      focusGlobalLanguageEntry();
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0].transcript;
        if (event.results[index].isFinal) finalText += text;
        else interimText += text;
      }
      if (finalText) insertIntoGlobalInput(`${finalText}。`);
      const input = $("#globalLanguageInput");
      if (input && interimText) input.placeholder = `听写中：${interimText}`;
      updateVoiceButton(interimText ? "听写中" : "停止听写");
    };
    recognition.onerror = (event) => {
      recognizing = false;
      renderGlobalLanguageEntry();
      updateVoiceButton("语音输入");
      showToast(speechErrorMessage(event.error));
    };
    recognition.onend = () => {
      recognizing = false;
      renderGlobalLanguageEntry();
      updateVoiceButton("语音输入");
    };
  }
  if (recognizing) {
    recognition.stop();
    recognizing = false;
    updateVoiceButton("语音输入");
  } else {
    const allowed = await ensureMicrophoneAccess();
    if (!allowed) return;
    try {
      recognition.start();
      showToast("正在听写，说完后会自动写入输入框。");
    } catch (error) {
      recognizing = false;
      updateVoiceButton("语音输入");
      showToast(error.message || "语音听写启动失败，请再试一次。");
    }
  }
}

async function ensureMicrophoneAccess() {
  if (!navigator.mediaDevices?.getUserMedia) return true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    showToast(microphoneErrorMessage(error));
    return false;
  }
}

async function toggleMicRecorderFallback() {
  if (micRecorder?.state === "recording") {
    micRecorder.stop();
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast("当前浏览器不支持麦克风输入。请使用 Chrome/Edge，或通过加号上传录音文件。");
    return;
  }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micChunks = [];
    micStartedAt = Date.now();
    micRecorder = new MediaRecorder(micStream);
    micRecorder.ondataavailable = (event) => {
      if (event.data?.size) micChunks.push(event.data);
    };
    micRecorder.onstop = () => {
      const blob = new Blob(micChunks, { type: micRecorder.mimeType || "audio/webm" });
      const seconds = Math.max(1, Math.round((Date.now() - micStartedAt) / 1000));
      insertIntoGlobalInput(`麦克风录音：${seconds} 秒 · ${formatFileSize(blob.size)}\n当前浏览器未提供语音转文字能力，已保留录音输入来源。`);
      stopMicStream();
      updateVoiceButton("语音输入");
      showToast("麦克风录音已加入输入框。");
    };
    micRecorder.start();
    recognizing = true;
    updateVoiceButton("停止录音");
    showToast("当前浏览器不支持语音转文字，已切换为麦克风录音。再次点击停止。");
  } catch (error) {
    recognizing = false;
    stopMicStream();
    updateVoiceButton("语音输入");
    showToast(microphoneErrorMessage(error));
  }
}

function stopMicStream() {
  micStream?.getTracks().forEach((track) => track.stop());
  micStream = null;
  recognizing = false;
}

function speechErrorMessage(error) {
  const messages = {
    "not-allowed": "麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试。",
    "service-not-allowed": "浏览器语音服务不可用，可先上传录音或粘贴转写文本。",
    "audio-capture": "没有检测到可用麦克风，请检查系统输入设备。",
    "no-speech": "没有识别到语音，请靠近麦克风再试。",
    network: "语音识别服务网络异常，请稍后重试或上传录音文件。"
  };
  return messages[error] || "语音听写失败，请重试或上传录音文件。";
}

function microphoneErrorMessage(error) {
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") return "麦克风权限被拒绝，请在浏览器地址栏允许麦克风后重试。";
  if (error?.name === "NotFoundError") return "没有检测到可用麦克风，请检查系统输入设备。";
  if (error?.name === "NotReadableError") return "麦克风正被其他应用占用，请关闭占用后重试。";
  return "麦克风启动失败，请检查浏览器权限和输入设备。";
}

function updateVoiceButton(label) {
  const button = $("#globalVoiceBtn");
  if (!button) return;
  button.title = label;
  button.setAttribute("aria-label", label);
  button.classList.toggle("is-recording", recognizing);
}

function toggleAttachmentMenu() {
  const menu = $("#globalAttachmentMenu");
  if (!menu) return;
  menu.hidden = !menu.hidden;
}

function closeAttachmentMenu() {
  const menu = $("#globalAttachmentMenu");
  if (menu) menu.hidden = true;
}

function wireEvents() {
  $("#navList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-view]");
    if (button) setActiveView(button.dataset.view);
  });

  document.body.addEventListener("click", (event) => {
    const jump = event.target.closest("[data-jump]");
    if (jump) setActiveView(jump.dataset.jump);
    if (event.target.closest("[data-focus-global]")) focusGlobalLanguageEntry();
    if (!event.target.closest(".floating-input-shell")) closeAttachmentMenu();
  });

  $$("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      inputMode = button.dataset.mode;
      $$("[data-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
      renderConversation();
    });
  });

  $("#globalRunBtn").addEventListener("click", () => runGlobalAssistant("auto"));
  $("#globalVoiceBtn").addEventListener("click", toggleVoice);
  $("#globalAddBtn").addEventListener("click", toggleAttachmentMenu);
  $("#globalLanguageInput").addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      runGlobalAssistant("auto");
    }
  });
  $("#globalTextFileInput").addEventListener("change", (event) => {
    importText(event.target.files[0]);
    event.target.value = "";
    closeAttachmentMenu();
  });
  $("#globalAttachmentInput").addEventListener("change", (event) => {
    importAttachments(event.target.files, "附件");
    event.target.value = "";
    closeAttachmentMenu();
  });
  $("#globalPhotoInput").addEventListener("change", (event) => {
    importAttachments(event.target.files, "照片");
    event.target.value = "";
    closeAttachmentMenu();
  });
  $("#globalAudioFileInput").addEventListener("change", (event) => {
    importAudio(event.target.files[0]);
    event.target.value = "";
    closeAttachmentMenu();
  });
  $("#exportBtn").addEventListener("click", exportData);
  $("#importFile").addEventListener("change", (event) => importData(event.target.files[0]));
  $("#refreshAdviceBtn").addEventListener("click", () => {
    showToast("已根据当前项目状态重新判断。");
    renderDashboard();
  });
  $("#projectSelect").addEventListener("change", (event) => switchProject(event.target.value));
  $("#authBtn").addEventListener("click", openAuthDialog);
  $("#authForm").addEventListener("submit", saveAuthFromForm);
  $("#wechatLoginBtn").addEventListener("click", () => startOAuthLogin("wechat"));
  $("#wecomLoginBtn").addEventListener("click", () => startOAuthLogin("wecom"));
  $("#logoutBtn").addEventListener("click", logoutAuth);
  $("#exportAuditBtn").addEventListener("click", exportAuditLog);
  $("#newProjectBtn").addEventListener("click", startProjectWizard);
  $("#newProjectHeroBtn").addEventListener("click", startProjectWizard);
  $("#duplicateProjectBtn").addEventListener("click", () => duplicateProject());
  $("#archiveProjectBtn").addEventListener("click", () => archiveProject());
  $("#aiSettingsBtn").addEventListener("click", openAiSettings);
  $("#aiProvider").addEventListener("change", (event) => applyAiProviderPreset(event.target.value));
  $("#aiSettingsForm").addEventListener("submit", (event) => {
    if (event.submitter?.value === "cancel") return;
    event.preventDefault();
    saveAiSettingsFromForm();
    $("#aiSettingsDialog").close();
  });
  $("#testAiBtn").addEventListener("click", testAiConnection);
  $("#runAiTestBtn").addEventListener("click", runAiOutputTest);
  $("#projectGrid").addEventListener("click", (event) => {
    const card = event.target.closest(".project-card");
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!card || !action) return;
    if (action === "switch-project") switchProject(card.dataset.id);
    if (action === "duplicate-project") duplicateProject(card.dataset.id);
    if (action === "archive-project") archiveProject(card.dataset.id);
    if (action === "restore-project") restoreProject(card.dataset.id);
  });
  $("#closeWizardBtn").addEventListener("click", closeProjectWizard);
  $("#projectTemplateSelect").addEventListener("change", (event) => applyProjectTemplate(event.target.value));
  $("#wizardBackBtn").addEventListener("click", wizardBack);
  $("#wizardSkipBtn").addEventListener("click", () => {
    if (!projectWizard) return;
    const question = projectWizardQuestions[projectWizard.step];
    projectWizard.answers[question.key] = "";
    wizardNext(true);
  });
  $("#wizardNextBtn").addEventListener("click", () => wizardNext(false));
  $("#wizardAnswer").addEventListener("input", () => {
    saveWizardAnswer();
    $("#wizardPreview").innerHTML = renderFrameworkPreview(buildProjectFramework(projectWizard.answers));
  });
  $("#wizardSuggestions").addEventListener("click", (event) => {
    const button = event.target.closest("[data-suggestion]");
    if (!button || !projectWizard) return;
    $("#wizardAnswer").value = button.dataset.suggestion;
    saveWizardAnswer();
    $("#wizardPreview").innerHTML = renderFrameworkPreview(buildProjectFramework(projectWizard.answers));
  });
  $("#reportMode").addEventListener("click", (event) => {
    const button = event.target.closest("[data-report]");
    if (!button) return;
    reportMode = button.dataset.report;
    renderReports();
  });
  $("#copyReportBtn").addEventListener("click", () => {
    copyText($("#reportOutput").value, "汇报已复制。");
  });
  $("#saveReportBtn").addEventListener("click", () => {
    const title = reportMode === "weekly" ? "保存项目周报" : reportMode === "executive" ? "保存管理层摘要" : "保存风险摘要";
    addMemory("update", title, $("#reportOutput").value, "智能汇报");
    recordAudit("create", title, "从智能汇报生成并存入项目记忆。");
    saveState();
    showToast("已存入项目记忆。");
    renderReports();
  });
  $("#copyFollowupsBtn").addEventListener("click", () => {
    const text = buildFollowupMessages()
      .map((item) => `${item.owner}：${item.message}`)
      .join("\n\n");
    copyText(text || "暂无需要跟进的负责人。", "跟进消息已复制。");
  });

  $("#proposalList").addEventListener("click", (event) => {
    const card = event.target.closest(".proposal-item");
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (!card || !action) return;
    if (action === "approve-proposal") approveProposal(card.dataset.id);
    if (action === "merge-proposal") mergeProposalIntoExisting(card.dataset.id);
    if (action === "reject-proposal") rejectProposal(card.dataset.id);
    if (action === "edit-proposal") {
      const proposal = state.proposals.find((item) => item.id === card.dataset.id);
      if (proposal) openProposalDialog(proposal);
    }
  });

  $("#approveAllBtn").addEventListener("click", approveAll);
  $("#clearRejectedBtn").addEventListener("click", () => {
    const count = state.proposals.filter((proposal) => proposal.state === "rejected").length;
    state.proposals = state.proposals.filter((proposal) => proposal.state !== "rejected");
    if (count) recordAudit("delete", "清理忽略项", `清理 ${count} 条已忽略候选变更。`);
    saveState();
    showToast("已清理忽略项。");
    render();
  });

  $("#manualTaskBtn").addEventListener("click", () => openTaskDialog());
  $("#taskViewMode").addEventListener("click", (event) => {
    const button = event.target.closest("[data-task-view]");
    if (!button) return;
    taskViewMode = button.dataset.taskView;
    renderTasks();
  });
  $("#taskFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    taskFilter = button.dataset.filter;
    renderTasks();
  });
  $("#taskBoard").addEventListener("change", (event) => {
    const select = event.target.closest("[data-action='change-task-status']");
    if (!select) return;
    const card = event.target.closest("[data-id]");
    if (!card) return;
    const task = state.tasks.find((item) => item.id === card.dataset.id);
    if (!task) return;
    task.status = select.value;
    task.updatedAt = new Date().toISOString();
    addMemory("update", `更新任务状态：${task.title}`, `状态改为${statusMap[task.status].label}`, "任务看板");
    recordAudit("update", `更新任务状态：${task.title}`, `状态改为${statusMap[task.status].label}`);
    saveState();
    showToast("任务状态已更新。");
    render();
  });
  $("#taskBoard").addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    const card = event.target.closest("[data-id]");
    if (!action || !card) return;
    const task = state.tasks.find((item) => item.id === card.dataset.id);
    if (!task) return;
    if (action === "decompose-task") {
      const proposals = decomposeWorkPackage(`${task.title} ${task.description || ""}`, `任务拆解 · ${formatDateTime(new Date())}`, {
        owner: task.owner || "",
        start: task.start || "",
        due: task.due || "",
        priority: task.priority || "medium",
        evidence: `${task.title}\n${task.description || ""}`.trim()
      });
      if (!proposals.length) {
        showToast("这条任务暂时没有识别出可拆解的工作项。");
        return;
      }
      state.proposals.unshift(...proposals);
      addMemory("task", `拆解任务：${task.title}`, `已生成 ${proposals.length} 条待确认子任务。`, "任务管理");
      recordAudit("create", `拆解任务：${task.title}`, `生成 ${proposals.length} 条待确认子任务。`);
      saveState();
      showToast(`已生成 ${proposals.length} 条待确认子任务。`);
      setActiveView("review");
      return;
    }
    if (action === "edit-task") openTaskDialog(task);
    if (action === "delete-task") {
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      addMemory("update", `删除任务：${task.title}`, "任务已从看板移除。", "任务看板");
      recordAudit("delete", `删除任务：${task.title}`, task.description || "");
      saveState();
      showToast("任务已删除。");
      render();
    }
  });

  $("#manualRiskBtn").addEventListener("click", () => openRiskDialog());
  $("#riskList").addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    const card = event.target.closest(".risk-item");
    if (!action || !card) return;
    const risk = state.risks.find((item) => item.id === card.dataset.id);
    if (!risk) return;
    if (action === "edit-risk") openRiskDialog(risk);
    if (action === "toggle-risk") {
      risk.status = risk.status === "closed" ? "open" : "closed";
      risk.updatedAt = new Date().toISOString();
      addMemory("update", `${risk.status === "closed" ? "关闭" : "重新打开"}风险：${risk.title}`, risk.impact, "风险看板");
      recordAudit("update", `${risk.status === "closed" ? "关闭" : "重新打开"}风险：${risk.title}`, risk.impact || "");
      saveState();
      showToast("风险状态已更新。");
      render();
    }
    if (action === "delete-risk") {
      state.risks = state.risks.filter((item) => item.id !== risk.id);
      addMemory("update", `删除风险：${risk.title}`, "风险已从列表移除。", "风险看板");
      recordAudit("delete", `删除风险：${risk.title}`, risk.impact || "");
      saveState();
      showToast("风险已删除。");
      render();
    }
  });

  $("#editForm").addEventListener("submit", saveDialog);
  $("#resetDemoBtn").addEventListener("click", () => {
    storageRemove(STORAGE_KEY);
    state = seedState();
    recordAudit("init", "重置演示数据", "用户手动重置本地体验数据。");
    saveState();
    showToast("已重置为演示数据。");
    render();
  });
}

wireEvents();
renderIcons();
render();
notifyAuthReturn();
initBackendBridge();
