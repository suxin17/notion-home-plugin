// TimeTracker：任务计时服务
//
// 行为：
//   - start(task)：开始计时。如果当前有别的任务在计时，先 stop()。
//   - stop()：结束当前计时，累加到 log。返回刚结束的 entry（或 null）。
//   - stopIfRunning()：仅当有时才 stop（用于 plugin unload / Obsidian 关闭）。
//   - toggle(task)：start/stop 切换。
//   - getCurrent()：当前在计时的任务。
//   - getElapsedMs()：当前任务已计时的毫秒数。
//   - 持久化：外部（main.ts）通过 setLog / getLog 加载/保存 data.json。
//
// 计时中不写文件，避免每秒 IO。仅在 stop 时才把累计时间回写到任务的 ⏱️ 标记。

import type { Task, TimeLogEntry, HeatmapCell } from "../types";

export interface CurrentTimer {
  file: string;
  taskId: string;
  taskText: string;
  startedAt: number;
}

// ===== 统计周期 =====

/** 统计周期：本周 / 本月 / 本年（共享给 PieChart 和 Heatmap） */
export type StatRange = "week" | "month" | "year";

export const STAT_RANGES: StatRange[] = ["week", "month", "year"];

export const STAT_RANGE_LABELS: Record<StatRange, { zh: string; en: string; short: string }> = {
  week:  { zh: "本周", en: "This Week",  short: "周" },
  month: { zh: "本月", en: "This Month", short: "月" },
  year:  { zh: "本年", en: "This Year",  short: "年" },
};

export interface StatRangeInfo {
  /** 范围起点（含） */
  start: Date;
  /** 范围终点（含） */
  end: Date;
  /** 在热力图上需要显示的周数（对齐到整周） */
  weeks: number;
  /** 热力图网格起点（可能早于 start 1-6 天） */
  gridStart: Date;
  /** 热力图网格终点（可能晚于 end 1-6 天） */
  gridEnd: Date;
  range: StatRange;
  label: { zh: string; en: string; short: string };
}

/** 把"今天所在的那天"对齐到周一（周一=0，周日=6） */
function daysFromMonday(d: Date): number {
  const dow = d.getDay(); // 0=Sun
  return (dow + 6) % 7;
}

/**
 * 计算某个 StatRange 的时间区间 + 热力图网格尺寸
 * - week:  本周一 → 本周日（1 周 = 7 cells）
 * - month: 本月 1 号 → 本月最后一天所在的周对齐（4-6 周）
 * - year:  本年 1/1 → 本年 12/31 所在的周对齐（52-53 周）
 */
export function getStatRange(range: StatRange, anchor: Date = new Date()): StatRangeInfo {
  const a = new Date(anchor);
  a.setHours(0, 0, 0, 0);

  if (range === "week") {
    const start = new Date(a);
    start.setDate(a.getDate() - daysFromMonday(a));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return {
      start,
      end,
      weeks: 1,
      gridStart: start,
      gridEnd: end,
      range,
      label: STAT_RANGE_LABELS[range],
    };
  }

  if (range === "month") {
    const start = new Date(a.getFullYear(), a.getMonth(), 1);
    const end = new Date(a.getFullYear(), a.getMonth() + 1, 0);
    const gridStart = new Date(start);
    gridStart.setDate(start.getDate() - daysFromMonday(start));
    const gridEnd = new Date(end);
    gridEnd.setDate(end.getDate() + (6 - daysFromMonday(end)));
    const diffMs = gridEnd.getTime() - gridStart.getTime();
    const weeks = Math.round(diffMs / (7 * 24 * 3600 * 1000)) + 1;
    return {
      start,
      end,
      weeks,
      gridStart,
      gridEnd,
      range,
      label: STAT_RANGE_LABELS[range],
    };
  }

  // year
  const start = new Date(a.getFullYear(), 0, 1);
  const end = new Date(a.getFullYear(), 11, 31);
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - daysFromMonday(start));
  const diffMs = end.getTime() - gridStart.getTime();
  const weeks = Math.round(diffMs / (7 * 24 * 3600 * 1000)) + 1;
  return {
    start,
    end,
    weeks,
    gridStart,
    gridEnd: end,
    range,
    label: STAT_RANGE_LABELS[range],
  };
}

/** 过滤 timeLog：只保留 range 内的 entry（按 entry.start 的日期判断） */
export function filterLogByRange(log: TimeLogEntry[], range: StatRangeInfo): TimeLogEntry[] {
  const startMs = range.start.getTime();
  const endMs = range.end.getTime() + 24 * 3600 * 1000 - 1; // 含 end 当天 23:59:59
  return log.filter((e) => e.start >= startMs && e.start <= endMs);
}

