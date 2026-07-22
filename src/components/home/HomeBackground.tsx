// HomeBackground - 顶部 banner
// 跟 Notion 一致：横跨页面宽度，硬切（不渐变到底部），左下角可加圆形 avatar
//
// 模式：
//   - "none"        : 无背景
//   - "gradient-*"  : 预设渐变
//   - "image"       : 自定义图片（dataUrl / vault）

import React, { useEffect, useState } from "react";
import { TFile } from "obsidian";

export type BgMode =
  | "none"
  | "gradient-blue"
  | "gradient-purple"
  | "gradient-warm"
  | "gradient-green"
  | "gradient-dark"
  | "image";

const GRADIENTS: Record<string, string> = {
  "gradient-blue":
    "linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)",
  "gradient-purple":
    "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  "gradient-warm":
    "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
  "gradient-green":
    "linear-gradient(135deg, #84fab0 0%, #8fd3f4 100%)",
  "gradient-dark":
    "linear-gradient(135deg, #232526 0%, #414345 100%)",
};

interface HomeBackgroundProps {
  app?: { vault: any };
  mode: BgMode;
  imageDataUrl?: string;
  imageSource?: "dataUrl" | "vault";
  height?: number;
  /** Avatar: dataURL 图片 */
  avatar?: string;
  /** Avatar 来源 */
  avatarSource?: "dataUrl" | "vault" | "emoji" | "none";
  /** Avatar emoji（如果 source=emoji） */
  avatarEmoji?: string;
  /** 标题（在 banner 上） */
  title?: string;
  /** 标题颜色覆盖（dark/light） */
  titleColor?: "light" | "dark";
  /** 点击 avatar 回调（弹设置） */
  onAvatarClick?: () => void;
}

export function HomeBackground({
  app,
  mode,
  imageDataUrl,
  imageSource = "dataUrl",
  height = 280,
  avatar,
  avatarSource = "dataUrl",
  avatarEmoji = "👋",
  title,
  titleColor = "light",
  onAvatarClick,
}: HomeBackgroundProps) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [resolvedAvatar, setResolvedAvatar] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "image" || !imageDataUrl) {
      setResolvedUrl(null);
      return;
    }
    if (imageSource === "dataUrl") {
      setResolvedUrl(imageDataUrl);
      return;
    }
    if (app?.vault) {
      const file = app.vault.getAbstractFileByPath(imageDataUrl);
      if (file instanceof TFile) {
        setResolvedUrl(app.vault.getResourcePath(file));
        return;
      }
    }
    setResolvedUrl(null);
  }, [mode, imageDataUrl, imageSource, app]);

  useEffect(() => {
    if (avatarSource !== "vault" || !avatar || !app?.vault) {
      setResolvedAvatar(avatarSource === "dataUrl" ? (avatar ?? null) : null);
      return;
    }
    const file = app.vault.getAbstractFileByPath(avatar);
    if (file instanceof TFile) {
      setResolvedAvatar(app.vault.getResourcePath(file));
    } else {
      setResolvedAvatar(null);
    }
  }, [avatar, avatarSource, app]);

  if (mode === "none") return null;

  let background: string;
  if (mode === "image" && resolvedUrl) {
    background = `url(${resolvedUrl}) center/cover no-repeat`;
  } else if (mode in GRADIENTS) {
    background = GRADIENTS[mode];
  } else {
    return null;
  }

  return (
    <div
      className={`notion-home-bg ${titleColor === "light" ? "is-light-title" : "is-dark-title"}`}
      style={{ height }}
      aria-hidden
    >
      {/* 真正的图片/渐变层（用 clip 容器裁切，不影响 avatar） */}
      <div
        className="notion-home-bg-clip"
        style={{ background }}
      />
      {/* 标题（如果提供）*/}
      {title && (
        <div className="notion-home-bg-title">{title}</div>
      )}
      {/* Avatar */}
      {(resolvedAvatar || avatarSource === "emoji") && (
        <div
          className="notion-home-avatar"
          style={{ bottom: -36, cursor: onAvatarClick ? "pointer" : "default" }}
          onClick={onAvatarClick}
          title="点击更换头像"
        >
          {avatarSource === "emoji" || !resolvedAvatar ? (
            <span className="notion-home-avatar-emoji">{avatarEmoji}</span>
          ) : (
            <img src={resolvedAvatar} alt="avatar" />
          )}
          {onAvatarClick && <span className="notion-home-avatar-edit">✎</span>}
        </div>
      )}
    </div>
  );
}

export const BG_OPTIONS: { value: BgMode; label: string; preview: string }[] = [
  { value: "none", label: "无", preview: "transparent" },
  { value: "gradient-blue", label: "蓝紫渐变", preview: GRADIENTS["gradient-blue"] },
  { value: "gradient-purple", label: "紫色渐变", preview: GRADIENTS["gradient-purple"] },
  { value: "gradient-warm", label: "暖橙渐变", preview: GRADIENTS["gradient-warm"] },
  { value: "gradient-green", label: "薄荷渐变", preview: GRADIENTS["gradient-green"] },
  { value: "gradient-dark", label: "深色渐变", preview: GRADIENTS["gradient-dark"] },
  { value: "image", label: "自定义图片", preview: "image" },
];
