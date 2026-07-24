// TaskService - frontmatter 模式
//
// 每个任务 = 一个 .md 文件，frontmatter 包含元数据。
// 解析：使用 Obsidian 的 app.metadataCache（性能好，无需自己解析 YAML）。
// 修改：使用 app.fileManager.processFrontMatter（原子更新）。
//
// Frontmatter 字段约定：
//   tafs: string[]                 tag 列表
//   Status: "open" | "done"
//   Start Date: YYYY-MM-DD
//   Completion Date: YYYY-MM-DD
//   Priority: "high" | "medium" | "low" | "none"
//   Time Tracking: "1h 30m"        plugin 写入的累计计时

import { App, TFile, TAbstractFile } from "obsidian";
import type { Task, TaskStatus, TaskPriority, TaskFilter } from "../types";
import { ALL_STATUSES } from "../types";

interface FileCache {
  mtime: number;
  task: Task | null; // null = 不是 task（没有 frontmatter 或缺 Status 字段）
}

export class TaskService {
  private app: App;
  private cache = new Map<string, FileCache>();
  private listeners = new Set<() => void>();
  /** 可选：注入 timeTracker，让 manual +/- 时间也能进 log（heatmap/pie 反映） */
  private timeTracker: { addManualEntry(task: any, seconds: number, date?: string): void } | null = null;

  constructor(app: App) {
    this.app = app;

    this.app.vault.on("modify", (f) => this.invalidate(f));
    this.app.vault.on("create", (f) => this.invalidate(f));
    this.app.vault.on("delete", (f) => this.remove(f));
    this.app.vault.on("rename", (f, oldPath) => {
      this.cache.delete(oldPath);
      this.invalidate(f);
    });
    // metadataCache 改变时也失效（编辑 frontmatter 时 cache 会更新）
    this.app.metadataCache.on("changed", (f) => this.invalidate(f));
  }

  /** 注入 timeTracker（plugin.onload 调用一次） */
  setTimeTracker(tt: { addManualEntry(task: any, seconds: number, date?: string): void }): void {
    this.timeTracker = tt;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  private invalidate(file: TAbstractFile) {
    if (!(file instanceof TFile) || file.extension !== "md") return;
    this.cache.delete(file.path);
    this.notify();
  }

  private remove(file: TAbstractFile) {
    this.cache.delete(file.path);
    this.notify();
  }

  /** 获取单个文件的 task（命中缓存则跳过） */
  private async getFileTask(file: TFile): Promise<Task | null> {
    const cached = this.cache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime) return cached.task;

    const meta = this.app.metadataCache.getFileCache(file);
    const fm = meta?.frontmatter;

    if (!fm || !fm.Status) {
      // 没有 frontmatter 或没有 Status → 不是 task
      this.cache.set(file.path, { mtime: file.stat.mtime, task: null });
      return null;
    }

    const task = parseTask(file, fm, meta);
    this.cache.set(file.path, { mtime: file.stat.mtime, task });
    return task;
  }

  /** 拉取所有 task */
  async getAllTasks(): Promise<Task[]> {
    const files = this.app.vault.getMarkdownFiles();
    const results = await Promise.all(files.map((f) => this.getFileTask(f)));
    return results.filter((t): t is Task => t !== null);
  }

