// StatusEditor - 任务状态下拉
// 点击切换 Doing / Prepare / Done / Abandon

import React, { useState } from "react";
import type { TaskStatus } from "../../types";
import { ALL_STATUSES, STATUS_LABELS } from "../../types";

interface StatusEditorProps {
  value: TaskStatus;
  onChange: (s: TaskStatus) => void | Promise<void>;
}

export function StatusEditor({ value, onChange }: StatusEditorProps) {
  const [open, setOpen] = useState(false);
  const current = STATUS_LABELS[value];

  return (
    <div className="notion-tasks-status-editor">
      <button
        className="notion-tasks-status-btn is-current"
        style={{ borderColor: current.color, color: current.color }}
        onClick={() => setOpen((o) => !o)}
        title="更改状态"
      >
        {current.icon} {current.zh}
      </button>
      {open && (
        <div className="notion-tasks-status-menu">
          {ALL_STATUSES.map((s) => {
            const info = STATUS_LABELS[s];
            return (
              <button
                key={s}
                className={`notion-tasks-status-option ${s === value ? "is-active" : ""}`}
                style={s === value ? { background: info.color, color: "white" } : {}}
                onClick={async () => {
                  await onChange(s);
                  setOpen(false);
                }}
              >
                {info.icon} {info.zh}
                <span className="notion-tasks-status-en">{info.en}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
