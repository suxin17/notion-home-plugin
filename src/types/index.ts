// 任务相关类型定义
// 数据模型：每个任务是一个 .md 文件，frontmatter 包含元数据
//
// Frontmatter 字段：
//   tafs: string[]                 tag 列表
//   Status: "open" | "done"        状态
//   Start Date: YYYY-MM-DD         开始日期
//   Completion Date: YYYY-MM-DD    完成日期（截止日期）
//   Priority: "high" | "medium" | "low" | "none"
//   Time Tracking: "1h 30m"        累计计时（plugin 写入）

/** 任务状态（4 态） */
export type TaskStatus = "Doing" | "Prepare" | "Done" | "Abandon";
export const ALL_STATUSES: TaskStatus[] = ["Doing", "Prepare", "Done", "Abandon"];
export const STATUS_LABELS: Record<TaskStatus, { zh: string; en: string; icon: string; color: string }> = {
  Doing:    { zh: "进行中", en: "Doing",    icon: "🟢", color: "#10b981" },
  Prepare:  { zh: "待开始", en: "Prepare",  icon: "🟡", color: "#f59e0b" },
  Done:     { zh: "已完成", en: "Done",     icon: "🔵", color: "#3b82f6" },
  Abandon:  { zh: "已放弃", en: "Abandon",  icon: "⚪", color: "#9ca3af" },
};

export type TaskPriority = "high" | "medium" | "low" | "none";

/** 任务：每个 .md 文件对应一个 task（前提是有 frontmatter） */
export interface Task {
  id: string;                 // = file path（稳定 id）
  file: string;               // TFile.path
  basename: string;           // 文件名（去掉 .md）
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];             // frontmatter.tafs
  start?: string;             // YYYY-MM-DD（frontmatter["Start Date"]）
  completionDate?: string;    // YYYY-MM-DD（frontmatter["Completion Date"]）
  totalSeconds?: number;      // 累计计时（解析 frontmatter["Time Tracking"]）
  /** 原始 frontmatter 引用（用于保留未知字段不被覆盖） */
  rawFrontmatter?: Record<string, any>;
}

/** 任务过滤选项 */
export interface TaskFilter {
  status?: TaskStatus | "all";
  priority?: TaskPriority;
  tag?: string;               // 按 tag 过滤
  search?: string;            // 按文件名/正文搜索
}

// ===== 计时器相关 =====

/** 一段计时记录 */
export interface TimeLogEntry {
  date: string;               // YYYY-MM-DD（开始时所在的那天）
  file: string;               // 任务文件路径
  taskText: string;           // 任务名快照
  start: number;              // ms timestamp
  end: number;                // ms timestamp
  durationMs: number;
}

/** 热力图单元 */
export interface HeatmapCell {
  date: string;
  seconds: number;
  level: 0 | 1 | 2 | 3 | 4;
  /** 是否在当前统计周期内（StatRange）。范围外的格子会 dim 掉。 */
  inRange?: boolean;
}
