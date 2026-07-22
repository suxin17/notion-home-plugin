// PriorityEditor - 优先级下拉
// 点击切换 🔺 / 🔼 / 无

import React, { useState } from "react";
import type { TaskPriority } from "../../types";

interface PriorityEditorProps {
  value: TaskPriority;
  onChange: (p: TaskPriority) => void | Promise<void>;
}

const ICONS: Record<TaskPriority, string> = {
  high: "🔺",
  medium: "🔼",
  low: "🔽",
  none: "·",
};

const LABELS: Record<TaskPriority, string> = {
  high: "高",
  medium: "中",
  low: "低",
  none: "无",
};

export function PriorityEditor({ value, onChange }: PriorityEditorProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="notion-tasks-priority-editor">
      <button
        className={`notion-tasks-priority-btn is-${value}`}
        onClick={() => setOpen((o) => !o)}
        title="切换优先级"
      >
        {ICONS[value]} {value !== "none" && LABELS[value]}
      </button>
      {open && (
        <div className="notion-tasks-priority-menu">
          {(["high", "medium", "low", "none"] as TaskPriority[]).map((p) => (
            <button
              key={p}
              className={`notion-tasks-priority-option is-${p} ${value === p ? "is-active" : ""}`}
              onClick={async () => {
                await onChange(p);
                setOpen(false);
              }}
            >
              {ICONS[p]} {LABELS[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
