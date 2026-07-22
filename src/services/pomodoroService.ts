// PomodoroService - 番茄钟状态机
//
// 行为：
//   - 4 个状态：idle / focus / shortBreak / longBreak
//   - 每次 focus 完成 +1 到今天的 pomodoro 计数
//   - 每完成 N 个 focus 自动进入 longBreak
//   - focus 开始时自动把 TimeTracker 启动到关联 task
//   - focus 结束时自动把 TimeTracker 停止
//   - 状态持久化：写到 data.json（plugin settings 一起存）
//
// 不依赖 Obsidian API，纯逻辑 + setTimeout 调度。

export type PomodoroPhase = "idle" | "focus" | "shortBreak" | "longBreak";

export interface PomodoroConfig {
  focusMinutes: number;        // 单个 focus 长度（默认 25）
  shortBreakMinutes: number;   // 短休长度（默认 5）
  longBreakMinutes: number;    // 长休长度（默认 15）
  longBreakEvery: number;      // 每完成几个 focus 后长休（默认 4）
  autoStartBreak: boolean;     // focus 完了自动进 break（默认 true）
  autoStartFocus: boolean;     // break 完了自动进下一个 focus（默认 false）
  /** 完成多少秒 focus 才算"有效"（防止太短的会话污染统计） */
  minEffectiveSeconds: number; // 默认 60
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  longBreakEvery: 4,
  autoStartBreak: true,
  autoStartFocus: false,
  minEffectiveSeconds: 60,
};

export interface PomodoroState {
  phase: PomodoroPhase;
  /** 当前阶段剩余毫秒（不在跑时 = 0） */
  remainingMs: number;
  /** 当前阶段的开始时间戳（ms）；idle 时 = 0 */
  phaseStartedAt: number;
  /** 当前阶段总时长（ms） */
  phaseDurationMs: number;
  /** 关联的任务（focus 阶段会往这个 task 写时间） */
  linkedTaskFile: string | null;
  linkedTaskText: string | null;
  /** 今日完成的 pomodoro 数（跨过午夜的清零由外部 caller 在 new day 检测） */
  todayCount: number;
  todayDate: string; // YYYY-MM-DD（用来检测跨天）
  /** 当前 cycle 已完成的 focus 数（达到 longBreakEvery 进 longBreak） */
  focusInCycle: number;
}

export interface PomodoroRecord {
  date: string;       // YYYY-MM-DD
  count: number;      // 当天完成的 focus 数（一个 focus = 一个 pomodoro）
  totalFocusSeconds: number; // 当天累计 focus 秒数
}

export const DEFAULT_POMODORO_STATE: PomodoroState = {
  phase: "idle",
  remainingMs: 0,
  phaseStartedAt: 0,
  phaseDurationMs: 0,
  linkedTaskFile: null,
  linkedTaskText: null,
  todayCount: 0,
  todayDate: "",
  focusInCycle: 0,
};

export const PHASE_LABELS: Record<PomodoroPhase, { zh: string; en: string; icon: string }> = {
  idle:       { zh: "未开始", en: "Idle",       icon: "🍅" },
  focus:      { zh: "专注中", en: "Focus",      icon: "🎯" },
  shortBreak: { zh: "短休",   en: "Short break", icon: "☕" },
  longBreak:  { zh: "长休",   en: "Long break", icon: "🌿" },
};

// ============= 工具 ==============

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

// ============= Service =============

export type PomodoroTickCallback = (state: PomodoroState) => void;
export type PomodoroPhaseEndCallback = (endedPhase: PomodoroPhase, nextPhase: PomodoroPhase, completedTaskFile: string | null) => void;

export class PomodoroService {
  private config: PomodoroConfig;
  private state: PomodoroState;
  private records: PomodoroRecord[] = [];
  private intervalId: number | null = null;
  private tickListeners = new Set<PomodoroTickCallback>();
  private phaseEndListeners = new Set<PomodoroPhaseEndCallback>();
  /** phase 结束后的 callback（外部注册，用于停 timeTracker、通知等） */
  public onPhaseEnd: ((ended: PomodoroPhase, next: PomodoroPhase, linkedFile: string | null) => void) | null = null;
  /** phase 结束 + 即将开始下一个 phase 前的 hook，外部注册（用于开始 timeTracker） */
  public onPhaseStart: ((phase: PomodoroPhase, linkedFile: string | null) => void) | null = null;

