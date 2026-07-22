// TaskTable - Notion 风格表格视图
//
// 真实 <table> 结构：
//   <thead> 固定列名（uppercase 小字灰色）
//   <tbody> 每行 = 一个任务
//     单元格：name / status / priority / start / due / tags / time / action
//   展开行：colspan 全宽，渲染 SubTaskList
//
// 视觉：
//   - 行高 ~40px，hover 浅灰背景
//   - 单元格左右 padding，无可见边框
//   - 选中行：浅 accent 背景
//   - Pill 风格 status / priority / tag
//   - Tags 多行自动换行

import React, { useState } from "react";
import { TFile } from "obsidian";
import { today, relativeDate } from "../../utils/date";
import { formatHM } from "../../services/timeTracker";
import type { Task, TaskStatus, TaskPriority } from "../../types";
import { StatusPill, TagChip } from "./Pills";
import { SubTaskList } from "./SubTaskList";
import { PomodoroButton } from "../pomodoro/PomodoroButton";
import type { SubTaskService } from "../../services/subTaskService";
import type { PomodoroService } from "../../services/pomodoroService";

interface TaskTableProps {
  tasks: Task[];
  app: { vault: any; workspace: any };
  currentTimerTaskId?: string;
  currentTimerElapsedMs?: number;
  onSetStatus: (t: Task, s: TaskStatus) => void | Promise<void>;
  onCycleStatus: (t: Task) => void | Promise<void>;
  onSetPriority: (t: Task, p: TaskPriority) => void | Promise<void>;
  onSetDate: (t: Task, which: "start" | "completionDate", val: string | null) => void | Promise<void>;
  onAddTag: (t: Task, tag: string) => void | Promise<void>;
  onRemoveTag: (t: Task, tag: string) => void | Promise<void>;
  onToggleTimer: (t: Task) => void | Promise<void>;
  onAdjustTime: (t: Task, deltaSec: number) => void | Promise<void>;
  onSetTime: (t: Task, totalSec: number) => void | Promise<void>;
  expandedIds?: Set<string>;
  onToggleExpand?: (id: string) => void;
  subTaskService?: SubTaskService;
  language?: "zh" | "en";
  /** 当前正在编辑的日期字段（用于 inline date input） */
  editingDate?: { taskId: string; which: "start" | "completionDate" } | null;
  onEditDate?: (taskId: string, which: "start" | "completionDate") => void;
  onCancelEditDate?: () => void;
  /** 番茄钟 service（可选；不传则不显示 Pomodoro 列） */
  pomodoroService?: PomodoroService;
  /** 打开 Pomodoro 全屏 overlay */
  onOpenPomodoroOverlay?: () => void;
  /** 是否启用番茄模块（用户设置） */
  pomodoroEnabled?: boolean;
}

// 状态循环
const STATUS_CYCLE: TaskStatus[] = ["Prepare", "Doing", "Done", "Abandon"];

