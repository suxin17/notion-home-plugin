// PomodoroOverlay - 全屏专注模式遮罩
//
// 行为：
//   - 挂在 Workspace Modal 上（最高层级，阻断其他 UI）
//   - 大圆环 + 倒计时 + 当前阶段文字
//   - focus / shortBreak / longBreak 视觉不同
//   - 底部：停止 / 跳过 / 切换任务
//   - 播放 / 暂停用切换 phase 处理：focus 状态点"停止"→ idle
//   - 自动从 timeTracker 实时读 elapsed（如果绑定了 task）

import React, { useEffect, useState } from "react";
import { App, Modal } from "obsidian";
import type { PomodoroService, PomodoroState, PomodoroPhase } from "../../services/pomodoroService";
import { PHASE_LABELS } from "../../services/pomodoroService";
import { formatHMS } from "../../services/timeTracker";

interface PomodoroOverlayOptions {
  app: App;
  service: PomodoroService;
  language: "zh" | "en";
  /** 当前正在计时的任务（用于在 overlay 顶显示） */
  getCurrentTaskText: () => string | null;
  /** 切换到 / 解除绑定某个 task */
  onLinkTask: (taskFile: string | null, taskText: string | null) => void;
}

export class PomodoroOverlay extends Modal {
  private service: PomodoroService;
  private language: "zh" | "en";
  private getCurrentTaskText: () => string | null;
  private onLinkTask: (taskFile: string | null, taskText: string | null) => void;
  private unsubTick: (() => void) | null = null;
  private forceUpdateTick: (() => void) | null = null;

  constructor(opts: PomodoroOverlayOptions) {
    super(opts.app);
    this.service = opts.service;
    this.language = opts.language;
    this.getCurrentTaskText = opts.getCurrentTaskText;
    this.onLinkTask = opts.onLinkTask;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("notion-pomodoro-overlay");

    // 订阅 tick，每次更新内容
    this.unsubTick = this.service.onTick((_state) => {
      this.forceUpdate();
    });

    this.render();
  }

  onClose(): void {
    this.unsubTick?.();
    this.unsubTick = null;
  }

  private forceUpdate(): void {
    // Modal 没有 setState；用手动重渲染
    const { contentEl } = this;
    contentEl.empty();
    this.render();
  }

