// BoardView - 看板视图
//
// 行为：
//   - 按 status 分列（Prepare / Abandon / Doing / Done）
//   - 每列下面是该状态的任务卡片
//   - 卡片显示：标题、日期、tag、计时
//   - "+ New task" 按钮（每列底部）
//   - 卡片显示轻边框 + hover 阴影
//   - **拖拽支持**：把卡片拖到别的列 = 改状态（自动写 frontmatter）
//   - **展开 sub-task**：每张卡可以展开/收起内联的 sub-task 列表
//   - Notion 风格：圆角 6px、内边距 12px、灰背景列

import React, { useMemo, useState } from "react";
import { TFile } from "obsidian";
import { today, relativeDate } from "../../utils/date";
import type { Task, TaskStatus } from "../../types";
import { ALL_STATUSES, STATUS_LABELS } from "../../types";
import { StatusCircle } from "./StatusCircle";
import { TimeAdjustMenu } from "./TimeAdjustMenu";
import { SubTaskList } from "./SubTaskList";
import type { SubTaskService } from "../../services/subTaskService";

interface BoardViewProps {
  tasks: Task[];
  app: { vault: any; workspace: any };
  /** 当前正在计时的 task id */
  currentTimerTaskId?: string;
  /** 当前计时任务已计毫秒（实时） */
  currentTimerElapsedMs?: number;
  onSetStatus: (t: Task, s: TaskStatus) => void | Promise<void>;
  onCreateTask: (status: TaskStatus) => void;
  onToggleTimer: (t: Task) => void | Promise<void>;
  onAdjustTime: (t: Task, deltaSec: number) => void | Promise<void>;
  onSetTime: (t: Task, totalSec: number) => void | Promise<void>;
  /** 已展开的 task ids（外部状态） */
  expandedIds?: Set<string>;
  /** 展开/收起回调 */
  onToggleExpand?: (id: string) => void;
  /** SubTaskService（用于内联 sub-task 列表） */
  subTaskService?: SubTaskService;
  /** 语言（影响列标题 / 按钮文案） */
  language?: "zh" | "en";
}

const COLUMN_ORDER: TaskStatus[] = ["Prepare", "Abandon", "Doing", "Done"];

/** dataTransfer key for the dragged task id */
const DRAG_MIME = "application/x-notion-task-id";

