// HabitService - 习惯追踪
//
// 数据模型：
//   - Habit: 用户定义的"习惯"（id / name / icon / color / archived）
//   - Checkin: 某天某习惯的勾选记录（habitId / date / count）
//
// 存储：跟 plugin data 一起（data.json 内的 habits 字段）
//   {
//     habits: Habit[],
//     checkins: Checkin[],
//   }
//
// 不依赖 Obsidian API，纯逻辑。

export interface Habit {
  id: string;          // 稳定 id（slug）
  name: string;        // "阅读论文"
  icon: string;        // "📚"
  color: string;       // "#4f7cff"
  /** 创建日期 YYYY-MM-DD（只用于"加入 N 天"显示） */
  createdAt: string;
  archived?: boolean;
  /** 二值（默认）/ 计数（>=1 次就算完成） */
  mode: "binary" | "count";
  /** 计数模式的目标值（默认 1，超过也算完成；UI 用作参考） */
  target?: number;
}

export interface Checkin {
  habitId: string;
  date: string;        // YYYY-MM-DD
  count: number;       // 当天的次数（binary 模式 0/1）
}

export interface HabitDayStatus {
  date: string;
  /** 每个 habit 这一天是否完成（mode-aware） */
  byHabit: Record<string, boolean>;
  /** 完成的 habit 数 / 总数 */
  done: number;
  total: number;
  /** 完成率 0-1 */
  rate: number;
}

// ============= 工具 ==============

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

const PRESET_COLORS = [
  "#4f7cff", "#4ec9b0", "#7d8aff", "#9d6bdd", "#ec5b8a",
  "#e85d5d", "#9bc158", "#3ebec4", "#b67ad9", "#67b86c",
];

// ============= Service =============

export class HabitService {
  private habits: Habit[] = [];
  private checkins: Checkin[] = [];
  private listeners = new Set<() => void>();

  constructor(habits: Habit[], checkins: Checkin[]) {
    this.habits = Array.isArray(habits) ? habits : [];
    this.checkins = Array.isArray(checkins) ? checkins : [];
  }

  // ===== 订阅 =====

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) {
      try { fn(); } catch { /* ignore */ }
    }
  }

  // ===== 习惯 CRUD =====

  getHabits(includeArchived = false): Habit[] {
    const out = this.habits.slice();
    out.sort((a, b) => {
      if ((a.archived || false) !== (b.archived || false)) {
        return (a.archived ? 1 : 0) - (b.archived ? 1 : 0);
      }
      return a.createdAt.localeCompare(b.createdAt);
    });
    return includeArchived ? out : out.filter((h) => !h.archived);
  }

  getHabit(id: string): Habit | undefined {
    return this.habits.find((h) => h.id === id);
  }

  addHabit(input: { name: string; icon?: string; color?: string; mode?: "binary" | "count"; target?: number }): Habit {
    const id = slugify(input.name) || `habit-${Date.now()}`;
    const usedColors = new Set(this.habits.map((h) => h.color));
    let color = input.color || PRESET_COLORS.find((c) => !usedColors.has(c)) || PRESET_COLORS[this.habits.length % PRESET_COLORS.length];
    const habit: Habit = {
      id,
      name: input.name,
      icon: input.icon || "✅",
      color,
      createdAt: todayStr(),
      mode: input.mode || "binary",
      target: input.target,
    };
    this.habits.push(habit);
    this.notify();
    return habit;
  }

  updateHabit(id: string, patch: Partial<Habit>): boolean {
    const h = this.habits.find((x) => x.id === id);
    if (!h) return false;
    Object.assign(h, patch);
    this.notify();
    return true;
  }

  removeHabit(id: string): boolean {
    const idx = this.habits.findIndex((x) => x.id === id);
    if (idx < 0) return false;
    this.habits.splice(idx, 1);
    this.checkins = this.checkins.filter((c) => c.habitId !== id);
    this.notify();
    return true;
  }

  archiveHabit(id: string, archived = true): boolean {
    return this.updateHabit(id, { archived });
  }

  // ===== 打卡 =====

  /** 切换某天的打卡（binary 模式 0→1 / 1→0） */
  toggle(habitId: string, date: string = todayStr()): boolean {
    const habit = this.getHabit(habitId);
    if (!habit) return false;
    const existing = this.checkins.find((c) => c.habitId === habitId && c.date === date);
    if (existing) {
      if (habit.mode === "binary" || (existing.count >= 1 && habit.mode === "count")) {
        // 取消勾选
        this.checkins = this.checkins.filter((c) => c !== existing);
      } else {
        existing.count = 1;
      }
    } else {
      this.checkins.push({ habitId, date, count: 1 });
    }
    this.notify();
    return true;
  }

  /** 计数模式增加一次 */
  increment(habitId: string, date: string = todayStr()): boolean {
    const habit = this.getHabit(habitId);
    if (!habit) return false;
    const existing = this.checkins.find((c) => c.habitId === habitId && c.date === date);
    if (existing) {
      existing.count += 1;
    } else {
      this.checkins.push({ habitId, date, count: 1 });
    }
    this.notify();
    return true;
  }

  /** 设置绝对值 */
  setCount(habitId: string, date: string, count: number): boolean {
    const habit = this.getHabit(habitId);
    if (!habit) return false;
    const existing = this.checkins.find((c) => c.habitId === habitId && c.date === date);
    if (count <= 0) {
      if (existing) this.checkins = this.checkins.filter((c) => c !== existing);
    } else if (existing) {
      existing.count = count;
    } else {
      this.checkins.push({ habitId, date, count });
    }
    this.notify();
    return true;
  }

  getCheckin(habitId: string, date: string): Checkin | undefined {
    return this.checkins.find((c) => c.habitId === habitId && c.date === date);
  }

  // ===== 视图数据 =====

  /** 今天每个 habit 的状态 */
  getTodayStatus(): HabitDayStatus {
    return this.getDateStatus(todayStr());
  }

  getDateStatus(date: string): HabitDayStatus {
    const active = this.getHabits(false);
    const byHabit: Record<string, boolean> = {};
    let done = 0;
    for (const h of active) {
      const c = this.getCheckin(h.id, date);
      const ok = h.mode === "binary" ? (c ? c.count > 0 : false) : (c ? c.count >= (h.target || 1) : false);
      byHabit[h.id] = ok;
      if (ok) done += 1;
    }
    return {
      date,
      byHabit,
      done,
      total: active.length,
      rate: active.length > 0 ? done / active.length : 0,
    };
  }

  /** 过去 N 天的 HabitDayStatus（按日期升序） */
  getLastDays(days: number): HabitDayStatus[] {
    const out: HabitDayStatus[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      out.push(this.getDateStatus(isoDate(d)));
    }
    return out;
  }

  /** 计算某个 habit 的连续天数（streak） */
  getHabitStreak(habitId: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let streak = 0;
    const cursor = new Date(today);
    // 如果今天没打卡，从昨天开始
    const todayC = this.getCheckin(habitId, todayStr());
    if (!todayC || todayC.count === 0) cursor.setDate(cursor.getDate() - 1);
    for (let i = 0; i < 365; i++) {
      const iso = isoDate(cursor);
      const c = this.getCheckin(habitId, iso);
      if (c && c.count > 0) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  // ===== 持久化 =====

  serialize(): { habits: Habit[]; checkins: Checkin[] } {
    return {
      habits: this.habits,
      checkins: this.checkins,
    };
  }
}

// ============= helpers =============

function slugify(s: string): string {
  return s.trim().toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}
