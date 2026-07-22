// 甘特图组件
// 输入：经过滤的任务列表
// 行为：
//   - 时间范围：可以由 props.range（week/month/year）控制，固定到当前周期
//   - 按文件分组
//   - 每行渲染一个 bar（超出范围的 bar 会被裁剪到边界）
//   - 完全在范围外的任务不显示
//   - 颜色：open=蓝，done=绿，overdue=红边
//   - 自动滚动到今天（首次渲染时）
//   - 横向滚动（如果时间跨度大）

import React, { useEffect, useMemo, useRef, useState } from "react";
import { TFile } from "obsidian";
import { today, relativeDate } from "../../utils/date";
import type { Task, TaskStatus } from "../../types";
import { StatusCircle } from "./StatusCircle";
import { TimeAdjustMenu } from "./TimeAdjustMenu";
import { SubTaskList } from "./SubTaskList";
import type { SubTaskService } from "../../services/subTaskService";
import { getStatRange, type StatRange } from "../../services/timeTracker";

interface GanttViewProps {
  tasks: Task[];
  app: { vault: any; workspace: any };
  currentTimerTaskId?: string;
  currentTimerElapsedMs?: number;
  onSetStatus?: (t: Task, s: TaskStatus) => void | Promise<void>;
  onToggleTimer?: (t: Task) => void | Promise<void>;
  onAdjustTime?: (t: Task, deltaSec: number) => void | Promise<void>;
  onSetTime?: (t: Task, totalSec: number) => void | Promise<void>;
  /** 时间范围：本周/本月/本年（默认 month） */
  range?: StatRange;
  /** 滚动到今天后是否居中，默认 true */
  centerOnToday?: boolean;
  /** 已展开的 task ids（外部状态） */
  expandedIds?: Set<string>;
  /** 展开/收起回调 */
  onToggleExpand?: (id: string) => void;
  /** SubTaskService（用于弹层 sub-task 列表） */
  subTaskService?: SubTaskService;
  /** 语言 */
  language?: "zh" | "en";
}

const ROW_PX = 32; // 每行高度
const HEADER_PX = 56; // 顶部双行表头
const LEFT_PX = 240; // 左侧任务名宽度

/** 不同 range 下每天的宽度（用于缩放） */
function dayPxForRange(range: StatRange): number {
  if (range === "week") return 64;   // 7 × 64 = 448
  if (range === "month") return 26;  // 30 × 26 = 780
  return 7;                           // year: 365 × 7 ≈ 2555
}

