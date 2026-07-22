// PieChart 扇形图
// 从 timeLog 实时聚合时间（不依赖 frontmatter.Time Tracking）
//
// 行为：
//   - 接收 tasks + timeLog
//   - 按 mode（status/tag/file）分组，累加时间
//   - 按 StatRange 过滤（本周/本月/本年）
//   - 画 SVG 圆环（donut），中心显示总计
//   - 旁边图例

import React, { useMemo } from "react";
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
  // 颜色分配：顺序 + 稳定（不是 hash 避免冲突）
  //   - 每个 key 第一次出现时分配下一个 colorIdx
  //   - 同 key 永远同色
  //   - 颜色用完循环
  const segments = useMemo(() => {
    // task 索引（按 file path）
    const taskByFile = new Map<string, Task>();
    for (const t of tasks) taskByFile.set(t.file, t);

    const map = new Map<string, { label: string; seconds: number; color: string; colorIdx: number }>();
    const keyColor = new Map<string, number>();
    const usedIdxs = new Set<number>();
    let nextIdx = 0;

    const pickColor = (key: string): { color: string; colorIdx: number } => {
      // 同 key 同色
      if (keyColor.has(key)) {
        const idx = keyColor.get(key)!;
        return { color: pieColors[idx % pieColors.length], colorIdx: idx };
      }
      // 新 key：找下一个未用 idx（hash 起手 → 冲突就往下走）
      let idx = simpleHash(key) % pieColors.length;
      let attempts = 0;
      while (usedIdxs.has(idx) && attempts < pieColors.length) {
        idx = (idx + 1) % pieColors.length;
        attempts++;
      }
      // 全部已用：循环
      if (usedIdxs.has(idx)) idx = nextIdx % pieColors.length;
      keyColor.set(key, idx);
      usedIdxs.add(idx);
      nextIdx++;
      return { color: pieColors[idx % pieColors.length], colorIdx: idx };
    };

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
          const { color, colorIdx } = pickColor(key);
          map.set(key, {
            label: key,
            seconds: perKeySec,
            color,
            colorIdx,
          });
        }
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 12);
  }, [tasks, filteredLog, mode, refreshKey]);

  const totalSec = useMemo(() => segments.reduce((acc, s) => acc + s.seconds, 0), [segments]);

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
            {arcs.map((arc) => (
              <circle
                key={arc.label}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={stroke}
                strokeDasharray={`${arc.dash} ${arc.gap}`}
                strokeDashoffset={arc.offset}
                style={{ transition: "stroke-dasharray 0.3s, stroke-dashoffset 0.3s" }}
              />
            ))}
          </g>
        </svg>
        <div className="notion-pie-center">
          <div className="notion-pie-center-num">{formatHM(totalSec * 1000)}</div>
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

/** 扇形图调色板（顺序分配，避免 hash 冲突） */
const pieColors = [
  "#4f7cff", // 蓝
  "#4ec9b0", // 青绿
  "#7d8aff", // 靛蓝
  "#9d6bdd", // 紫
  "#ec5b8a", // 粉
  "#e85d5d", // 红
  "#9bc158", // 黄绿
  "#3ebec4", // 青
  "#5fc8c8", // 蓝绿
  "#b67ad9", // 淡紫
  "#67b86c", // 草绿
  "#56a8d6", // 天蓝
  "#c490f0", // 薰衣草
  "#7ec8e3", // 浅蓝
  "#a78bfa", // 紫罗兰
  "#d97a8a", // 玫红
  "#5fb1a3", // 海绿
  "#8bc88a", // 嫩绿
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
