// NotionHero - 大标题 + 工具栏
// 像 Notion 一样：左下角大粗体标题，右侧操作按钮组（Edit / Share / Star / More）
// 标题在 banner 下方显示

import React from "react";

interface NotionHeroProps {
  title: string;
  subtitle?: string;
  language: "zh" | "en";
  onEdit?: () => void;
  onShare?: () => void;
  onStar?: () => void;
  onMore?: () => void;
}

export function NotionHero({
  title,
  subtitle,
  language,
  onEdit,
  onShare,
  onStar,
  onMore,
}: NotionHeroProps) {
  const editLabel = language === "en" ? "Edit" : "编辑";
  const shareLabel = language === "en" ? "Share" : "分享";
  const starLabel = language === "en" ? "Favorite" : "收藏";
  const moreLabel = language === "en" ? "More" : "更多";
  const lastEditedLabel = language === "en" ? "Edited 1y ago" : "1 年前编辑";

  return (
    <div className="notion-hero">
      <div className="notion-hero-main">
        <h1 className="notion-hero-title">{title}</h1>
        {subtitle && <div className="notion-hero-subtitle">{subtitle}</div>}
      </div>
      <div className="notion-hero-actions">
        <span className="notion-hero-meta">{lastEditedLabel}</span>
        {onShare && (
          <button className="notion-hero-action" onClick={onShare} title={shareLabel}>
            <span className="notion-hero-action-icon">🔗</span>
            <span className="notion-hero-action-label">{shareLabel}</span>
          </button>
        )}
        {onStar && (
          <button className="notion-hero-action" onClick={onStar} title={starLabel}>
            <span className="notion-hero-action-icon">⭐</span>
          </button>
        )}
        {onMore && (
          <button className="notion-hero-action" onClick={onMore} title={moreLabel}>
            <span className="notion-hero-action-dots">⋯</span>
          </button>
        )}
      </div>
    </div>
  );
}
