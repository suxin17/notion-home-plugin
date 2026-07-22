// TaskView - 任务管理面板（frontmatter 模式）
//
// UI 主要变化：
//   - 每个任务对应一个 .md 文件，frontmatter 控制元数据
//   - 行内可直接编辑 tag（chip 形式，x 删除）
//   - 行内可直接改日期
//   - 计时器按钮 + 顶部正在计时条
//   - 列表 / 甘特图 切换

import { ItemView, WorkspaceLeaf, TFile } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import React, { useEffect, useMemo, useState } from "react";
import type NotionHomePlugin from "../../main";
import { today, relativeDate } from "../utils/date";
import type { Task, TaskPriority, TaskStatus } from "../types";
import { ALL_STATUSES, STATUS_LABELS } from "../types";
import { GanttView } from "../components/tasks/GanttView";
import { formatHM, formatHMS } from "../services/timeTracker";
import { PriorityEditor } from "../components/tasks/PriorityEditor";
import { DateEditor } from "../components/tasks/DateEditor";
import { StatusCircle } from "../components/tasks/StatusCircle";
import { BoardView } from "../components/tasks/BoardView";
import { TimeAdjustMenu } from "../components/tasks/TimeAdjustMenu";
import { SubTaskList } from "../components/tasks/SubTaskList";
import { parseQuickCapture, mergeTemplateOpts, pickFolderForTemplate } from "../templates/taskTemplates";
import { STAT_RANGES, STAT_RANGE_LABELS, type StatRange } from "../services/timeTracker";
import { StatusPill, PriorityPill, TagChip } from "../components/tasks/Pills";
import { TaskTable } from "../components/tasks/TaskTable";

export const VIEW_TYPE_TASK = "notion-home-tasks";

export class TaskView extends ItemView {
  private root: Root | null = null;
  private plugin: NotionHomePlugin;

  constructor(leaf: WorkspaceLeaf, plugin: NotionHomePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_TASK; }
  getDisplayText(): string { return "Tasks"; }
  getIcon(): string { return "check-square"; }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("notion-tasks-container");
    this.root = createRoot(container);
    this.root.render(<TaskScreen plugin={this.plugin} />);
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}

type FilterStatus = "all" | TaskStatus;
type ViewMode = "list" | "gantt" | "board";

/** 简易 i18n 字典（任务面板用） */
const T: Record<string, { zh: string; en: string }> = {
  searchPlaceholder: { zh: "🔍 搜索任务 / 文件…", en: "🔍 Search tasks / files…" },
  viewList: { zh: "☰ 表格", en: "☰ Table" },
  viewBoard: { zh: "▦ 看板", en: "▦ Board" },
  viewGantt: { zh: "📊 时间线", en: "📊 Timeline" },
  viewListTitle: { zh: "表格视图（Notion 风格）", en: "Table view (Notion style)" },
  viewBoardTitle: { zh: "看板视图", en: "Board view" },
  viewGanttTitle: { zh: "时间线", en: "Timeline" },
  allStatus: { zh: "全部", en: "All" },
  allPriority: { zh: "所有优先级", en: "All priorities" },
  prioHigh: { zh: "🔺 高", en: "🔺 High" },
  prioMedium: { zh: "🔼 中", en: "🔼 Medium" },
  prioLow: { zh: "🔽 低", en: "🔽 Low" },
  allTag: { zh: "所有 tag", en: "All tags" },
  stop: { zh: "停止", en: "Stop" },
  noView: { zh: "Tasks 面板的视图都关了。", en: "All Task views are off." },
  emptyDone: { zh: "还没有完成的任务 ✨", en: "No completed tasks yet ✨" },
  emptyFilter: { zh: "没有匹配的任务，新建一个？", en: "No matching tasks. Create one?" },
  newTaskTitle: { zh: "新任务标题（支持 /exp /paper /task 前缀）", en: "New task title (supports /exp /paper /task prefix)" },
  newNoteFallback: { zh: "新笔记", en: "New note" },
  newTaskBtn: { zh: "➕ 新建任务", en: "➕ New task" },
  newTaskHint: { zh: "创建后自动添加 frontmatter", en: "Auto-adds frontmatter on create" },
  addTagTitle: { zh: "添加 tag", en: "Add tag" },
  addTagPrompt: { zh: "新 tag", en: "New tag" },
  collapseSub: { zh: "收起 sub-task", en: "Collapse sub-tasks" },
  expandSub: { zh: "展开 sub-task", en: "Expand sub-tasks" },
  timing: { zh: "正在计时", en: "Timing now" },
  total: { zh: "累计", en: "Total" },
  ganttClipHint: { zh: "超出当前范围的部分会被裁剪到边界", en: "Bars outside this range are clipped" },
  statusDoing: { zh: "进行中", en: "Doing" },
  statusPrepare: { zh: "待开始", en: "Prepare" },
  statusDone: { zh: "已完成", en: "Done" },
  statusAbandon: { zh: "已放弃", en: "Abandon" },
};
function tt(key: keyof typeof T, lang: "zh" | "en"): string {
  return T[key]?.[lang] ?? T[key]?.zh ?? key;
}