  constructor(config: PomodoroConfig, state: PomodoroState, records: PomodoroRecord[]) {
    this.config = { ...DEFAULT_POMODORO_CONFIG, ...config };
    this.state = { ...DEFAULT_POMODORO_STATE, ...state };
    this.records = Array.isArray(records) ? records : [];
    // 如果恢复时正在跑某个 phase，重新启动 tick
    if (this.state.phase !== "idle" && this.state.phaseStartedAt > 0) {
      // 重新计算 remainingMs（考虑过的那段时间）
      const elapsed = Date.now() - this.state.phaseStartedAt;
      const newRemaining = this.state.phaseDurationMs - elapsed;
      if (newRemaining <= 0) {
        // 早就该结束
        this.handlePhaseEnd();
      } else {
        this.state.remainingMs = newRemaining;
        this.startTickLoop();
      }
    }
  }

  // ===== 配置 =====

  getConfig(): PomodoroConfig { return { ...this.config }; }
  setConfig(patch: Partial<PomodoroConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  // ===== 状态 =====

  getState(): PomodoroState { return { ...this.state }; }
  getRecords(): PomodoroRecord[] { return this.records.slice(); }

  getTodayCount(): number {
    const t = todayStr();
    if (this.state.todayDate !== t) return 0;
    return this.state.todayCount;
  }

  /** 总累计 focus 数（所有时间） */
  getTotalCount(): number {
    return this.records.reduce((sum, r) => sum + r.count, 0);
  }

  /** 过去 N 天的 focus 数（含今天） */
  getCountForLastDays(days: number): { date: string; count: number }[] {
    const out: { date: string; count: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const iso = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
      const rec = this.records.find((r) => r.date === iso);
      out.push({ date: iso, count: rec ? rec.count : 0 });
    }
    return out;
  }

  // ===== 订阅 =====

  onTick(cb: PomodoroTickCallback): () => void {
    this.tickListeners.add(cb);
    return () => this.tickListeners.delete(cb);
  }

  onPhase(cb: PomodoroPhaseEndCallback): () => void {
    this.phaseEndListeners.add(cb);
    return () => this.phaseEndListeners.delete(cb);
  }

  private notifyTick(): void {
    for (const fn of this.tickListeners) {
      try { fn(this.getState()); } catch { /* ignore */ }
    }
  }

  private notifyPhaseEnd(ended: PomodoroPhase, next: PomodoroPhase, linkedFile: string | null): void {
    for (const fn of this.phaseEndListeners) {
      try { fn(ended, next, linkedFile); } catch { /* ignore */ }
    }
    if (this.onPhaseEnd) {
      try { this.onPhaseEnd(ended, next, linkedFile); } catch { /* ignore */ }
    }
  }

  // ===== 控制 =====

  /**
   * 开始一个 focus 会话，关联到 task（可选）
   * - 如果已经在跑某个 phase，直接返回 false
   * - 如果没传 task，就是"无任务专注"
   */
  startFocus(taskFile: string | null = null, taskText: string | null = null): boolean {
    if (this.state.phase !== "idle") return false;
    this.crossDayCheck();

    const durationMs = this.config.focusMinutes * 60 * 1000;
    this.state.phase = "focus";
    this.state.phaseDurationMs = durationMs;
    this.state.phaseStartedAt = Date.now();
    this.state.remainingMs = durationMs;
    this.state.linkedTaskFile = taskFile;
    this.state.linkedTaskText = taskText;

    this.startTickLoop();
    if (this.onPhaseStart) {
      try { this.onPhaseStart("focus", taskFile); } catch { /* ignore */ }
    }
    return true;
  }

  /** 停止当前 phase（用户手动中止） */
  stop(): void {
    if (this.state.phase === "idle") return;
    this.stopTickLoop();
    const endedPhase = this.state.phase;
    const linkedFile = this.state.linkedTaskFile;

    // 如果中止时是 focus 并且已经积累了一些时间，可以选择是否计入统计
    // 简单策略：少于 minEffectiveSeconds 不计；超过的写进 records
    if (endedPhase === "focus") {
      const elapsedSec = Math.floor((Date.now() - this.state.phaseStartedAt) / 1000);
      if (elapsedSec >= this.config.minEffectiveSeconds) {
        // 不算完成的 pomodoro（因为没到 focus 结束），但记 focus 时间
        this.recordFocusTime(elapsedSec, false);
      }
    }

    this.state.phase = "idle";
    this.state.remainingMs = 0;
    this.state.phaseStartedAt = 0;
    this.state.phaseDurationMs = 0;
    this.state.linkedTaskFile = null;
    this.state.linkedTaskText = null;
    this.notifyTick();

    if (this.onPhaseStart) {
      try { this.onPhaseStart("idle", null); } catch { /* ignore */ }
    }
    // 把 stopped 当作一个 phase 结束事件（next = idle）
    this.notifyPhaseEnd(endedPhase, "idle", linkedFile);
  }

  /** 跳过当前 break，进入下一个 focus */
  skipBreak(): void {
    if (this.state.phase !== "shortBreak" && this.state.phase !== "longBreak") return;
    this.handlePhaseEnd();
  }

  // ===== 内部 tick =====

  private startTickLoop(): void {
    if (this.intervalId !== null) return;
    this.intervalId = window.setInterval(() => {
      if (this.state.phase === "idle" || this.state.phaseStartedAt === 0) {
        this.stopTickLoop();
        return;
      }
      const elapsed = Date.now() - this.state.phaseStartedAt;
      const newRemaining = this.state.phaseDurationMs - elapsed;
      if (newRemaining <= 0) {
        this.state.remainingMs = 0;
        this.notifyTick();
        this.handlePhaseEnd();
      } else {
        this.state.remainingMs = newRemaining;
        this.notifyTick();
      }
    }, 1000);
  }

  private stopTickLoop(): void {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private crossDayCheck(): void {
    const t = todayStr();
    if (this.state.todayDate !== t) {
      this.state.todayDate = t;
      this.state.todayCount = 0;
      this.state.focusInCycle = 0;
    }
  }

  /** 当前 phase 自然结束，处理过渡 */
  private handlePhaseEnd(): void {
    const endedPhase = this.state.phase;
    const linkedFile = this.state.linkedTaskFile;
    this.stopTickLoop();

    let nextPhase: PomodoroPhase = "idle";

    if (endedPhase === "focus") {
      // 完成一个 pomodoro
      this.crossDayCheck();
      const elapsedSec = Math.floor(this.state.phaseDurationMs / 1000);
      this.state.todayCount += 1;
      this.state.focusInCycle += 1;
      this.recordFocusTime(elapsedSec, true);

      // 决定下一个 phase
      if (this.state.focusInCycle >= this.config.longBreakEvery) {
        nextPhase = "longBreak";
        this.state.focusInCycle = 0;
      } else {
        nextPhase = "shortBreak";
      }
    } else if (endedPhase === "shortBreak" || endedPhase === "longBreak") {
      // 休息结束，下一个 focus（如果 autoStartFocus）否则 idle
      if (this.config.autoStartFocus && linkedFile) {
        nextPhase = "focus";
      } else {
        nextPhase = "idle";
      }
    }

    this.state.phase = nextPhase;
    this.notifyPhaseEnd(endedPhase, nextPhase, linkedFile);

    if (nextPhase === "idle") {
      this.state.remainingMs = 0;
      this.state.phaseStartedAt = 0;
      this.state.phaseDurationMs = 0;
      this.state.linkedTaskFile = null;
      this.state.linkedTaskText = null;
    } else {
      const minutes = nextPhase === "focus"
        ? this.config.focusMinutes
        : nextPhase === "shortBreak"
          ? this.config.shortBreakMinutes
          : this.config.longBreakMinutes;
      const durationMs = minutes * 60 * 1000;
      this.state.phase = nextPhase;
      this.state.phaseDurationMs = durationMs;
      this.state.phaseStartedAt = Date.now();
      this.state.remainingMs = durationMs;
      // 休息阶段不关联任务
      if (nextPhase === "shortBreak" || nextPhase === "longBreak") {
        // 保持 linkedTaskFile 不变，break 结束后可能复用
      }
      this.startTickLoop();
    }

    if (this.onPhaseStart) {
      try { this.onPhaseStart(nextPhase, this.state.linkedTaskFile); } catch { /* ignore */ }
    }
    this.notifyTick();
  }

  /** 把 focus 时间写进 records */
  private recordFocusTime(elapsedSec: number, completed: boolean): void {
    const date = todayStr();
    let rec = this.records.find((r) => r.date === date);
    if (!rec) {
      rec = { date, count: 0, totalFocusSeconds: 0 };
      this.records.push(rec);
    }
    if (completed) rec.count += 1;
    rec.totalFocusSeconds += elapsedSec;
  }

  // ===== 持久化 =====

  serialize(): { config: PomodoroConfig; state: PomodoroState; records: PomodoroRecord[] } {
    return {
      config: this.config,
      state: this.state,
      records: this.records,
    };
  }
}