  /** 按过滤条件筛 */
  filter(tasks: Task[], filter: TaskFilter): Task[] {
    return tasks.filter((t) => {
      if (filter.status && filter.status !== "all" && t.status !== filter.status) return false;
      if (filter.priority && t.priority !== filter.priority) return false;
      if (filter.tag && !t.tags.includes(filter.tag)) return false;
      if (filter.search) {
        const q = filter.search.toLowerCase();
        if (!t.basename.toLowerCase().includes(q) && !t.file.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  /** 拉取所有 tag（去重） */
  async getAllTags(): Promise<string[]> {
    const tasks = await this.getAllTasks();
    const set = new Set<string>();
    for (const t of tasks) t.tags.forEach((tag) => set.add(tag));
    return Array.from(set).sort();
  }

  // ===== 修改 frontmatter =====

  /** 设置状态 */
  async setStatus(task: Task, status: TaskStatus): Promise<void> {
    const file = this.getFile(task);
    if (!file) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.Status = status;
    });
  }

  /** 切换状态：Doing ↔ Prepare（最常用切换） */
  async toggleStatus(task: Task): Promise<void> {
    if (task.status === "Doing") await this.setStatus(task, "Prepare");
    else await this.setStatus(task, "Doing");
  }

  /** 设置 tag 列表（完全替换） */
  async setTags(task: Task, tags: string[]): Promise<void> {
    const file = this.getFile(task);
    if (!file) return;
    const cleaned = Array.from(new Set(tags.map(normalizeTag).filter(Boolean)));
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.tafs = cleaned;
    });
  }

  /** 添加 tag */
  async addTag(task: Task, tag: string): Promise<void> {
    const n = normalizeTag(tag);
    if (!n) return;
    if (task.tags.includes(n)) return;
    await this.setTags(task, [...task.tags, n]);
  }

  /** 移除 tag */
  async removeTag(task: Task, tag: string): Promise<void> {
    await this.setTags(task, task.tags.filter((t) => t !== tag));
  }

  /** 设置开始/完成日期 */
  async setDates(task: Task, opts: { start?: string | null; completionDate?: string | null }): Promise<void> {
    const file = this.getFile(task);
    if (!file) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (opts.start === null) delete fm["Start Date"];
      else if (opts.start !== undefined) fm["Start Date"] = opts.start;
      if (opts.completionDate === null) delete fm["Completion Date"];
      else if (opts.completionDate !== undefined) fm["Completion Date"] = opts.completionDate;
    });
  }

  /** 设置优先级 */
  async setPriority(task: Task, priority: TaskPriority): Promise<void> {
    const file = this.getFile(task);
    if (!file) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.Priority = priority;
    });
  }

  /** 累加计时（秒），回写到 Time Tracking 字段 */
  async accumulateTime(task: Task, addSeconds: number): Promise<void> {
    const file = this.getFile(task);
    if (!file) return;
    const newTotal = (task.totalSeconds || 0) + addSeconds;
    const formatted = formatTotalTime(newTotal);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm["Time Tracking"] = formatted;
    });
  }

  /** 直接设置总时间（覆盖） */
  async setTimeTotal(task: Task, totalSeconds: number): Promise<void> {
    const file = this.getFile(task);
    if (!file) return;
    const formatted = formatTotalTime(Math.max(0, Math.round(totalSeconds)));
    if (formatted === "0m") {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        delete fm["Time Tracking"];
      });
    } else {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm["Time Tracking"] = formatted;
      });
    }
  }

  /** 在当前时间上调整（+/- 秒） */
  async adjustTime(task: Task, deltaSeconds: number): Promise<void> {
    const newTotal = Math.max(0, (task.totalSeconds || 0) + deltaSeconds);
    await this.setTimeTotal(task, newTotal);
    // 同步写 timeLog，让 heatmap / pie 反映手动调整
    if (this.timeTracker && deltaSeconds !== 0) {
      this.timeTracker.addManualEntry(task, deltaSeconds);
    }
  }

  /** 写一个当前正在计时的提示（用户回到笔记能看到） */
  async markTiming(task: Task, startedAt: number): Promise<void> {
    const file = this.getFile(task);
    if (!file) return;
    const iso = new Date(startedAt).toISOString().slice(0, 16).replace("T", " ");
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm["Last Timer Start"] = iso;
    });
  }

  /** 清除"正在计时"标记 */
  async clearTimingMark(task: Task): Promise<void> {
    const file = this.getFile(task);
    if (!file) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      delete fm["Last Timer Start"];
    });
  }

  // ===== 创建任务 =====

  /** 创建一个新任务文件（带 frontmatter） */
  async createTask(name: string, opts?: {
    tags?: string[];
    status?: TaskStatus;
    start?: string;
    completionDate?: string;
    priority?: TaskPriority;
    body?: string;
    /** 指定文件夹（不存在会自动创建） */
    folder?: string;
  }): Promise<Task | null> {
    const safeName = name.endsWith(".md") ? name : `${name}.md`;
    // 拼接 folder（用 /，obsidian 用 / 作为路径分隔符）
    const fullBase = opts?.folder
      ? `${opts.folder.replace(/\\/g, "/").replace(/\/+$/, "")}/${safeName}`
      : safeName;
    const path = await this.app.vault.adapter.exists(fullBase)
      ? this.findUniquePath(fullBase)
      : fullBase;

    // 确保文件夹存在
    if (opts?.folder) {
      const folder = opts.folder.replace(/\\/g, "/").replace(/\/+$/, "");
      const folderExists = await this.app.vault.adapter.exists(folder);
      if (!folderExists) {
        await this.app.vault.createFolder(folder).catch(() => {
          // 已存在会抛错，忽略
        });
      }
    }

    const fm: Record<string, any> = {
      Status: opts?.status || "open",
    };
    if (opts?.tags && opts.tags.length) fm.tafs = opts.tags.map(normalizeTag).filter(Boolean);
    if (opts?.start) fm["Start Date"] = opts.start;
    if (opts?.completionDate) fm["Completion Date"] = opts.completionDate;
    if (opts?.priority && opts.priority !== "none") fm.Priority = opts.priority;

    const fmYaml = renderFrontmatter(fm);
    const body = opts?.body || "";
    const content = body ? `${fmYaml}\n${body}\n` : `${fmYaml}\n`;

    const file = await this.app.vault.create(path, content);
    await this.app.workspace.getLeaf().openFile(file);
    return await this.getFileTask(file);
  }

  // ===== 工具 =====

  private getFile(task: Task): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(task.file);
    return f instanceof TFile ? f : null;
  }

  private findUniquePath(basePath: string): string {
    const dot = basePath.lastIndexOf(".");
    const stem = basePath.slice(0, dot);
    const ext = basePath.slice(dot);
    let i = 1;
    let candidate = `${stem} ${i}${ext}`;
    while (this.app.vault.adapter.exists(candidate)) {
      i++;
      candidate = `${stem} ${i}${ext}`;
    }
    return candidate;
  }
}

