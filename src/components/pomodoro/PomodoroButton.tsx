// PomodoroButton - 任务行右侧的小"番茄"按钮
// 行为：
//   - 未在 pomodoro focus：显示 🍅 ▶，点击 → 启动 pomodoro focus 并关联本任务
//   - 正在跑 focus（关联到本任务）：显示 🔴 25:00（实时），点击 → 打开 PomodoroOverlay
//   - 正在跑 focus（关联到别的任务）：显示 🍅 (其他)，点击 → 切换关联（提示用户）
//   - 正在跑 break：显示 ☕，点击 → 打开 overlay 跳过
//
// 作为 React 组件嵌入到 TaskTable / Board / Gantt 的 timer 列里。

import React, { useEffect, useState } from "react";
import type { PomodoroService } from "../../services/pomodoroService";
import { formatHMS } from "../../services/timeTracker";

interface PomodoroButtonProps {
  service: PomodoroService;
  taskFile: string;
  taskText: string;
  /** 点击主按钮：未跑时启动；跑着时打开 overlay */
  onOpenOverlay: () => void;
  language?: "zh" | "en";
  size?: "sm" | "md";
}

export function PomodoroButton({ service, taskFile, taskText, onOpenOverlay, language = "zh", size = "sm" }: PomodoroButtonProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsub = service.onTick(() => setTick((n) => n + 1));
    return unsub;
  }, [service]);

  // 强制重渲染（tick 用来触发）
  void tick;

  const state = service.getState();
  const isCurrentFocus = state.phase === "focus" && state.linkedTaskFile === taskFile;
  const isOtherFocus = state.phase === "focus" && state.linkedTaskFile && state.linkedTaskFile !== taskFile;
  const isBreak = state.phase === "shortBreak" || state.phase === "longBreak";
  const isIdle = state.phase === "idle";

  const sizeStyle = size === "sm"
    ? { padding: "2px 8px", fontSize: "11px", gap: "4px" }
    : { padding: "4px 12px", fontSize: "13px", gap: "6px" };

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    border: "1px solid var(--background-modifier-border)",
    borderRadius: "4px",
    background: "transparent",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontWeight: "500",
    ...sizeStyle,
  };

  if (isCurrentFocus) {
    return (
      <button
        className="notion-pomodoro-btn is-running"
        style={{
          ...baseStyle,
          background: "rgba(232,93,93,0.12)",
          color: "#e85d5d",
          borderColor: "rgba(232,93,93,0.4)",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onOpenOverlay();
        }}
        title={language === "en" ? "Pomodoro focus is running — click to open" : "番茄专注中 - 点击打开"}
      >
        <span style={{ fontSize: size === "sm" ? "10px" : "13px" }}>🔴</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatHMS(state.remainingMs)}</span>
      </button>
    );
  }

  if (isOtherFocus) {
    return (
      <button
        className="notion-pomodoro-btn is-other"
        style={baseStyle}
        onClick={(e) => {
          e.stopPropagation();
          // 询问：切换到本任务？
          if (confirm(language === "en"
            ? `A pomodoro is running on "${state.linkedTaskText}". Switch focus to "${taskText}"?`
            : `当前正在为「${state.linkedTaskText}」专注。要切换到「${taskText}」吗？`)) {
            // 停掉旧的，启动新的
            service.stop();
            service.startFocus(taskFile, taskText);
            onOpenOverlay();
          }
        }}
        title={language === "en"
          ? `Focused on: ${state.linkedTaskText}`
          : `正在为「${state.linkedTaskText}」专注`}
      >
        <span>🍅</span>
        <span>{language === "en" ? "Other" : "其他"}</span>
      </button>
    );
  }

  if (isBreak) {
    return (
      <button
        className="notion-pomodoro-btn is-break"
        style={{
          ...baseStyle,
          background: "rgba(78,201,176,0.12)",
          color: "#4ec9b0",
          borderColor: "rgba(78,201,176,0.4)",
        }}
        onClick={(e) => {
          e.stopPropagation();
          onOpenOverlay();
        }}
        title={language === "en" ? "On break — click to open" : "休息中 - 点击打开"}
      >
        <span>☕</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatHMS(state.remainingMs)}</span>
      </button>
    );
  }

  // idle
  return (
    <button
      className="notion-pomodoro-btn is-idle"
      style={baseStyle}
      onClick={(e) => {
        e.stopPropagation();
        service.startFocus(taskFile, taskText);
        onOpenOverlay();
      }}
      title={language === "en" ? "Start a pomodoro" : "开始一个番茄"}
    >
      <span>🍅</span>
      <span>{size === "sm" ? "" : (language === "en" ? "Start" : "开始")}</span>
    </button>
  );
}