export function BoardView({
  tasks,
  app,
  currentTimerTaskId,
  currentTimerElapsedMs = 0,
  onSetStatus,
  onCreateTask,
  onToggleTimer,
  onAdjustTime,
  onSetTime,
  expandedIds,
  onToggleExpand,
  subTaskService,
  language = "zh",
}: BoardViewProps) {
  // 拖拽状态：哪个 task 正在被拖、当前 hover 在哪一列
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverStatus, setHoverStatus] = useState<TaskStatus | null>(null);
  // 防止拖完触发 click（打开文件）
  const [justDropped, setJustDropped] = useState(false);

  // 按 status 分组
  const columns = useMemo(() => {
    const map = new Map<TaskStatus, Task[]>();
    for (const s of ALL_STATUSES) map.set(s, []);
    for (const t of tasks) {
      map.get(t.status)?.push(t);
    }
    // 每列内排序：按 due 升序
    for (const [s, list] of map) {
      list.sort((a, b) => (a.completionDate || "9999-99-99").localeCompare(b.completionDate || "9999-99-99"));
    }
    return map;
  }, [tasks]);

  const openFile = (path: string) => {
    const f = app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) app.workspace.getLeaf().openFile(f);
  };

  // ===== 拖拽 handlers =====

  const handleDragStart = (e: React.DragEvent, task: Task) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(DRAG_MIME, task.id);
    // 也设置 text/plain 作为兜底（部分浏览器/Safari 兼容性）
    e.dataTransfer.setData("text/plain", task.basename);
    setDraggingId(task.id);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setHoverStatus(null);
  };

  const handleColumnDragOver = (e: React.DragEvent, status: TaskStatus) => {
    // 必须 preventDefault 才能 drop
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (hoverStatus !== status) setHoverStatus(status);
  };

  const handleColumnDragLeave = (e: React.DragEvent, status: TaskStatus) => {
    // relatedTarget 是离开后进入的元素，避免闪烁
    const related = e.relatedTarget as Node | null;
    const current = e.currentTarget as Node;
    if (related && current.contains(related)) return;
    if (hoverStatus === status) setHoverStatus(null);
  };

  const handleColumnDrop = async (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    const id = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData("text/plain");
    setHoverStatus(null);
    setDraggingId(null);
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    setJustDropped(true);
    // 短暂延迟再清 flag，避免 click 触发
    window.setTimeout(() => setJustDropped(false), 100);
    await onSetStatus(task, status);
  };

  return (
    <div className="notion-board">
      {COLUMN_ORDER.map((status) => {
        const info = STATUS_LABELS[status];
        const list = columns.get(status) || [];
        const isHover = hoverStatus === status;
        return (
          <div
            className={`notion-board-col ${isHover ? "is-drop-target" : ""}`}
            key={status}
            onDragOver={(e) => handleColumnDragOver(e, status)}
            onDragLeave={(e) => handleColumnDragLeave(e, status)}
            onDrop={(e) => handleColumnDrop(e, status)}
          >
            <div
              className="notion-board-col-header"
              style={{ borderBottomColor: info.color }}
            >
              <span className="notion-board-col-dot" style={{ background: info.color }} />
              <span className="notion-board-col-title">{info[language]}</span>
              <span className="notion-board-col-count">{list.length}</span>
            </div>
            <div className="notion-board-col-list">
              {list.map((t) => {
                const isCurrent = currentTimerTaskId === t.id;
                const isDragging = draggingId === t.id;
                const isExpanded = expandedIds?.has(t.id) || false;
                const totalSec = t.totalSeconds || 0;
                return (
                  <div
                    key={t.id}
                    className={`notion-board-card status-${t.status.toLowerCase()} ${isCurrent ? "is-current" : ""} ${isDragging ? "is-dragging" : ""} ${isExpanded ? "is-expanded" : ""}`}
                    draggable
                    onDragStart={(e) => handleDragStart(e, t)}
                    onDragEnd={handleDragEnd}
                    onClick={() => {
                      if (justDropped) return;
                      openFile(t.file);
                    }}
                  >
                    <div className="notion-board-card-top">
                      <span
                        onClick={(e) => e.stopPropagation()}
                        style={{ display: "inline-flex" }}
                      >
                        <StatusCircle
                          value={t.status}
                          onChange={(s) => onSetStatus(t, s)}
                          size={14}
                        />
                      </span>
                      <span className="notion-board-card-title">{t.basename}</span>
                      {onToggleExpand && subTaskService && (
                        <button
                          className="notion-board-card-expand"
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleExpand(t.id);
                          }}
                          title={isExpanded ? (language === "en" ? "Collapse sub-tasks" : "收起 sub-task") : (language === "en" ? "Expand sub-tasks" : "展开 sub-task")}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                      )}
                    </div>
                    <div className="notion-board-card-meta">
                      {t.completionDate && (
                        <span
                          className={`notion-board-card-due ${
                            t.completionDate < today() && (t.status === "Doing" || t.status === "Prepare") ? "is-overdue" : ""
                          } ${t.completionDate === today() ? "is-today" : ""}`}
                        >
                          📅 {relativeDate(t.completionDate)}
                        </span>
                      )}
                      {totalSec > 0 && false && (
                        <span className="notion-board-card-time">
                          ⏱️ {totalSec}m
                        </span>
                      )}
                    </div>
                    {t.tags.length > 0 && (
                      <div className="notion-board-card-tags">
                        {t.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="notion-board-card-tag">#{tag}</span>
                        ))}
                        {t.tags.length > 3 && (
                          <span className="notion-board-card-tag-more">+{t.tags.length - 3}</span>
                        )}
                      </div>
                    )}
                    {/* 计时器（hover 显示 / 计时中常驻） */}
                    <div className="notion-board-card-timer">
                      <TimeAdjustMenu
                        task={t}
                        isCurrent={currentTimerTaskId === t.id}
                        currentElapsedMs={currentTimerTaskId === t.id ? currentTimerElapsedMs : 0}
                        onToggleTimer={onToggleTimer}
                        onAdjust={onAdjustTime}
                        onSet={onSetTime}
                        variant="compact"
                      />
                    </div>
                    {/* sub-task 展开区 */}
                    {isExpanded && subTaskService && (() => {
                      const tf = app.vault.getAbstractFileByPath(t.file);
                      if (!(tf instanceof TFile)) return null;
                      return (
                        <div
                          className="notion-board-card-subs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <SubTaskList
                            file={tf}
                            service={subTaskService}
                            compact
                          />
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              <button
                className="notion-board-add"
                onClick={() => onCreateTask(status)}
                style={{ color: info.color }}
              >
                + {language === "en" ? "New task" : "新建任务"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
