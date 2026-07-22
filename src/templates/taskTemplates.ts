// 任务模板
//
// 用途：
//   - 科研场景下，不同类型的任务（实验/论文/普通）有不同的 frontmatter 字段 + 正文结构
//   - 通过 createTask(name, { template: "experiment" | "paper" | "task" }) 自动套上
//   - 模板内容是 YAML frontmatter + Markdown 正文，可以用户自己再编辑
//
// 设计原则：
//   - 字段尽量少（只放最常用的）
//   - 正文给出可填空的骨架，不强制填完
//   - 中英混合：frontmatter 字段名保持英文（兼容 plugin 解析），正文用中文

export type TaskTemplateId = "task" | "experiment" | "paper";

export interface TaskTemplate {
  id: TaskTemplateId;
  /** 模板的中文名（settings 下拉用） */
  label: string;
  /** 模板的英文名 */
  labelEn: string;
  /** 默认 frontmatter 字段（与 createTask 的 opts 合并，opts 优先） */
  frontmatter: {
    tags?: string[];
    status?: "Prepare" | "Doing" | "Done" | "Abandon";
    priority?: "high" | "medium" | "low" | "none";
    start?: string; // YYYY-MM-DD
    completionDate?: string;
  };
  /** Markdown 正文骨架（不含 frontmatter） */
  body: string;
}

export const TASK_TEMPLATES: Record<TaskTemplateId, TaskTemplate> = {
  // 普通任务（默认）
  task: {
    id: "task",
    label: "普通任务",
    labelEn: "Generic Task",
    frontmatter: {
      tags: ["task"],
      status: "Prepare",
      priority: "medium",
    },
    body: "",
  },

  // 实验记录
  experiment: {
    id: "experiment",
    label: "🧪 实验记录",
    labelEn: "Experiment",
    frontmatter: {
      tags: ["experiment"],
      status: "Prepare",
      priority: "medium",
    },
    body: `## 实验目的
<!-- 这个实验想验证什么？预期结果是什么？ -->

## 实验条件
- **样本**:
- **设备 / 仪器**:
- **关键参数**:
- **实验时间**:

## 实验步骤
1.
2.
3.

## 原始数据
<!-- 贴原始数据、截图、链接 -->

## 数据分析
- 统计方法:
- 可视化:
- 关键指标:

## 结论
-

## 待办
- [ ]
- [ ]

## 相关
<!-- 相关实验 / 相关文献 / 关联任务 -->
`,
  },

  // 论文阅读笔记
  paper: {
    id: "paper",
    label: "📄 论文阅读",
    labelEn: "Paper Reading",
    frontmatter: {
      tags: ["paper", "reading"],
      status: "Prepare",
      priority: "medium",
    },
    body: `## 文献信息
- **标题**:
- **作者**:
- **期刊 / 会议**:
- **年份**:
- **DOI / 链接**:
- **关键词**:

## 一句话总结
<!-- 用一句话讲清楚这篇文章做了什么 -->

## 核心问题
<!-- 这篇文章要解决什么问题？ -->

## 方法
-

## 关键结果
-

## 创新点
-

## 局限
-

## 与我的研究的关系
- 关联实验:
- 可借鉴的方法:
- 计划引用到:

## 阅读笔记
<!-- 边读边记：公式推导、图表理解、自己的疑问 -->
`,
  },
};

/** 把模板 + 用户 opts 合并成 createTask 用的 opts */
export function mergeTemplateOpts(
  templateId: TaskTemplateId | undefined,
  userOpts: {
    tags?: string[];
    status?: "Prepare" | "Doing" | "Done" | "Abandon";
    priority?: "high" | "medium" | "low" | "none";
    start?: string;
    completionDate?: string;
  } = {}
): {
  tags?: string[];
  status?: "Prepare" | "Doing" | "Done" | "Abandon";
  priority?: "high" | "medium" | "low" | "none";
  start?: string;
  completionDate?: string;
  body?: string;
} {
  if (!templateId || templateId === "task") {
    return { ...TASK_TEMPLATES.task.frontmatter, ...userOpts };
  }
  const tpl = TASK_TEMPLATES[templateId];
  // tags 合并去重
  const mergedTags = Array.from(
    new Set([...(tpl.frontmatter.tags || []), ...(userOpts.tags || [])])
  );
  return {
    tags: mergedTags,
    status: userOpts.status || tpl.frontmatter.status,
    priority: userOpts.priority || tpl.frontmatter.priority,
    start: userOpts.start || tpl.frontmatter.start,
    completionDate: userOpts.completionDate || tpl.frontmatter.completionDate,
    body: tpl.body,
  };
}

/** Quick Capture 前缀识别 */
export const QUICK_CAPTURE_PREFIXES: { prefix: string; template: TaskTemplateId; hint: string }[] = [
  { prefix: "/exp",  template: "experiment", hint: "实验记录" },
  { prefix: "/paper", template: "paper",    hint: "论文笔记" },
  { prefix: "/task",  template: "task",     hint: "普通任务" },
  { prefix: "/note",  template: "task",     hint: "普通笔记" }, // 用普通模板但不开
];

/** 从用户输入识别 prefix + 标题 */
export function parseQuickCapture(input: string): {
  template: TaskTemplateId;
  title: string;
  rawPrefix: string;
} | null {
  const trimmed = input.trim();
  for (const p of QUICK_CAPTURE_PREFIXES) {
    // 匹配 "/exp xxx" 或 "/exp" 后空一格
    if (trimmed === p.prefix || trimmed.startsWith(p.prefix + " ")) {
      const title = trimmed.slice(p.prefix.length).trim();
      return { template: p.template, title, rawPrefix: p.prefix };
    }
  }
  return null;
}

/** 根据 template 类型选 folder（用 settings 里的配置） */
export function pickFolderForTemplate(
  settings: {
    experimentFolder?: string;
    paperFolder?: string;
    taskFolder?: string;
  },
  tplId: string
): string | undefined {
  if (tplId === "experiment" && settings.experimentFolder) return settings.experimentFolder;
  if (tplId === "paper" && settings.paperFolder) return settings.paperFolder;
  if (settings.taskFolder) return settings.taskFolder;
  return undefined;
}