  private render(): void {
    const { contentEl } = this;
    const state = this.service.getState();
    const lang = this.language;
    const phaseLabel = PHASE_LABELS[state.phase];

    if (state.phase === "idle") {
      // idle 状态：直接关掉（外部会负责只在该打开时打开）
      this.close();
      return;
    }

    // 阶段颜色
    const phaseColor = state.phase === "focus" ? "#e85d5d"
      : state.phase === "shortBreak" ? "#4ec9b0"
        : "#7d8aff";
    const phaseBg = state.phase === "focus"
      ? "radial-gradient(circle at 50% 30%, #3a1f1f 0%, #0a0505 100%)"
      : state.phase === "shortBreak"
        ? "radial-gradient(circle at 50% 30%, #1f3a35 0%, #050a09 100%)"
        : "radial-gradient(circle at 50% 30%, #1f243a 0%, #050609 100%)";

    // 进度
    const total = state.phaseDurationMs || 1;
    const progress = 1 - state.remainingMs / total;

    contentEl.style.background = phaseBg;

    // 整体布局
    const wrap = contentEl.createDiv({ cls: "notion-pomodoro-wrap" });
    const ringWrap = wrap.createDiv({ cls: "notion-pomodoro-ring-wrap" });
    // 圆环：用 conic-gradient 画
    const ringSize = 320;
    const ringInner = ringSize - 18;
    ringWrap.style.width = `${ringSize}px`;
    ringWrap.style.height = `${ringSize}px`;
    ringWrap.style.borderRadius = "50%";
    ringWrap.style.background = `conic-gradient(${phaseColor} ${progress * 360}deg, rgba(255,255,255,0.08) 0deg)`;
    ringWrap.style.display = "flex";
    ringWrap.style.alignItems = "center";
    ringWrap.style.justifyContent = "center";
    ringWrap.style.boxShadow = `0 0 80px ${phaseColor}33`;

    const inner = ringWrap.createDiv({ cls: "notion-pomodoro-ring-inner" });
    inner.style.width = `${ringInner}px`;
    inner.style.height = `${ringInner}px`;
    inner.style.borderRadius = "50%";
    inner.style.background = "rgba(0,0,0,0.35)";
    inner.style.backdropFilter = "blur(12px)";
    inner.style.display = "flex";
    inner.style.flexDirection = "column";
    inner.style.alignItems = "center";
    inner.style.justifyContent = "center";
    inner.style.color = "#fff";
    inner.style.textAlign = "center";

    inner.createDiv({ cls: "notion-pomodoro-phase-icon", text: phaseLabel.icon }).style.cssText = "font-size:48px; margin-bottom:8px;";
    inner.createDiv({ cls: "notion-pomodoro-phase-label", text: lang === "en" ? phaseLabel.en : phaseLabel.zh }).style.cssText = "font-size:16px; opacity:0.7; letter-spacing:1px; text-transform:uppercase;";
    inner.createDiv({ cls: "notion-pomodoro-time", text: formatHMS(state.remainingMs) }).style.cssText = "font-size:56px; font-weight:300; font-variant-numeric:tabular-nums; letter-spacing:2px; margin-top:4px;";

    // 关联任务
    const taskText = state.linkedTaskText || this.getCurrentTaskText();
    if (taskText) {
      const taskLine = wrap.createDiv({ cls: "notion-pomodoro-task", text: `📌 ${taskText}` });
      taskLine.style.cssText = "color:rgba(255,255,255,0.85); font-size:15px; margin-top:24px; text-align:center; max-width:500px;";
    }

    // 进度小条
    const progressText = wrap.createDiv({ cls: "notion-pomodoro-progress-text" });
    progressText.style.cssText = "color:rgba(255,255,255,0.5); font-size:13px; margin-top:8px; text-align:center;";
    if (state.phase === "focus") {
      progressText.setText(
        lang === "en"
          ? `🍅 ${state.todayCount} today  ·  cycle ${state.focusInCycle + 1}/${this.service.getConfig().longBreakEvery}`
          : `🍅 今日 ${state.todayCount}  ·  本轮 ${state.focusInCycle + 1}/${this.service.getConfig().longBreakEvery}`
      );
    } else {
      progressText.setText(
        lang === "en"
          ? `When break ends, ${this.service.getConfig().focusMinutes} min focus ${this.service.getConfig().autoStartFocus ? "starts" : "ready"}`
          : `休息结束后${this.service.getConfig().autoStartFocus ? "自动" : ""}开始 ${this.service.getConfig().focusMinutes} 分钟专注`
      );
    }

    // 按钮区
    const btnRow = wrap.createDiv({ cls: "notion-pomodoro-btns" });
    btnRow.style.cssText = "display:flex; gap:12px; margin-top:32px;";

    if (state.phase === "focus") {
      const stopBtn = btnRow.createEl("button", { text: lang === "en" ? "⏹ Stop" : "⏹ 停止" });
      stopBtn.addEventListener("click", () => this.service.stop());
      Object.assign(stopBtn.style, {
        padding: "10px 24px",
        background: "rgba(232,93,93,0.85)",
        color: "#fff",
        border: "none",
        borderRadius: "8px",
        fontSize: "15px",
        cursor: "pointer",
        fontWeight: "500",
      });
    } else {
      // break 阶段
      const skipBtn = btnRow.createEl("button", { text: lang === "en" ? "⏭ Skip break" : "⏭ 跳过休息" });
      skipBtn.addEventListener("click", () => this.service.skipBreak());
      Object.assign(skipBtn.style, {
        padding: "10px 24px",
        background: "rgba(255,255,255,0.15)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "8px",
        fontSize: "15px",
        cursor: "pointer",
      });
    }
  }
}
