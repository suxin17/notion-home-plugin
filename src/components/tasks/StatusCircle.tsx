// StatusCircle - 圆圈状态按钮
//
// 视觉：一个圆形按钮，颜色 = 状态颜色，中心显示状态图标
// 行为：点击弹出 4 选 1 菜单
//
// 用在：
//   - List 视图每行最左边
//   - Gantt 视图每行最左边（替代旧 checkbox）

import React, { useState, useRef, useEffect } from "react";
import type { TaskStatus } from "../../types";
import { ALL_STATUSES, STATUS_LABELS } from "../../types";

interface StatusCircleProps {
  value: TaskStatus;
  onChange: (s: TaskStatus) => void | Promise<void>;
  size?: number;
  language?: "zh" | "en";
}

const ICON: Record<TaskStatus, string> = {
  Doing: "●",
  Prepare: "○",
  Done: "✓",
  Abandon: "—",
};

export function StatusCircle({ value, onChange, size = 22, language = "zh" }: StatusCircleProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const info = STATUS_LABELS[value];

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="notion-status-circle-wrap" ref={wrapRef}>
      <button
        className={`notion-status-circle is-${value.toLowerCase()}`}
        style={{
          width: size,
          height: size,
          background: info.color,
          fontSize: Math.max(10, Math.floor(size * 0.55)),
        }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={`${info.zh} / ${info.en}（点击更改）`}
      >
        {ICON[value]}
      </button>
      {open && (
        <div className="notion-status-circle-menu" onClick={(e) => e.stopPropagation()}>
          {ALL_STATUSES.map((s) => {
            const i = STATUS_LABELS[s];
            return (
              <button
                key={s}
                className={`notion-status-circle-option ${s === value ? "is-active" : ""}`}
                onClick={async () => {
                  await onChange(s);
                  setOpen(false);
                }}
              >
                <span
                  className="notion-status-circle-dot"
                  style={{ background: i.color }}
                >
                  {ICON[s]}
                </span>
                <span className="notion-status-circle-label">
                  <span className="zh">{i.zh}</span>
                  <span className="en muted">{i.en}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
