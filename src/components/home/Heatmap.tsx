// 热力图组件 - 自适应宽度版本
//
// 行为：
//   - 通过 ResizeObserver 监听容器宽度
//   - 格子大小根据容器宽度动态计算（每格 16-28px）
//   - 7 行（周一到周日）x N 列（按 StatRange 决定）
//   - hover 显示日期 + 工作时长
//   - 范围外的格子（不在当前 StatRange 内）会被 dim
//   - 接收 palette / language / range

import React, { useEffect, useMemo, useRef, useState } from "react";
import { formatHM, type StatRange } from "../../services/timeTracker";
import type { HeatmapCell } from "../../types";

interface HeatmapProps {
  /** 统计周期（决定 weeks + 范围过滤） */
  range?: StatRange;
  /** 兼容旧用法：直接指定 weeks（当 range 未传时生效） */
  weeks?: number;
  refreshKey: number;
  getData: () => { cells: HeatmapCell[]; weeks: number; maxSeconds: number };
  palette?: "auto" | "blue" | "green" | "purple" | "orange";
  language?: "zh" | "en";
  /** 容器宽度变化时是否自适应格子大小，默认 true */
  responsive?: boolean;
}

const DAY_LABELS_ZH = ["一", "二", "三", "四", "五", "六", "日"];
const DAY_LABELS_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const GAP = 4;
const WEEKDAY_WIDTH = 36;
const MAX_CELL_SIZE = 28;
const MIN_CELL_SIZE = 12;

export function Heatmap({
  range,
  weeks: weeksProp,
  refreshKey,
  getData,
  palette = "auto",
  language = "zh",
  responsive = true,
}: HeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  useEffect(() => {
    if (!containerRef.current || !responsive) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setContainerWidth(Math.floor(e.contentRect.width));
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [responsive]);

  const data = useMemo(() => getData(), [refreshKey, getData]);
  const { cells, weeks, maxSeconds } = data;

  // 自适应格子大小
  const cellSize = useMemo(() => {
    if (!responsive) return MAX_CELL_SIZE;
    const usable = containerWidth - WEEKDAY_WIDTH - 20;
    const ideal = Math.floor((usable - weeks * GAP) / weeks);
    return Math.max(MIN_CELL_SIZE, Math.min(MAX_CELL_SIZE, ideal));
  }, [containerWidth, weeks, responsive]);

  const columns = useMemo(() => {
    const cols: HeatmapCell[][] = [];
    for (let w = 0; w < weeks; w++) {
      cols.push(cells.slice(w * 7, (w + 1) * 7));
    }
    return cols;
  }, [cells, weeks]);

  const monthLabels = useMemo(() => {
    const labels: { week: number; label: string }[] = [];
    let lastMonth = "";
    columns.forEach((col, w) => {
      if (col.length === 0) return;
      const d = new Date(col[0].date);
      const m = `${d.getMonth() + 1}${language === "en" ? "" : "月"}`;
      if (m !== lastMonth) {
        labels.push({ week: w, label: m });
        lastMonth = m;
      }
    });
    return labels;
  }, [columns, language]);

  const stats = useMemo(() => {
    let total = 0;
    let activeDays = 0;
    let inRangeDays = 0;
    let bestSec = 0;
    for (const c of cells) {
      if (c.inRange !== false) inRangeDays++;
      if (c.seconds > 0) {
        total += c.seconds;
        activeDays++;
        if (c.seconds > bestSec) bestSec = c.seconds;
      }
    }
    return { total, activeDays, inRangeDays, bestSec };
  }, [cells]);

  const totalDays = weeks * 7;
  const totalWidth = weeks * (cellSize + GAP);
  const totalHeight = 7 * (cellSize + GAP);
  const paletteClass = palette === "auto" ? "" : `is-palette-${palette}`;
  const dayLabels = language === "en" ? DAY_LABELS_EN : DAY_LABELS_ZH;

  if (stats.activeDays === 0) {
    return (
      <div className="notion-heatmap-empty" ref={containerRef}>
        <div className="notion-heatmap-empty-title">📊 {language === "en" ? "Work Time Heatmap" : "工作时间热力图"}</div>
        <div className="notion-heatmap-empty-hint">
          {language === "en"
            ? <>No time records yet. Click <b>▶ Timer</b> in Tasks panel to start.</>
            : <>还没有任何计时记录。在 Tasks 面板里点击任务的 <b>▶ 计时</b> 按钮开始记录。</>}
        </div>
      </div>
    );
  }

  return (
    <div className={`notion-heatmap ${paletteClass}`} ref={containerRef}>
      <div className="notion-heatmap-header">
        <div className="notion-heatmap-stats">
          <span className="notion-heatmap-stat">
            <b>{formatHM(stats.total * 1000)}</b> {language === "en" ? "total" : "总计"}
          </span>
          <span className="notion-heatmap-stat">
            <b>{stats.activeDays}</b> / {stats.inRangeDays || totalDays} {language === "en" ? "days" : "天"}
          </span>
          {stats.bestSec > 0 && (
            <span className="notion-heatmap-stat">
              {language === "en" ? "Best" : "最高"} <b>{formatHM(stats.bestSec * 1000)}</b>/{language === "en" ? "day" : "天"}
            </span>
          )}
        </div>
        <div className="notion-heatmap-legend">
          <span className="muted">{language === "en" ? "Less" : "少"}</span>
          {[0, 1, 2, 3, 4].map((lv) => (
            <span
              key={lv}
              className={`notion-heatmap-cell is-level-${lv}`}
              style={{ width: cellSize, height: cellSize }}
            />
          ))}
          <span className="muted">{language === "en" ? "More" : "多"}</span>
        </div>
      </div>

      <div className="notion-heatmap-body" style={{ width: "100%" }}>
        <div className="notion-heatmap-weekdays" style={{ width: WEEKDAY_WIDTH }}>
          {dayLabels.map((d, i) => (
            <div
              key={d}
              className="notion-heatmap-weekday"
              style={{ height: cellSize, marginBottom: GAP, lineHeight: `${cellSize}px`, fontSize: cellSize > 22 ? 11 : 10 }}
              data-show={i % 2 === 0 ? "true" : "false"}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="notion-heatmap-grid" style={{ width: totalWidth }}>
          <div className="notion-heatmap-months" style={{ height: 22, position: "relative", width: totalWidth }}>
            {monthLabels.map((m) => (
              <span
                key={m.week}
                className="notion-heatmap-month"
                style={{ left: m.week * (cellSize + GAP), fontSize: cellSize > 22 ? 12 : 11 }}
              >
                {m.label}
              </span>
            ))}
          </div>
          <div className="notion-heatmap-cells" style={{ width: totalWidth, height: totalHeight }}>
            {columns.map((col, w) => (
              <div
                key={w}
                className="notion-heatmap-col"
                style={{ width: cellSize, marginRight: GAP }}
              >
                {col.map((cell, d) => (
                  <div
                    key={d}
                    className={`notion-heatmap-cell is-level-${cell.level}${cell.inRange === false ? " out-of-range" : ""}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                      marginBottom: GAP,
                      borderRadius: Math.max(2, Math.floor(cellSize / 6)),
                    }}
                    title={cell.seconds > 0
                      ? `${cell.date} · ${formatHM(cell.seconds * 1000)}`
                      : cell.date}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