export function GanttView({
  tasks,
  app,
  currentTimerTaskId,
  currentTimerElapsedMs = 0,
  onSetStatus,
  onToggleTimer,
  onAdjustTime,
  onSetTime,
  range = "month",
  centerOnToday = true,
  expandedIds,
  onToggleExpand,
  subTaskService,
  language = "zh",
}: GanttViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 弹层定位用的 ref
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number; taskId: string } | null>(null);

  // 计算时间范围（由 range 决定）
  const { startDate, endDate, totalDays } = useMemo(() => {
    const ri = getStatRange(range);
    return {
      startDate: formatISO(ri.gridStart),
      endDate: formatISO(ri.gridEnd),
      totalDays: ri.weeks * 7,
    };
  }, [range]);

  const DAY_PX = dayPxForRange(range);

  // 过滤：完全在范围外的任务不显示
  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!t.start && !t.completionDate) return false;
      const tStart = t.start || t.completionDate!;
      const tEnd = t.completionDate || t.start!;
      // 与范围有交集才显示
      return tEnd >= startDate && tStart <= endDate;
    });
  }, [tasks, startDate, endDate]);

  // 按文件分组
  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of visibleTasks) {
      const list = map.get(t.file) || [];
      list.push(t);
      map.set(t.file, list);
    }
    return Array.from(map.entries()).map(([file, items]) => {
      items.sort((a, b) => {
        const ad = a.start || a.completionDate || "9999-99-99";
        const bd = b.start || b.completionDate || "9999-99-99";
        return ad.localeCompare(bd);
      });
      return { file, items };
    });
  }, [visibleTasks]);

  // 生成日期刻度
  const ticks = useMemo(() => {
    const out: { date: string; isMonth: boolean; isYear: boolean; isMonthStart: boolean; label: string; isToday: boolean; isWeekend: boolean }[] = [];
    const cursor = new Date(startDate);
    const todayStr = today();
    for (let i = 0; i < totalDays; i++) {
      const iso = formatISO(cursor);
      const dow = cursor.getDay();
      out.push({
        date: iso,
        isMonth: cursor.getDate() === 1,
        isYear: cursor.getMonth() === 0 && cursor.getDate() === 1,
        isMonthStart: cursor.getDate() === 1,
        label: range === "year"
          ? `${cursor.getMonth() + 1}月`
          : cursor.toString().slice(5, 10), // MM-DD
        isToday: iso === todayStr,
        isWeekend: dow === 0 || dow === 6,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [startDate, totalDays, range]);

  // 今天的位置（百分比）
  const todayPct = useMemo(() => {
    const t = new Date(today()).getTime();
    const s = new Date(startDate).getTime();
    const e = new Date(endDate).getTime();
    if (t < s || t > e) return null;
    return ((t - s) / (e - s)) * 100;
  }, [startDate, endDate]);

  // 滚动到今天（首次渲染 + range 变化时）
  useEffect(() => {
    if (!scrollRef.current || todayPct === null) return;
    // 等待 DOM 完全渲染
    const t = window.setTimeout(() => {
      const el = scrollRef.current;
      if (!el) return;
      const todayX = (todayPct / 100) * totalDays * DAY_PX;
      const containerWidth = el.clientWidth;
      let target = todayX - containerWidth / 2;
      if (centerOnToday) {
        // 居中
        target = todayX - containerWidth / 2;
      } else {
        // 左对齐 today
        target = todayX - LEFT_PX;
      }
      target = Math.max(0, target);
      el.scrollLeft = target;
    }, 30);
    return () => window.clearTimeout(t);
  }, [todayPct, totalDays, DAY_PX, centerOnToday, range]);

  // bar 位置计算（clip 到 range 边界）
  const barPos = (t: Task) => {
    const todayStr = today();
    const sStr = t.start || t.completionDate || todayStr;
    const eStr = t.completionDate || t.start || todayStr;
    // clip 到 range
    const clippedS = sStr < startDate ? startDate : sStr;
    const clippedE = eStr > endDate ? endDate : eStr;
    const s = new Date(clippedS).getTime();
    const e = new Date(clippedE).getTime();
    const rangeS = new Date(startDate).getTime();
    const rangeE = new Date(endDate).getTime();
    const totalMs = rangeE - rangeS;
    const left = Math.max(0, ((s - rangeS) / totalMs) * 100);
    const right = Math.min(100, ((e - rangeS) / totalMs) * 100);
    const width = Math.max(1.5, right - left);
    // 是否在边界外被裁剪
    const clipped = sStr < startDate || eStr > endDate;
    return { left, width, clipped };
  };

  const openFile = (path: string) => {
    const f = app.vault.getAbstractFileByPath(path);
    if (f instanceof TFile) app.workspace.getLeaf().openFile(f);
  };

  const totalWidth = totalDays * DAY_PX;

  // 空状态：分两种情况（无任务 vs 任务都在范围外）
  if (groups.length === 0) {
    const rLabel = range === "week"
      ? (language === "en" ? "This Week" : "本周")
      : range === "month"
        ? (language === "en" ? "This Month" : "本月")
        : (language === "en" ? "This Year" : "本年");
    if (tasks.length === 0) {
      return (
        <div className="notion-gantt-empty">
          <div className="notion-gantt-empty-title">📊 {language === "en" ? "No gantt to show yet" : "还没有可显示的甘特图"}</div>
          <div className="notion-gantt-empty-hint">
            {language === "en"
              ? <>Add <code>🛫 YYYY-MM-DD</code> (start) and/or <code>📅 YYYY-MM-DD</code> (end) to tasks and they'll show here.</>
              : <>给任务加上 <code>🛫 YYYY-MM-DD</code>（开始）和/或 <code>📅 YYYY-MM-DD</code>（结束）就会在这里出现。</>}
          </div>
          <div className="notion-gantt-empty-example">
            {language === "en"
              ? <>Example: <code>- [ ] Weekly report 🔺 🛫 2026-07-21 📅 2026-07-25</code></>
              : <>示例：<code>- [ ] 写周报 🔺 🛫 2026-07-21 📅 2026-07-25</code></>}
          </div>
        </div>
      );
    }
    return (
      <div className="notion-gantt-empty">
        <div className="notion-gantt-empty-title">📊 {language === "en" ? `No tasks in ${rLabel}` : `${rLabel}没有任务`}</div>
        <div className="notion-gantt-empty-hint">
          {language === "en"
            ? `Current view is ${rLabel}, ${tasks.length} tasks with dates but none in this range. Switch to another range or set dates within ${rLabel}.`
            : `当前视图是 ${rLabel}，有 ${tasks.length} 个带日期的任务但都不在这个时间范围内。切换到「${range === "year" ? "本周" : "本年"}」或给任务设置本${rLabel === "本年" ? "年" : rLabel === "本月" ? "月" : "周"}的日期试试。`}
        </div>
      </div>
    );
  }

  // 年视图：表头用月份标签（1月/2月/...）
  // 月视图：表头用月份（顶部）+ 日期（底部）
  // 周视图：表头用周几（顶部）+ 日期（底部）
  const showYearTop = range === "year";
  const showMonthTop = range !== "year"; // week 和 month 都用月份做顶部
  const showWeekdayTop = range === "week";

  return (
    <div className="notion-gantt" ref={scrollRef}>
      <div className="notion-gantt-scroll" style={{ width: LEFT_PX + totalWidth + 20 }}>
        {/* 头部 */}
        <div className="notion-gantt-header" style={{ paddingLeft: LEFT_PX }}>
          <div className="notion-gantt-header-ticks" style={{ width: totalWidth, height: HEADER_PX }}>
            {/* 顶部行：年/月/周几 */}
            <div className="notion-gantt-header-top" style={{ width: totalWidth, height: 28 }}>
              {showYearTop && ticks.map((tk, i) => {
                if (!tk.isYear) return null;
                // 这一年到下一年
                let yearEnd = i;
                while (yearEnd < ticks.length && !ticks[yearEnd].isYear) yearEnd++;
                const spanDays = yearEnd === i ? ticks.length - i : yearEnd - i;
                return (
                  <div
                    key={tk.date}
                    className="notion-gantt-header-year"
                    style={{ left: i * DAY_PX, width: spanDays * DAY_PX }}
                  >
                    {tk.date.slice(0, 4)}年
                  </div>
                );
              })}
              {showMonthTop && !showWeekdayTop && ticks.map((tk, i) => {
                if (!tk.isMonth) return null;
                let monthEnd = i + 1;
                while (monthEnd < ticks.length && !ticks[monthEnd].isMonth) monthEnd++;
                const spanDays = monthEnd - i;
                return (
                  <div
                    key={tk.date}
                    className="notion-gantt-header-month"
                    style={{ left: i * DAY_PX, width: spanDays * DAY_PX }}
                  >
                    {parseInt(tk.date.slice(5, 7), 10)}月
                  </div>
                );
              })}
              {showWeekdayTop && (() => {
                // 显示 7 个周几标签
                const start = new Date(startDate);
                const labels: { x: number; label: string }[] = [];
                const dayZh = ["日", "一", "二", "三", "四", "五", "六"];
                for (let d = 0; d < 7; d++) {
                  const dt = new Date(start);
                  dt.setDate(start.getDate() + d);
                  labels.push({ x: d * DAY_PX, label: `周${dayZh[dt.getDay()]}` });
                }
                return labels.map((l) => (
                  <div
                    key={l.x}
                    className="notion-gantt-header-weekday"
                    style={{ left: l.x, width: DAY_PX }}
                  >
                    {l.label}
                  </div>
                ));
              })()}
            </div>
            {/* 底部行：日期 */}
            <div className="notion-gantt-header-days" style={{ width: totalWidth, top: 28 }}>
              {ticks.map((tk) => (
                <div
                  key={tk.date}
                  className={`notion-gantt-header-day ${tk.isToday ? "is-today" : ""} ${tk.isWeekend ? "is-weekend" : ""} ${tk.isMonthStart ? "is-month-start" : ""}`}
                  style={{ width: DAY_PX }}
                  title={tk.date}
                >
                  {range === "year" ? tk.date.slice(5, 10) : parseInt(tk.date.slice(8, 10), 10)}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 左侧任务名 + 右侧 bar 区域 */}
        {groups.map((g) => (
          <div className="notion-gantt-group" key={g.file}>
            <div className="notion-gantt-group-header" style={{ paddingLeft: 12, width: LEFT_PX + totalWidth }}>
              <span className="notion-gantt-group-icon">📄</span>
              <span
                className="notion-gantt-group-name"
                onClick={() => openFile(g.file)}
                title={g.file}
              >
                {g.file.split("/").pop()?.replace(/\.md$/, "")}
              </span>
              <span className="notion-gantt-group-count">{g.items.length}</span>
            </div>
            {g.items.map((t) => {
              const pos = barPos(t);
              const isOverdue = (t.status === "Doing" || t.status === "Prepare") && t.completionDate && t.completionDate < today();
              const isToday = t.completionDate === today() && (t.status === "Doing" || t.status === "Prepare");
              const isExpanded = expandedIds?.has(t.id) || false;
              return (
                <React.Fragment key={t.id}>
                  <div className="notion-gantt-row" style={{ height: ROW_PX }}>
                    {/* 左侧：任务名 */}
                    <div
                      className={`notion-gantt-row-label status-${t.status.toLowerCase()} prio-${t.priority}`}
                      style={{ width: LEFT_PX, paddingLeft: 12 }}
                    >
                      {onSetStatus && (
                        <StatusCircle
                          value={t.status}
                          onChange={(s) => onSetStatus(t, s)}
                          size={16}
                        />
                      )}
                      <span
                        className="notion-gantt-row-text"
                        onClick={() => openFile(t.file)}
                        title={`${t.basename}\n${t.file}`}
                      >
                        {t.basename}
                      </span>
                      {t.priority === "high" && <span className="notion-gantt-prio">🔺</span>}
                      {t.priority === "medium" && <span className="notion-gantt-prio">🔼</span>}
                      {onToggleExpand && subTaskService && (
                        <button
                          className="notion-gantt-expand"
                          onClick={() => onToggleExpand(t.id)}
                          title={isExpanded
                            ? (language === "en" ? "Collapse sub-tasks" : "收起 sub-task")
                            : (language === "en" ? "Expand sub-tasks" : "展开 sub-task")}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? "▾" : "▸"}
                        </button>
                      )}
                      {onToggleTimer && (
                        <span className="notion-gantt-timer">
                          <TimeAdjustMenu
                            task={t}
                            isCurrent={currentTimerTaskId === t.id}
                            currentElapsedMs={currentTimerTaskId === t.id ? currentTimerElapsedMs : 0}
                            onToggleTimer={onToggleTimer}
                            onAdjust={onAdjustTime || (() => {})}
                            onSet={onSetTime || (() => {})}
                            variant="compact"
                          />
                        </span>
                      )}
                    </div>
                    {/* 右侧：bar 区域 */}
                    <div
                      className="notion-gantt-row-bars"
                      style={{ width: totalWidth, paddingLeft: LEFT_PX }}
                    >
                      {ticks.map((tk, i) =>
                        tk.isWeekend ? (
                          <div
                            key={tk.date}
                            className="notion-gantt-weekend"
                            style={{ left: i * DAY_PX, width: DAY_PX }}
                          />
                        ) : null
                      )}
                      <div
                        className={`notion-gantt-bar-wrap ${pos.clipped ? "is-clipped" : ""}`}
                        style={{
                          left: `${pos.left}%`,
                          width: `${pos.width}%`,
                        }}
                        title={`${t.basename}\n${t.start ? "🛫 " + t.start : ""}${t.start && t.completionDate ? " → " : ""}${t.completionDate ? "📅 " + t.completionDate : ""}${pos.clipped ? (language === "en" ? "\n(Partially outside this range)" : "\n（部分超出当前范围）") : ""}`}
                      >
                        <div
                          className={`notion-gantt-bar status-${t.status.toLowerCase()} ${isOverdue ? "is-overdue" : ""} ${isToday ? "is-today" : ""} prio-${t.priority}`}
                          onClick={() => openFile(t.file)}
                        >
                          <span className="notion-gantt-bar-label">
                            {relativeDate(t.completionDate || t.start || "")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  {/* sub-task 抽屉（展开时） */}
                  {isExpanded && subTaskService && (() => {
                    const tf = app.vault.getAbstractFileByPath(t.file);
                    if (!(tf instanceof TFile)) return null;
                    return (
                      <div
                        className="notion-gantt-row-subs"
                        style={{ width: LEFT_PX + totalWidth }}
                      >
                        <div style={{ width: LEFT_PX, flexShrink: 0 }} />
                        <div className="notion-gantt-row-subs-inner" style={{ width: totalWidth }}>
                          <SubTaskList
                            file={tf}
                            service={subTaskService}
                            compact
                          />
                        </div>
                      </div>
                    );
                  })()}
                </React.Fragment>
              );
            })}
          </div>
        ))}

        {/* 今天线 */}
        {todayPct !== null && (
          <div
            className="notion-gantt-today-line"
            style={{ left: LEFT_PX + (todayPct / 100) * totalWidth }}
            title="今天"
          />
        )}
      </div>
    </div>
  );
}

/** YYYY-MM-DD（用本地时区，不依赖 Date.toISOString 那个 UTC 行为） */
function formatISO(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}