// ===== 纯函数 =====

/** 从 frontmatter + 整篇 cache 解析出 Task */
function parseTask(file: TFile, fm: any, cache?: any): Task {
  const basename = file.basename;
  // 合并三个 tag 来源：插件 tafs + Obsidian 标准 frontmatter tags + body 内联 #tag
  const tagSet = new Set<string>();
  // 1. 插件的 tafs（数组或单值都行）
  if (Array.isArray(fm.tafs)) {
    fm.tafs.forEach((t: any) => {
      const n = normalizeTag(String(t));
      if (n) tagSet.add(n);
    });
  } else if (typeof fm.tafs === "string" && fm.tafs.trim()) {
    // 单值字符串也支持
    fm.tafs.split(/[,\s]+/).forEach((t: string) => {
      const n = normalizeTag(t);
      if (n) tagSet.add(n);
    });
  }
  // 2. Obsidian 标准的 frontmatter `tags` 字段
  if (Array.isArray(fm.tags)) {
    fm.tags.forEach((t: any) => {
      const n = normalizeTag(String(t));
      if (n) tagSet.add(n);
    });
  } else if (typeof fm.tags === "string" && fm.tags.trim()) {
    fm.tags.split(/[,\s]+/).forEach((t: string) => {
      const n = normalizeTag(t);
      if (n) tagSet.add(n);
    });
  }
  // 3. body 里的内联 #tag（从 metadataCache.tags 拿，每项形如 { tag: "#experiment" }）
  if (cache && Array.isArray(cache.tags)) {
    cache.tags.forEach((t: any) => {
      if (t && typeof t.tag === "string") {
        const n = normalizeTag(t.tag);
        if (n) tagSet.add(n);
      }
    });
  }
  const tags = Array.from(tagSet);
  // 4 态：Doing / Prepare / Done / Abandon，缺省或非法值 → Prepare
  const status: TaskStatus = ALL_STATUSES.includes(fm.Status) ? fm.Status : "Prepare";
  const priority: TaskPriority = ["high", "medium", "low", "none"].includes(fm.Priority)
    ? fm.Priority
    : "none";

  return {
    id: file.path,
    file: file.path,
    basename,
    status,
    priority,
    tags,
    start: typeof fm["Start Date"] === "string" ? normalizeDate(fm["Start Date"]) : undefined,
    completionDate: typeof fm["Completion Date"] === "string" ? normalizeDate(fm["Completion Date"]) : undefined,
    totalSeconds: typeof fm["Time Tracking"] === "string" ? parseHM(fm["Time Tracking"]) : undefined,
    rawFrontmatter: { ...fm },
  };
}

/** 清理 tag：去 #、去空格、转小写 */
function normalizeTag(tag: string): string {
  return tag.replace(/^#+/, "").trim().replace(/\s+/g, "-");
}

/** 规范化日期：取 YYYY-MM-DD 部分 */
function normalizeDate(d: string): string {
  const m = d.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : d;
}

/** "1h 30m" / "45m" / "2h" → 秒 */
function parseHM(s: string): number {
  let total = 0;
  const h = s.match(/(\d+)\s*h/i);
  const m = s.match(/(\d+)\s*m/);
  if (h) total += parseInt(h[1], 10) * 3600;
  if (m) total += parseInt(m[1], 10) * 60;
  return total;
}

/** 秒 → "1h 30m" / "45m" / "2h" */
function formatTotalTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** 渲染 frontmatter 为 YAML 文本（最简版，足够） */
function renderFrontmatter(fm: Record<string, any>): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      for (const item of v) lines.push(`  - ${item}`);
    } else if (typeof v === "string") {
      // 如果包含特殊字符，加引号
      if (/[:#&*!|>'"%@`]/.test(v) || v !== v.trim() || v === "") {
        lines.push(`${k}: "${v.replace(/"/g, '\\"')}"`);
      } else {
        lines.push(`${k}: ${v}`);
      }
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}
