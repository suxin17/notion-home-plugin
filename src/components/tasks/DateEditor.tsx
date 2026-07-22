// DateEditor - 日期选择器
// 点击显示 native date picker；清除按钮

import React from "react";

interface DateEditorProps {
  label: string;
  value?: string;
  onChange: (v: string | null) => void | Promise<void>;
  overdueCheck?: boolean; // 标记过期状态
}

export function DateEditor({ label, value, onChange, overdueCheck }: DateEditorProps) {
  const isOverdue = overdueCheck && value && value < new Date().toISOString().slice(0, 10);

  return (
    <div className={`notion-tasks-date-editor ${isOverdue ? "is-overdue" : ""}`}>
      <span className="notion-tasks-date-label">{label}:</span>
      <input
        type="date"
        className="notion-tasks-date-input"
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
      />
      {value && (
        <button
          className="notion-tasks-date-clear"
          onClick={() => onChange(null)}
          title="清除"
        >×</button>
      )}
    </div>
  );
}
