// PriorityEditor - Notion 风格优先级 pill
// 点击 → 弹出小菜单选 high / medium / low / none

import React, { useState, useEffect, useRef } from "react";
import type { TaskPriority } from "../../types";
import { PriorityPill } from "./Pills";

interface PriorityEditorProps {
  value: TaskPriority;
  onChange: (p: TaskPriority) => void | Promise<void>;
  language?: "zh" | "en";
}

const OPTIONS: { value: TaskPriority; zh: string; en: string }[] = [
  { value: "high",   zh: "🔺 高",   en: "🔺 High" },
  { value: "medium", zh: "🔼 中",   en: "🔼 Medium" },
  { value: "low",    zh: "🔽 低",   en: "🔽 Low" },
  { value: "none",   zh: "无",     en: "None" },
];

export function PriorityEditor({ value, onChange, language = "zh" }: PriorityEditorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="notion-tasks-priority-editor" ref={ref}>
      <PriorityPill
        priority={value}
        language={language}
        onClick={() => setOpen((o) => !o)}
      />
      {open && (
        <div className="notion-tasks-priority-menu">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              className={`notion-tasks-priority-option is-${o.value} ${value === o.value ? "is-active" : ""}`}
              onClick={async () => {
                await onChange(o.value);
                setOpen(false);
              }}
            >
              <PriorityPill
                priority={o.value}
                language={language}
                size="sm"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
