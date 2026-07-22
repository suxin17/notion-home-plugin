// Pills - Notion 风格的 status / priority / tag pill 组件
//
// 风格对齐 Notion：
//   - Status: 圆点 + 文字 + 浅色背景
//   - Priority: 纯色背景 + 加粗文字
//   - Tag: 小圆角 + 浅彩底（按 tag 名 hash 到固定色板）+ 深色文字
//
// 所有 pill 都可以带可选 onClick（点击触发编辑器）和 onRemove（删除 tag）

import React from "react";
import type { TaskStatus, TaskPriority } from "../../types";
import { STATUS_LABELS } from "../../types";

interface StatusPillProps {
  status: TaskStatus;
  language?: "zh" | "en";
  onClick?: (e: React.MouseEvent) => void;
  size?: "sm" | "md";
}

export function StatusPill({ status, language = "zh", onClick, size = "sm" }: StatusPillProps) {
  const info = STATUS_LABELS[status];
  const text = language === "en" ? status : info.zh;
  return (
    <span
      className={`notion-pill notion-pill-status is-${status.toLowerCase()} is-${size}${onClick ? " is-clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      title={text}
    >
      <span className="notion-pill-dot" />
      {text}
    </span>
  );
}

interface PriorityPillProps {
  priority: TaskPriority;
  language?: "zh" | "en";
  onClick?: (e: React.MouseEvent) => void;
  size?: "sm" | "md";
}

const PRIORITY_LABEL: Record<TaskPriority, { zh: string; en: string }> = {
  high: { zh: "🔺 高", en: "🔺 High" },
  medium: { zh: "🔼 中", en: "🔼 Medium" },
  low: { zh: "🔽 低", en: "🔽 Low" },
  none: { zh: "—", en: "—" },
};

export function PriorityPill({ priority, language = "zh", onClick, size = "sm" }: PriorityPillProps) {
  if (priority === "none") {
    return (
      <span
        className={`notion-pill notion-pill-priority is-none is-${size}${onClick ? " is-clickable" : ""}`}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        title={language === "en" ? "No priority" : "无优先级"}
      >
        {PRIORITY_LABEL.none[language]}
      </span>
    );
  }
  const text = PRIORITY_LABEL[priority][language];
  return (
    <span
      className={`notion-pill notion-pill-priority is-${priority} is-${size}${onClick ? " is-clickable" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      title={text}
    >
      {text}
    </span>
  );
}

// Tag chip 调色板（8 色，hash 后稳定）
const TAG_PALETTE: { bg: string; fg: string }[] = [
  { bg: "rgba(110,168,254,0.16)", fg: "#2952cc" }, // 蓝
  { bg: "rgba(110,200,130,0.18)", fg: "#1f7a3a" }, // 绿
  { bg: "rgba(245,166,35,0.18)",  fg: "#a3620b" }, // 琥珀
  { bg: "rgba(170,120,240,0.18)", fg: "#6a3aa8" }, // 紫
  { bg: "rgba(240,110,167,0.18)", fg: "#a82d65" }, // 粉
  { bg: "rgba(224,94,87,0.16)",   fg: "#a8322a" }, // 红
  { bg: "rgba(62,190,196,0.18)",  fg: "#1a6e72" }, // 青
  { bg: "rgba(155,193,88,0.18)",  fg: "#5a7a1f" }, // 黄绿
];

function tagColor(tag: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

interface TagChipProps {
  tag: string;
  onClick?: (e: React.MouseEvent) => void;
  onRemove?: (e: React.MouseEvent) => void;
  size?: "sm" | "md";
}

export function TagChip({ tag, onClick, onRemove, size = "sm" }: TagChipProps) {
  const c = tagColor(tag);
  return (
    <span
      className={`notion-pill notion-pill-tag is-${size}${onClick ? " is-clickable" : ""}${onRemove ? " is-removable" : ""}`}
      style={{ background: c.bg, color: c.fg }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      title={tag}
    >
      {tag}
      {onRemove && (
        <span
          className="notion-pill-tag-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(e);
          }}
          title="Remove"
        >
          ×
        </span>
      )}
    </span>
  );
}