export class TimeTracker {
  private log: TimeLogEntry[] = [];
  private current: CurrentTimer | null = null;
  private listeners = new Set<() => void>();

  // ===== 持久化（外部调用） =====

  setLog(log: TimeLogEntry[]): void {
    this.log = Array.isArray(log) ? log : [];
  }

  getLog(): TimeLogEntry[] {
    return this.log;
  }

  // ===== 订阅 =====

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  // ===== 状态查询 =====

  isRunning(): boolean {
    return this.current !== null;
  }

  getCurrent(): CurrentTimer | null {
    return this.current;
  }

  /** 当前任务已计时的毫秒数（如果没在跑就是 0） */
  getElapsedMs(): number {
    if (!this.current) return 0;
    return Date.now() - this.current.startedAt;
  }

  /** 指定任务累计已计时（log 中所有相关 entry + 当前如果正在跑） */
  getTaskTotalMs(file: string): number {
    let total = 0;
    for (const e of this.log) {
      if (e.file === file) total += e.durationMs;
    }
    if (this.current && this.current.file === file) {
      total += this.getElapsedMs();
    }
    return total;
  }

  // ===== 控制 =====

  start(task: Task): void {
    // 切换前先停止当前
    if (this.current) {
      this.stop();
    }
    this.current = {
      file: task.file,
      taskId: task.id,
      taskText: task.basename,
      startedAt: Date.now(),
    };
    this.notify();
  }

  /** 切换：正在跑同一任务 → 停止；其他情况 → 开始 */
  toggle(task: Task): boolean {
    if (this.current && this.current.taskId === task.id) {
      this.stop();
      return false; // 停止
    }
    this.start(task);
    return true; // 开始
  }

  stop(): TimeLogEntry | null {
    if (!this.current) return null;
    const end = Date.now();
    const entry: TimeLogEntry = {
      date: this.isoDate(new Date(this.current.startedAt)),
      file: this.current.file,
      taskText: this.current.taskText,
      start: this.current.startedAt,
      end,
      durationMs: end - this.current.startedAt,
    };
    if (entry.durationMs >= 1000) {
      this.log.push(entry);
    }
    this.current = null;
    this.notify();
    return entry.durationMs >= 1000 ? entry : null;
  }

  /** 静默停止（plugin unload 时调用），不通知避免 UI 闪烁 */
  stopIfRunning(): TimeLogEntry | null {
    if (!this.current) return null;
    const end = Date.now();
    const entry: TimeLogEntry = {
      date: this.isoDate(new Date(this.current.startedAt)),
      file: this.current.file,
      taskText: this.current.taskText,
      start: this.current.startedAt,
      end,
      durationMs: end - this.current.startedAt,
    };
    if (entry.durationMs >= 1000) {
      this.log.push(entry);
    }
    this.current = null;
    return entry.durationMs >= 1000 ? entry : null;
  }

  // ===== 统计 / 热力图 =====

  /** 聚合每天的总毫秒数 */
  getDailyTotals(): Map<string, number> {
    const map = new Map<string, number>();
    for (const e of this.log) {
      map.set(e.date, (map.get(e.date) || 0) + e.durationMs);
    }
    // 加上当前计时
    if (this.current) {
      const todayStr = this.isoDate(new Date(this.current.startedAt));
      map.set(todayStr, (map.get(todayStr) || 0) + this.getElapsedMs());
    }
    return map;
  }

