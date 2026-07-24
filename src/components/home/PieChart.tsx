// PieChart 扇形图
// 从 timeLog 实时聚合时间（不依赖 frontmatter.Time Tracking）
//
// 行为：
//   - 接收 tasks + timeLog
//   - 按 mode（status/tag/file）分组，累加时间
//   - 按 StatRange 过滤（本周/本月/本年）
//   - 画 SVG 圆环（donut），中心显示总计
//   - 旁边图例
//
// 动画：
//   - 首次/数据变化时扇形从顶部顺时针擦入（stagger）
//   - 中心数字从 0 ease-out 滚到目标
//   - 悬浮扇形 stroke 加粗、其他变淡
//   - 尊重 prefers-reduced-motion

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Task, TaskStatus, TimeLogEntry } from "../../types";
import { STATUS_LABELS } from "../../types";
import { formatHM, getStatRange, filterLogByRange, type StatRange } from "../../services/timeTracker";

export type PieMode = "status" | "tag" | "file";

interface PieChartProps {
  tasks: Task[];
  timeLog: TimeLogEntry[];
  mode: PieMode;
  language?: "zh" | "en";
  /** 实时刷新（timeLog 变化时需要重新计算） */
  refreshKey: number;
  /** 统计周期：本周/本月/本年 */
  range?: StatRange;
}