function TaskScreen({ plugin }: { plugin: NotionHomePlugin }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>(plugin.settings.defaultTaskFilter);
  const [filterPriority, setFilterPriority] = useState<TaskPriority | "all">("all");
  const [filterTag, setFilterTag] = useState<string>("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(
    (plugin.settings as any).defaultTaskView || "list"
  );
  // 甘特图的时间范围：本周/本月/本年
  const [ganttRange, setGanttRange] = useState<StatRange>(
    (plugin.settings as any).ganttRangeDefault || "month"
  );
  const [allTags, setAllTags] = useState<string[]>([]);
  // 本地语言 state（订阅 Home 切换）
  const [lang, setLang] = useState<"zh" | "en">(
    (plugin.settings.greetingLanguage as "zh" | "en") || "zh"
  );
  // 展开的 task ids（用于展示 sub-task，跨视图共享）
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // 表格里正在编辑的日期字段
  const [editingDate, setEditingDate] = useState<{ taskId: string; which: "start" | "completionDate" } | null>(null);
  const [, setTick] = useState(0);

  // 订阅语言变化
  useEffect(() => {
    const unsub = plugin.onLanguageChange(() => {
      setLang((plugin.settings.greetingLanguage as "zh" | "en") || "zh");
    });
    return unsub;
  }, [plugin]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const reload = async () => {
      const all = await plugin.taskService.getAllTasks();
      setTasks(all);
      setAllTags(await plugin.taskService.getAllTags());
    };
    reload();
    return plugin.taskService.subscribe(reload);
  }, [plugin]);

  useEffect(() => {
    const unsub = plugin.timeTracker.subscribe(() => setTick((n) => n + 1));
    const id = window.setInterval(() => {
      if (plugin.timeTracker.isRunning()) setTick((n) => n + 1);
    }, 1000);
    return () => {
      unsub();
      window.clearInterval(id);
    };
  }, [plugin]);

  useEffect(() => {
    const mods = plugin.settings.modules.tasks;
    if (viewMode === "list" && !mods.list) {
      setViewMode(mods.gantt ? "gantt" : "list");
    } else if (viewMode === "gantt" && !mods.gantt) {
      setViewMode(mods.list ? "list" : "gantt");
    }
  }, [plugin.settings.modules.tasks, viewMode]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterTag && !t.tags.includes(filterTag)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!t.basename.toLowerCase().includes(q) && !t.file.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filterStatus, filterPriority, filterTag, search]);

  const sorted = useMemo(() => {
    // 排序：Doing > Prepare > Done > Abandon
    const orderStatus: Record<TaskStatus, number> = { Doing: 0, Prepare: 1, Done: 2, Abandon: 3 };
    return [...filtered].sort((a, b) => {
      if (a.status !== b.status) return orderStatus[a.status] - orderStatus[b.status];
      const order: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2, none: 3 };
      if (a.priority !== b.priority) return order[a.priority] - order[b.priority];
      const ad = a.completionDate || "9999-99-99";
      const bd = b.completionDate || "9999-99-99";
      return ad.localeCompare(bd);
    });
  }, [filtered]);

  const counts = useMemo(() => {
    return {
      all: tasks.length,
      Doing: tasks.filter((t) => t.status === "Doing").length,
      Prepare: tasks.filter((t) => t.status === "Prepare").length,
      Done: tasks.filter((t) => t.status === "Done").length,
      Abandon: tasks.filter((t) => t.status === "Abandon").length,
    };
  }, [tasks]);

  // ===== 操作 =====

  const handleToggle = async (t: Task) => {
    // Gantt 视图的 checkbox 切换：在 Doing / Prepare 之间
    await plugin.taskService.toggleStatus(t);
  };

  const handleSetStatus = async (t: Task, s: TaskStatus) => {
    await plugin.taskService.setStatus(t, s);
  };

  const handleAdjustTime = async (t: Task, deltaSec: number) => {
    await plugin.taskService.adjustTime(t, deltaSec);
  };

  const handleSetTime = async (t: Task, totalSec: number) => {
    await plugin.taskService.setTimeTotal(t, totalSec);
  };

  const handleToggleTime = async (task: Task) => {
    if (plugin.timeTracker.isRunning() && plugin.timeTracker.getCurrent()?.taskId === task.id) {
      // 停止
      const entry = plugin.timeTracker.stop();
      if (entry) {
        await plugin.taskService.accumulateTime(task, Math.round(entry.durationMs / 1000));
        await plugin.taskService.clearTimingMark(task);
      }
    } else {
      // 切换：先停旧的
      const oldEntry = plugin.timeTracker.stopIfRunning();
      if (oldEntry) {
        const oldTask = tasks.find((t) => t.file === oldEntry.file);
        if (oldTask) {
          await plugin.taskService.accumulateTime(oldTask, Math.round(oldEntry.durationMs / 1000));
          await plugin.taskService.clearTimingMark(oldTask);
        }
      }
      plugin.timeTracker.start(task);
      await plugin.taskService.markTiming(task, Date.now());
    }
    setTick((n) => n + 1);
  };

  const handleStopCurrent = async () => {
    if (!plugin.timeTracker.isRunning()) return;
    const current = plugin.timeTracker.getCurrent()!;
    const entry = plugin.timeTracker.stop();
    if (entry) {
      const target = tasks.find((t) => t.file === current.file);
      if (target) {
        await plugin.taskService.accumulateTime(target, Math.round(entry.durationMs / 1000));
        await plugin.taskService.clearTimingMark(target);
      }
    }
    setTick((n) => n + 1);
  };

  const handleOpenFile = (path: string) => {
    const f = plugin.app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) plugin.app.workspace.getLeaf().openFile(f);
  };

  const handleAddTag = async (task: Task, tag: string) => {
    await plugin.taskService.addTag(task, tag);
  };

  const handleRemoveTag = async (task: Task, tag: string) => {
    await plugin.taskService.removeTag(task, tag);
  };

  const handleSetPriority = async (task: Task, p: TaskPriority) => {
    await plugin.taskService.setPriority(task, p);
  };

  const handleSetDate = async (task: Task, which: "start" | "completionDate", val: string | null) => {
    await plugin.taskService.setDates(task, which === "start" ? { start: val } : { completionDate: val });
  };

  // 状态循环：Prepare → Doing → Done → Abandon → Prepare
  const handleCycleStatus = async (task: Task) => {
    const order: TaskStatus[] = ["Prepare", "Doing", "Done", "Abandon"];
    const next = order[(order.indexOf(task.status) + 1) % order.length];
    await handleSetStatus(task, next);
  };

  // ===== 新建任务 =====
  const handleCreateTask = async () => {
    const name = window.prompt(tt("newTaskTitle", lang));
    if (!name) return;
    const parsed = parseQuickCapture(name);
    if (parsed && parsed.title && parsed.rawPrefix !== "/note") {
      const tplOpts = mergeTemplateOpts(parsed.template, { start: today() });
      const folder = pickFolderForTemplate(plugin.settings, parsed.template);
      await plugin.taskService.createTask(parsed.title, { ...tplOpts, folder });
    } else if (parsed && parsed.rawPrefix === "/note") {
      // 简单起见，/note 在任务面板里也走 createTask
      await plugin.taskService.createTask(parsed.title || tt("newNoteFallback", lang), { status: "Prepare" });
    } else {
      await plugin.taskService.createTask(name, { status: "Prepare" });
    }
  };

  const noViewEnabled = !plugin.settings.modules.tasks.list && !plugin.settings.modules.tasks.gantt && !plugin.settings.modules.tasks.board;
  const mods = plugin.settings.modules.tasks;
  const hasMultipleViews = [mods.list, mods.board, mods.gantt].filter(Boolean).length > 1;

  return (
    <div className="notion-tasks">
      {(mods.search || mods.filters || (mods.list && mods.gantt)) && (
        <div className="notion-tasks-toolbar">
          {(mods.search || hasMultipleViews) && (
            <div className="notion-tasks-toolbar-top">
              {mods.search && (
                <input
                  className="notion-tasks-search"
                  placeholder={tt("searchPlaceholder", lang)}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
              {hasMultipleViews && (
                <div className="notion-tasks-viewtabs">
                  {mods.list && (
                    <button
                      className={viewMode === "list" ? "active" : ""}
                      onClick={() => setViewMode("list")}
                      title={tt("viewListTitle", lang)}
                    >{tt("viewList", lang)}</button>
                  )}
                  {mods.board && (
                    <button
                      className={viewMode === "board" ? "active" : ""}
                      onClick={() => setViewMode("board")}
                      title={tt("viewBoardTitle", lang)}
                    >{tt("viewBoard", lang)}</button>
                  )}
                  {mods.gantt && (
                    <button
                      className={viewMode === "gantt" ? "active" : ""}
                      onClick={() => setViewMode("gantt")}
                      title={tt("viewGanttTitle", lang)}
                    >{tt("viewGantt", lang)}</button>
                  )}
                </div>
              )}
              {/* 语言切换 */}
              <div className="notion-lang-toggle" style={{ marginLeft: "auto" }}>
                <button
                  className={`notion-lang-btn${lang === "zh" ? " is-active" : ""}`}
                  onClick={async () => {
                    plugin.settings.greetingLanguage = "zh";
                    await plugin.saveSettings();
                    plugin.emitLanguageChange();
                  }}
                  title="切换到中文"
                >中</button>
                <button
                  className={`notion-lang-btn${lang === "en" ? " is-active" : ""}`}
                  onClick={async () => {
                    plugin.settings.greetingLanguage = "en";
                    await plugin.saveSettings();
                    plugin.emitLanguageChange();
                  }}
                  title="Switch to English"
                >EN</button>
              </div>
            </div>
          )}
          {mods.filters && (
            <div className="notion-tasks-filters">
              <button className={filterStatus === "all" ? "active" : ""} onClick={() => setFilterStatus("all")}>{tt("allStatus", lang)} ({counts.all})</button>
              {ALL_STATUSES.map((s) => (
                <button
                  key={s}
                  className={`notion-tasks-status-btn ${filterStatus === s ? "active" : ""}`}
                  style={filterStatus === s ? { background: STATUS_LABELS[s].color, borderColor: STATUS_LABELS[s].color } : {}}
                  onClick={() => setFilterStatus(s)}
                  title={STATUS_LABELS[s].zh}
                >
                  {STATUS_LABELS[s].icon} {STATUS_LABELS[s].zh} ({counts[s]})
                </button>
              ))}
              <span className="notion-tasks-sep">|</span>
              {(["all", "high", "medium", "low"] as const).map((p) => (
                <button
                  key={p}
                  className={filterPriority === p ? "active" : ""}
                  onClick={() => setFilterPriority(p)}
                >
                  {p === "all" ? tt("allPriority", lang) : p === "high" ? tt("prioHigh", lang) : p === "medium" ? tt("prioMedium", lang) : tt("prioLow", lang)}
                </button>
              ))}
              {allTags.length > 0 && (
                <>
                  <span className="notion-tasks-sep">|</span>
                  <select
                    className="notion-tasks-tag-filter"
                    value={filterTag}
                    onChange={(e) => setFilterTag(e.target.value)}
                  >
                    <option value="">{tt("allTag", lang)}</option>
                    {allTags.map((tag) => (
                      <option key={tag} value={tag}>#{tag}</option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {mods.timer && plugin.timeTracker.isRunning() && plugin.timeTracker.getCurrent() && (
        <div className="notion-tasks-timer-banner">
          <span className="notion-tasks-timer-pulse" />
          <span className="notion-tasks-timer-icon">⏱️</span>
          <span className="notion-tasks-timer-text">
            正在计时：<b>{plugin.timeTracker.getCurrent()!.taskText}</b>
          </span>
          <span className="notion-tasks-timer-elapsed">
            {formatHMS(plugin.timeTracker.getElapsedMs())}
          </span>
          <button className="mod-cta" onClick={handleStopCurrent}>{tt("stop", lang)}</button>
        </div>
      )}

      {noViewEnabled ? (
        <div className="notion-tasks-empty-all">🫥<p>{tt("noView", lang)}</p></div>
      ) : viewMode === "board" ? (
        mods.board ? (
          <BoardView
            tasks={sorted}
            app={plugin.app}
            currentTimerTaskId={plugin.timeTracker.getCurrent()?.taskId}
            currentTimerElapsedMs={plugin.timeTracker.getElapsedMs()}
            onSetStatus={handleSetStatus}
            onCreateTask={(s) => plugin.taskService.createTask(lang === "en" ? "New task" : "新任务", { status: s })}
            onToggleTimer={handleToggleTime}
            onAdjustTime={handleAdjustTime}
            onSetTime={handleSetTime}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
            subTaskService={plugin.subTaskService}
            language={lang}
            pomodoroService={plugin.pomodoroService}
            onOpenPomodoroOverlay={() => plugin.openPomodoroOverlay()}
            pomodoroEnabled={mods.pomodoro}
          />
        ) : null
      ) : viewMode === "gantt" ? (
        mods.gantt ? (
          <>
            <div className="notion-gantt-toolbar">
              <div className="notion-stat-tabs" role="tablist" aria-label="时间线范围">
                {STAT_RANGES.map((r) => (
                  <button
                    key={r}
                    role="tab"
                    aria-selected={ganttRange === r}
                    className={`notion-stat-tab${ganttRange === r ? " is-active" : ""}`}
                    onClick={() => setGanttRange(r)}
                    title={
                      r === "week" ? (lang === "en" ? "This Week" : "本周") : r === "month" ? (lang === "en" ? "This Month" : "本月") : (lang === "en" ? "This Year" : "本年")
                    }
                  >
                    {plugin.settings.greetingLanguage === "en"
                      ? STAT_RANGE_LABELS[r].en
                      : STAT_RANGE_LABELS[r].zh}
                  </button>
                ))}
              </div>
              <span className="notion-gantt-hint">
                {tt("ganttClipHint", lang)}
              </span>
            </div>
            <GanttView
              range={ganttRange}
              tasks={sorted}
              app={plugin.app}
              currentTimerTaskId={plugin.timeTracker.getCurrent()?.taskId}
              currentTimerElapsedMs={plugin.timeTracker.getElapsedMs()}
              onSetStatus={handleSetStatus}
              onToggleTimer={handleToggleTime}
              onAdjustTime={handleAdjustTime}
              onSetTime={handleSetTime}
              expandedIds={expandedIds}
              onToggleExpand={toggleExpand}
              subTaskService={plugin.subTaskService}
              language={lang}
              pomodoroService={plugin.pomodoroService}
              onOpenPomodoroOverlay={() => plugin.openPomodoroOverlay()}
              pomodoroEnabled={mods.pomodoro}
            />
          </>
        ) : null
      ) : (
        mods.list && (
          sorted.length === 0 ? (
            <div className="notion-tasks-empty">
              {filterStatus === "Done" ? tt("emptyDone", lang) : tt("emptyFilter", lang)}
            </div>
          ) : (
            <TaskTable
              tasks={sorted}
              app={plugin.app}
              currentTimerTaskId={plugin.timeTracker.getCurrent()?.taskId}
              currentTimerElapsedMs={plugin.timeTracker.getElapsedMs()}
              onSetStatus={handleSetStatus}
              onCycleStatus={handleCycleStatus}
              onSetPriority={handleSetPriority}
              onSetDate={handleSetDate}
              onAddTag={handleAddTag}
              onRemoveTag={handleRemoveTag}
              onToggleTimer={handleToggleTime}
              onAdjustTime={handleAdjustTime}
              onSetTime={handleSetTime}
              expandedIds={expandedIds}
              onToggleExpand={toggleExpand}
              subTaskService={plugin.subTaskService}
              language={lang}
              editingDate={editingDate}
              onEditDate={(taskId, which) => setEditingDate({ taskId, which })}
              onCancelEditDate={() => setEditingDate(null)}
              pomodoroService={plugin.pomodoroService}
              onOpenPomodoroOverlay={() => plugin.openPomodoroOverlay()}
              pomodoroEnabled={mods.pomodoro}
            />
          )
        )
      )}

      {/* 新建任务按钮（替代原来的 add bar） */}
      {mods.addBar && (
        <div className="notion-tasks-add">
          <button className="mod-cta notion-tasks-add-btn" onClick={handleCreateTask}>
            {tt("newTaskBtn", lang)}
          </button>
          <span className="notion-tasks-add-hint">{tt("newTaskHint", lang)}</span>
        </div>
      )}
    </div>
  );
}