export function TaskTable({
  tasks,
  app,
  currentTimerTaskId,
  currentTimerElapsedMs = 0,
  onSetStatus,
  onCycleStatus,
  onSetPriority,
  onSetDate,
  onAddTag,
  onRemoveTag,
  onToggleTimer,
  onAdjustTime,
  onSetTime,
  expandedIds,
  onToggleExpand,
  subTaskService,
  language = "zh",
  editingDate,
  onEditDate,
  onCancelEditDate,
  pomodoroService,
  onOpenPomodoroOverlay,
  pomodoroEnabled = true,
}: TaskTableProps) {
  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [editingPriority, setEditingPriority] = useState<string | null>(null);

  const openFile = (path: string) => {
    const f = app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) app.workspace.getLeaf().openFile(f);
  };

  const sorted = [...tasks].sort((a, b) => {
    // 进行中的在前，然后按 due 升序
    const aActive = a.status === "Doing" || a.status === "Prepare";
    const bActive = b.status === "Doing" || b.status === "Prepare";
    if (aActive !== bActive) return aActive ? -1 : 1;
    return (a.completionDate || "9999-99-99").localeCompare(b.completionDate || "9999-99-99");
  });

  const labels = {
    expand: language === "en" ? "Expand" : "展开",
    collapse: language === "en" ? "Collapse" : "收起",
    open: language === "en" ? "Open" : "打开",
    name: language === "en" ? "Name" : "名称",
    status: language === "en" ? "Status" : "状态",
    priority: language === "en" ? "Priority" : "优先级",
    start: language === "en" ? "Start" : "开始",
    due: language === "en" ? "Due" : "截止",
    tags: language === "en" ? "Tags" : "标签",
    time: language === "en" ? "Time" : "计时",
    empty: language === "en" ? "No tasks" : "没有任务",
  };

  if (tasks.length === 0) {
    return <div className="notion-task-table-empty">{labels.empty}</div>;
  }

  return (
    <div className="notion-task-table-wrap">
      <table className="notion-task-table">
        <thead>
          <tr>
            <th className="col-expand" />
            <th className="col-name">{labels.name}</th>
            <th className="col-status">{labels.status}</th>
            <th className="col-priority">{labels.priority}</th>
            <th className="col-date">🛫 {labels.start}</th>
            <th className="col-date">📅 {labels.due}</th>
            <th className="col-tags">{labels.tags}</th>
            <th className="col-time">{labels.time}</th>
            {pomodoroService && pomodoroEnabled && (
              <th className="col-pomo">{language === "en" ? "Pomo" : "番茄"}</th>
            )}
            <th className="col-action" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const isExpanded = expandedIds?.has(t.id) || false;
            const isCurrent = currentTimerTaskId === t.id;
            const totalSec = (t.totalSeconds || 0) +
              (isCurrent ? Math.round(currentTimerElapsedMs / 1000) : 0);
            const tf = app.vault.getAbstractFileByPath(t.file);
            const canExpand = !!onToggleExpand && !!subTaskService;
            return (
              <React.Fragment key={t.id}>
                <tr className={`${isCurrent ? "is-timing" : ""} ${isExpanded ? "is-expanded" : ""}`}>
                  {/* expand 按钮 */}
                  <td className="col-expand">
                    {canExpand && (
                      <button
                        className="notion-task-table-expand"
                        onClick={(e) => { e.stopPropagation(); onToggleExpand!(t.id); }}
                        title={isExpanded ? labels.collapse : labels.expand}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? "▾" : "▸"}
                      </button>
                    )}
                  </td>

                  {/* 任务名 */}
                  <td className="col-name">
                    <span
                      className="notion-task-table-name"
                      onClick={() => openFile(t.file)}
                      title={`${t.basename}\n${t.file}`}
                    >
                      {t.basename}
                    </span>
                  </td>

                  {/* Status pill（点击循环） */}
                  <td className="col-status">
                    <StatusPill
                      status={t.status}
                      language={language}
                      onClick={(e) => { e.stopPropagation(); onCycleStatus(t); }}
                    />
                  </td>

                  {/* Priority pill（点击弹菜单） */}
                  <td className="col-priority">
                    {editingPriority === t.id ? (
                      <div className="notion-task-table-prio-menu" onClick={(e) => e.stopPropagation()}>
                        {(["high", "medium", "low", "none"] as TaskPriority[]).map((p) => (
                          <button
                            key={p}
                            className={`notion-prio-option is-${p}`}
                            onClick={async () => {
                              await onSetPriority(t, p);
                              setEditingPriority(null);
                            }}
                          >
                            {p === "high" ? "🔺 高" : p === "medium" ? "🔼 中" : p === "low" ? "🔽 低" : "—"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span
                        className={`notion-pill notion-pill-priority is-${t.priority} is-sm is-clickable`}
                        onClick={(e) => { e.stopPropagation(); setEditingPriority(t.id); }}
                        title={language === "en" ? "Change priority" : "切换优先级"}
                      >
                        {t.priority === "high" ? "🔺 高" : t.priority === "medium" ? "🔼 中" : t.priority === "low" ? "🔽 低" : "—"}
                      </span>
                    )}
                  </td>

                  {/* Start Date */}
                  <td className="col-date">
                    {editingDate?.taskId === t.id && editingDate?.which === "start" ? (
                      <input
                        type="date"
                        autoFocus
                        className="notion-task-table-date-input"
                        defaultValue={t.start || ""}
                        onChange={async (e) => {
                          await onSetDate(t, "start", e.target.value || null);
                          onCancelEditDate?.();
                        }}
                        onBlur={() => onCancelEditDate?.()}
                      />
                    ) : (
                      <span
                        className="notion-task-table-date"
                        onClick={() => onEditDate?.(t.id, "start")}
                        title={t.start || (language === "en" ? "Set start date" : "点设置开始日期")}
                      >
                        {t.start || <span className="notion-task-table-date-empty">—</span>}
                      </span>
                    )}
                  </td>

                  {/* Due Date */}
                  <td className="col-date">
                    {editingDate?.taskId === t.id && editingDate?.which === "completionDate" ? (
                      <input
                        type="date"
                        autoFocus
                        className="notion-task-table-date-input"
                        defaultValue={t.completionDate || ""}
                        onChange={async (e) => {
                          await onSetDate(t, "completionDate", e.target.value || null);
                          onCancelEditDate?.();
                        }}
                        onBlur={() => onCancelEditDate?.()}
                      />
                    ) : (
                      <span
                        className={`notion-task-table-date ${
                          t.completionDate === today() ? "is-today" : ""
                        } ${
                          t.completionDate &&
                          t.completionDate < today() &&
                          (t.status === "Doing" || t.status === "Prepare")
                            ? "is-overdue"
                            : ""
                        }`}
                        onClick={() => onEditDate?.(t.id, "completionDate")}
                        title={t.completionDate || (language === "en" ? "Set due date" : "点设置截止日期")}
                      >
                        {t.completionDate ? (
                          <>
                            {t.completionDate} <span className="muted">· {relativeDate(t.completionDate)}</span>
                          </>
                        ) : (
                          <span className="notion-task-table-date-empty">—</span>
                        )}
                      </span>
                    )}
                  </td>

                  {/* Tags */}
                  <td className="col-tags">
                    <div className="notion-task-table-tags">
                      {t.tags.map((tag) => (
                        <TagChip
                          key={tag}
                          tag={tag}
                          onRemove={(e) => { e.stopPropagation(); onRemoveTag(t, tag); }}
                        />
                      ))}
                      {editingTag === t.id ? (
                        <input
                          autoFocus
                          type="text"
                          className="notion-task-table-tag-input"
                          placeholder={language === "en" ? "tag" : "标签"}
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              const v = tagInput.trim();
                              if (v) await onAddTag(t, v);
                              setTagInput("");
                              setEditingTag(null);
                            } else if (e.key === "Escape") {
                              setTagInput("");
                              setEditingTag(null);
                            }
                          }}
                          onBlur={() => { setTagInput(""); setEditingTag(null); }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <button
                          className="notion-task-table-tag-add"
                          onClick={(e) => { e.stopPropagation(); setEditingTag(t.id); }}
                          title={language === "en" ? "Add tag" : "添加 tag"}
                        >
                          +
                        </button>
                      )}
                    </div>
                  </td>

                  {/* Time + Timer button */}
                  <td className="col-time">
                    {totalSec > 0 ? (
                      <span className={`notion-task-table-time ${isCurrent ? "is-timing" : ""}`}>
                        {isCurrent ? "🔴" : "⏱️"} {formatHM(totalSec * 1000)}
                      </span>
                    ) : (
                      <span className="notion-task-table-time muted">—</span>
                    )}
                  </td>

                  {/* Pomodoro button */}
                  {pomodoroService && pomodoroEnabled && (
                    <td className="col-pomo">
                      <PomodoroButton
                        service={pomodoroService}
                        taskFile={t.file}
                        taskText={t.basename}
                        onOpenOverlay={() => onOpenPomodoroOverlay?.()}
                        language={language}
                        size="sm"
                      />
                    </td>
                  )}

                  {/* Action: timer 按钮 */}
                  <td className="col-action">
                    <button
                      className={`notion-task-table-timer-btn ${isCurrent ? "is-on" : ""}`}
                      onClick={(e) => { e.stopPropagation(); onToggleTimer(t); }}
                      title={isCurrent
                        ? (language === "en" ? "Stop timer" : "停止计时")
                        : (language === "en" ? "Start timer" : "开始计时")}
                    >
                      {isCurrent ? "⏸" : "▶"}
                    </button>
                  </td>
                </tr>

                {/* 展开行：colspan 全宽，渲染 SubTaskList */}
                {isExpanded && subTaskService && tf instanceof TFile && (
                  <tr className="notion-task-table-expanded-row">
                    <td colSpan={pomodoroService && pomodoroEnabled ? 10 : 9}>
                      <SubTaskList
                        file={tf}
                        service={subTaskService}
                        compact
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