  /** 生成最近 N 天的热力图数据（7 行 x N 列，按周对齐） */
  getHeatmap(weeks: number): { cells: HeatmapCell[]; weeks: number; maxSeconds: number } {
    const totalDays = weeks * 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daily = this.getDailyTotals();

    // 找到今天所在周的周日（往前推到周日），再往前推 weeks-1 周 = 起点
    const startOfThisWeek = new Date(today);
    const dow = startOfThisWeek.getDay(); // 0=Sun
    startOfThisWeek.setDate(startOfThisWeek.getDate() - dow);
    const start = new Date(startOfThisWeek);
    start.setDate(start.getDate() - (weeks - 1) * 7);

    const cells: HeatmapCell[] = [];
    let maxSeconds = 0;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      const iso = this.isoDate(d);
      const seconds = Math.round((daily.get(iso) || 0) / 1000);
      if (seconds > maxSeconds) maxSeconds = seconds;
      cells.push({ date: iso, seconds, level: 0 });
    }
    // 二次扫描：基于 maxSeconds 算 level
    for (const c of cells) {
      c.level = levelFor(c.seconds, maxSeconds);
    }
    return { cells, weeks, maxSeconds };
  }

  /**
   * 按 StatRange 生成热力图数据
   * - week  → 1 周（7 cells）
   * - month → 5-6 周（35-42 cells）
   * - year  → 52-53 周（364-371 cells）
   *
   * 返回的 cells 覆盖整个 gridStart..gridEnd 范围（按周对齐）。
   * 范围外的格子用 inRange=false 标记，UI 可以 dim 处理。
   */
  getHeatmapForRange(range: StatRange, anchor?: Date): {
    cells: HeatmapCell[];
    weeks: number;
    maxSeconds: number;
    rangeInfo: StatRangeInfo;
  } {
    const rangeInfo = getStatRange(range, anchor);
    const { gridStart, gridEnd, weeks, start, end } = rangeInfo;
    const totalDays = weeks * 7;
    const daily = this.getDailyTotals();

    const startMs = start.getTime();
    const endMs = end.getTime() + 24 * 3600 * 1000 - 1;

    const cells: HeatmapCell[] = [];
    let maxSeconds = 0;
    for (let i = 0; i < totalDays; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const iso = this.isoDate(d);
      const dayMs = d.getTime();
      const inRange = dayMs >= startMs && dayMs <= endMs;
      const seconds = inRange ? Math.round((daily.get(iso) || 0) / 1000) : 0;
      if (seconds > maxSeconds) maxSeconds = seconds;
      cells.push({ date: iso, seconds, level: 0, inRange } as HeatmapCell & { inRange: boolean });
    }
    for (const c of cells) {
      c.level = levelFor(c.seconds, maxSeconds);
    }
    return { cells, weeks, maxSeconds, rangeInfo };
  }

  // ===== 连续打卡（Streak）=====

  /**
   * 连续工作天数（今天也算，如果今天有计时）
   * - 阈值：每天累计 ≥ minSeconds (默认 60) 才算"打卡"
   * - 跨天：从今天往回数，每天都得达标；遇到第一个不达标的日期就停
   * - 如果今天还没达标，从昨天开始数（保持连续记录不断）
   */
  getStreak(minSeconds: number = 60): { current: number; best: number; todayActive: boolean } {
    const daily = this.getDailyTotals();
    let best = 0;
    let run = 0;

    // 先算 best（全历史最长连续）
    const allDates = Array.from(daily.keys()).sort();
    for (const d of allDates) {
      const sec = Math.round((daily.get(d) || 0) / 1000);
      if (sec >= minSeconds) {
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }

    // 算 current（从今天往回数）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = this.isoDate(today);
    const todaySec = Math.round((daily.get(todayIso) || 0) / 1000);
    const todayActive = todaySec >= minSeconds;

    let current = 0;
    const cursor = new Date(today);
    // 如果今天没达标，往回退一天再开始数（保持连续）
    if (!todayActive) {
      cursor.setDate(cursor.getDate() - 1);
    }
    // 一直往回走，遇到第一个不达标的日期就停
    for (let i = 0; i < 365 * 5; i++) { // 最多 5 年保险
      const iso = this.isoDate(cursor);
      const sec = Math.round((daily.get(iso) || 0) / 1000);
      if (sec >= minSeconds) {
        current += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }

    return { current, best: Math.max(best, current), todayActive };
  }

  // ===== 工具 =====

  /**
   * 手动加时间（不通过真实 timer）
   * - 来自 TimeAdjustMenu 的 +/-15m 按钮
   * - 记到 log 里，让 heatmap / pie 也跟着反映
   * - 默认归属到今天；可以传 date 改归属
   */
  addManualEntry(task: Task, seconds: number, date?: string): void {
    if (seconds === 0 || !task) return;
    const dateStr = date || this.isoDate(new Date());
    // 用当天中午作为时间戳（保证 heatmap 能归到正确日期，不受时区影响）
    const baseTs = new Date(`${dateStr}T12:00:00`).getTime();
    // 正负时间用不同区间（正=baseTs+1, 负=baseTs-1），避免 start==end 触发 0 duration
    const start = seconds > 0 ? baseTs : baseTs - Math.abs(seconds) * 1000;
    const durationMs = Math.abs(seconds) * 1000;
    if (durationMs < 1000) return; // 太短不入 log
    this.log.push({
      date: dateStr,
      file: task.file,
      taskText: task.basename,
      start,
      end: start + durationMs,
      durationMs,
    });
    this.notify();
  }

  private isoDate(d: Date): string {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
}

/** 把秒数映射到 0-4 颜色等级 */
export function levelFor(seconds: number, maxSeconds: number): 0 | 1 | 2 | 3 | 4 {
  if (seconds <= 0) return 0;
  if (maxSeconds <= 0) return 1;
  const ratio = seconds / maxSeconds;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

/** 毫秒转 Xh Ym（≤1h 显示 Xm） */
export function formatHM(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** 毫秒转 HH:MM:SS（用于实时显示） */
export function formatHMS(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