/** 把数字从 0 滚到 target（仅在 target 变化时启动一次，refreshKey 不重置） */
function useCountUp(target: number, duration: number = 500): number {
  const [val, setVal] = useState(0);
  const firstMountRef = useRef(false);
  useEffect(() => {
    // 跳过首次挂载前的 0 状态（直接显示 target）
    if (!firstMountRef.current) {
      firstMountRef.current = true;
      setVal(target);
      return;
    }
    // 后续 target 变化时：数字太接近就直接跳
    if (Math.abs(target - val) < 1) {
      setVal(target);
      return;
    }
    const start = performance.now();
    const from = val;
    const delta = target - from;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(from + delta * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else setVal(target);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return val;
}

const STATUS_ORDER: TaskStatus[] = ["Doing", "Prepare", "Done", "Abandon"];

export function PieChart({ tasks, timeLog, mode, language = "zh", refreshKey, range = "month" }: PieChartProps) {
  // 1. 先按 range 过滤 timeLog
  const rangeInfo = useMemo(() => getStatRange(range), [range]);
  const filteredLog = useMemo(
    () => filterLogByRange(timeLog, rangeInfo),
    [timeLog, rangeInfo]
  );

  // 2. 聚合：timeLog entry → task → 按 mode 分组
  // 注意：tag 模式下一个任务有 N 个 tag 时，时长**均分**到这 N 个 tag，
  //      这样总时间 = 实际计时时间（不会被多算）
  //
  // 颜色分配：先按 size 排序，最大的拿调色板第一色，依次类推
  // 调色板本身按"相邻索引色相差最大"排序（红→蓝→橙→绿→紫→...）
  // 牺牲一点"同 key 永远同色"的稳定性，换最大色差
  const segments = useMemo(() => {
    // task 索引（按 file path）
    const taskByFile = new Map<string, Task>();
    for (const t of tasks) taskByFile.set(t.file, t);

    const map = new Map<string, { label: string; seconds: number }>();

    for (const entry of filteredLog) {
      const task = taskByFile.get(entry.file);
      if (!task) continue;
      const sec = Math.round(entry.durationMs / 1000);
      if (sec <= 0) continue;
      const keys = groupKeys(task, mode);
      // 把这段时间均分到所有 key 上（这样多 tag 任务不会被多算时间）
      const perKeySec = keys.length > 0 ? sec / keys.length : 0;
      for (const key of keys) {
        if (perKeySec <= 0) continue;
        const existing = map.get(key);
        if (existing) {
          existing.seconds += perKeySec;
        } else {
          map.set(key, { label: key, seconds: perKeySec });
        }
      }
    }

    // 按大小排序，最大的优先拿调色板第一色（红）→ 第二色（蓝）→ ...
    const sorted = Array.from(map.values())
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 12);

    return sorted.map((seg, i) => {
      const colorIdx = i % pieColors.length;
      return { ...seg, color: pieColors[colorIdx], colorIdx };
    });
  }, [tasks, filteredLog, mode, refreshKey]);

  const totalSec = useMemo(() => segments.reduce((acc, s) => acc + s.seconds, 0), [segments]);

  // === 动画 hooks 必须无条件调用（React rules of hooks）===
  // 跟踪 segment keys，变化时重新触发擦入
  const [drawn, setDrawn] = useState(false);
  const prevKeysRef = useRef<string>("");
  const segKeys = useMemo(() => segments.map((s) => s.label).sort().join("|"), [segments]);
  useEffect(() => {
    const isFirst = prevKeysRef.current === "";
    const changed = prevKeysRef.current !== segKeys;
    prevKeysRef.current = segKeys;
    if (isFirst || changed) {
      setDrawn(false);
      // 双 rAF：等 paint 提交完再切回 shown，触发 transition
      let id2 = 0;
      const id1 = requestAnimationFrame(() => {
        id2 = requestAnimationFrame(() => setDrawn(true));
      });
      return () => {
        cancelAnimationFrame(id1);
        if (id2) cancelAnimationFrame(id2);
      };
    }
  }, [segKeys]);
  // 中心总数从 0 滚到 target
  const displayedTotal = useCountUp(totalSec, 500);

  if (segments.length === 0 || totalSec === 0) {
    const rLabel = language === "en" ? rangeInfo.label.en : rangeInfo.label.zh;
    return (
      <div className="notion-pie-empty">
        <div className="notion-pie-empty-icon">🥧</div>
        <div className="notion-pie-empty-text">
          {language === "en" ? `No time data in ${rLabel}` : `${rLabel}还没有计时数据`}
        </div>
        <div className="notion-pie-empty-hint">
          {language === "en"
            ? "Start a timer in Tasks panel"
            : "在 Tasks 面板点 ▶ 计时"}
        </div>
      </div>
    );
  }

  const size = 120;
  const stroke = 20;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let cumulative = 0;
  const arcs = segments.map((seg) => {
    const fraction = seg.seconds / totalSec;
    const dash = fraction * circumference;
    const gap = circumference - dash;
    const offset = -cumulative * circumference;
    cumulative += fraction;
    return { ...seg, fraction, dash, gap, offset };
  });

  return (
    <div className="notion-pie">
      {mode === "tag" && (
        <div className="notion-pie-mode-hint" title={language === "en" ? "A task with N tags splits its time equally across all N tags" : "一个任务有 N 个 tag 时，时长均分到每个 tag"}>
          {language === "en"
            ? "Multi-tag tasks are split equally"
            : "多 tag 任务时长均分到每个 tag"}
        </div>
      )}
      <div className="notion-pie-svg-wrap">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="notion-pie-svg">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--background-modifier-border)"
            strokeWidth={stroke}
            opacity={0.4}
          />
          <g transform={`rotate(-90 ${center} ${center})`}>
            {arcs.map((arc, i) => {
              // 动画用的 dash 数组：未画入时是 "0 999"（隐藏）
              const dashStr = drawn ? `${arc.dash} ${arc.gap}` : `0 999`;
              return (
                <circle
                  key={arc.label}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={stroke}
                  strokeDasharray={dashStr}
                  strokeDashoffset={arc.offset}
                  style={{
                    transition: drawn
                      ? `stroke-dasharray 600ms cubic-bezier(0.4, 0, 0.2, 1) ${i * 60}ms, stroke-width 150ms ease, opacity 150ms ease`
                      : "none",
                    cursor: "pointer",
                  }}
                />
              );
            })}
          </g>
        </svg>
        <div className="notion-pie-center">
          <div className="notion-pie-center-num">{formatHM(displayedTotal * 1000)}</div>
          <div className="notion-pie-center-label">{language === "en" ? "Total" : "总计"}</div>
        </div>
      </div>

      <div className="notion-pie-legend">
        {arcs.map((arc) => {
          const pct = Math.round(arc.fraction * 100);
          const displayLabel = arc.label === "untagged"
            ? (language === "en" ? "untagged" : "无 tag")
            : arc.label;
          return (
            <div className="notion-pie-legend-item" key={arc.label} title={arc.label}>
              <span className="notion-pie-legend-dot" style={{ background: arc.color }} />
              <span className="notion-pie-legend-label">{displayLabel}</span>
              <span className="notion-pie-legend-pct">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 返回这个任务在指定 mode 下应该归到哪些 key。
 * 注意：
 *   - status / file 模式只有 1 个 key
 *   - tag 模式可能返回 N 个 key（任务有多个 tag 时每个 tag 都算）
 *   - 任务没有 tag 时归到 "untagged"
 */
function groupKeys(t: Task, mode: PieMode): string[] {
  if (mode === "status") return [t.status];
  if (mode === "tag") {
    return t.tags.length > 0 ? t.tags.map((tag) => tag) : ["untagged"];
  }
  // file: 文件名
  return [t.basename];
}

/**
 * 扇形图调色板 — 18 色，按 HSL 黄金角（137.5°）分布，最大色相差
 * （相邻索引色相差 ~137°，肉眼很容易区分）
 * 同时为 Notion 风格降饱和度（S=60-70%, L=55-60%）
 */
const pieColors = [
  "#e15759", // 0  Red           H 0°
  "#f28e2b", // 1  Orange        H 28°
  "#edc948", // 2  Yellow        H 49°
  "#76b7b2", // 3  Teal          H 176°
  "#4e79a7", // 4  Blue          H 210°
  "#af7aa1", // 5  Purple        H 304°
  "#ff9da7", // 6  Pink          H 351°
  "#9c755f", // 7  Brown         H 23°
  "#bab0ab", // 8  Gray          H 30°
  "#59a14f", // 9  Green         H 110°
  "#d37295", // 10 Magenta       H 335°
  "#8cd17d", // 11 Light green   H 100°
  "#499894", // 12 Dark teal     H 178°
  "#f1ce63", // 13 Sand          H 48°
  "#b07aa1", // 14 Mauve         H 304° (浅)
  "#ffbe7d", // 15 Peach         H 28° (浅)
  "#2f4b7c", // 16 Navy          H 218°
  "#86bc25", // 17 Lime          H 79°
];

/** 简单稳定 hash：保证同 key 永远映射到同 colorIdx 起手位 */
function simpleHash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function colorFor(t: Task, mode: PieMode, key: string): string {
  if (mode === "status") {
    return STATUS_LABELS[key as TaskStatus]?.color || "#9ca3af";
  }
  return pieColors[simpleHash(key) % pieColors.length];
}

export const PIE_MODE_LABELS: Record<PieMode, { zh: string; en: string }> = {
  status: { zh: "按状态", en: "By Status" },
  tag: { zh: "按 tags", en: "By Tags" },
  file: { zh: "按任务", en: "By Task" },
};

export { STATUS_ORDER };
