// TimeAdjustMenu - 时间调整菜单
// 触发器：⏱️ 1h 30m 按钮
// 点击弹菜单：快速调整 +15m / +30m / +1h / -15m / 自定义 / 清零
//
// 也包含开始/停止计时（如果有 currentTimer 上下文）

import React, { useState, useRef, useEffect } from "react";
import { formatHM, formatHMS } from "../../services/timeTracker";
import type { Task } from "../../types";

interface TimeAdjustMenuProps {
  task: Task;
  /** 是否在计时中（这个任务是不是 current） */
  isCurrent?: boolean;
  /** 当前任务的实时已计毫秒（仅当 isCurrent 时有效） */
  currentElapsedMs?: number;
  /** 切换计时 */
  onToggleTimer: (task: Task) => void;
  /** 调整时间（+/- 秒） */
  onAdjust: (task: Task, deltaSeconds: number) => void | Promise<void>;
  /** 自定义时间（设置绝对值） */
  onSet: (task: Task, totalSeconds: number) => void | Promise<void>;
  /** 显示模式：button（默认）/ chip（Notion 风） */
  variant?: "button" | "chip" | "compact";
}

export function TimeAdjustMenu({
  task,
  isCurrent = false,
  currentElapsedMs = 0,
  onToggleTimer,
  onAdjust,
  onSet,
  variant = "button",
}: TimeAdjustMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  // 显示时间：当前计时中显示实时时间；否则显示累计
  const totalMs = (task.totalSeconds || 0) * 1000 + (isCurrent ? currentElapsedMs : 0);
  const displayTime = isCurrent ? currentElapsedMs : totalMs;
  const hasTime = totalMs > 0;
  const isTiming = isCurrent;

  // 触发按钮
  const renderTrigger = () => {
    if (variant === "chip") {
      // Notion 风 chip
      return (
        <button
          className={`notion-time-chip ${isTiming ? "is-current" : ""} ${hasTime ? "has-time" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          title={isTiming ? "正在计时" : "点击调整时间"}
        >
          {isTiming && <span className="notion-time-chip-dot" />}
          {isTiming ? "🔴 " : hasTime ? "⏱️ " : "○ "}
          {isTiming ? formatHMS(displayTime) : (hasTime ? formatHM(displayTime) : "未计时")}
        </button>
      );
    }
    if (variant === "compact") {
      return (
        <button
          className={`notion-time-compact ${isTiming ? "is-current" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          title="点击调整时间"
        >
          {isTiming ? "🔴" : "⏱️"}
          {hasTime && <span>{formatHM(displayTime)}</span>}
        </button>
      );
    }
    // 默认 button
    return (
      <button
        className={`notion-time-btn ${isTiming ? "is-current" : ""} ${hasTime ? "has-time" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={isTiming ? "正在计时 - 点击调整/停止" : "点击调整时间"}
      >
        {isTiming ? "🔴" : "⏱️"}
        {isTiming ? formatHMS(displayTime) : (hasTime ? formatHM(displayTime) : "未计时")}
      </button>
    );
  };

  return (
    <div className="notion-time-wrap" ref={wrapRef} onClick={(e) => e.stopPropagation()}>
      {renderTrigger()}
      {open && (
        <div className="notion-time-menu" onClick={(e) => e.stopPropagation()}>
          <div className="notion-time-menu-header">
            ⏱️ {isTiming ? "正在计时" : "时间调整"}
            {hasTime && <span className="notion-time-menu-total">总计 {formatHM(displayTime)}</span>}
          </div>

          {/* 计时控制 */}
          <div className="notion-time-menu-section">
            <button
              className={`notion-time-menu-action ${isTiming ? "is-stop" : "is-start"}`}
              onClick={async () => {
                await onToggleTimer(task);
                setOpen(false);
              }}
            >
              {isTiming ? "⏸ 停止计时" : "▶ 开始计时"}
            </button>
          </div>

          {!isTiming && (
            <>
              {/* 快速增加 */}
              <div className="notion-time-menu-section">
                <div className="notion-time-menu-label">增加</div>
                <div className="notion-time-menu-grid">
                  {[
                    { label: "+15m", delta: 15 * 60 },
                    { label: "+30m", delta: 30 * 60 },
                    { label: "+1h", delta: 3600 },
                    { label: "+2h", delta: 7200 },
                  ].map((o) => (
                    <button
                      key={o.label}
                      className="notion-time-menu-quick is-add"
                      onClick={async () => {
                        await onAdjust(task, o.delta);
                        setOpen(false);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 快速减少 */}
              <div className="notion-time-menu-section">
                <div className="notion-time-menu-label">减少</div>
                <div className="notion-time-menu-grid">
                  {[
                    { label: "-15m", delta: -15 * 60 },
                    { label: "-30m", delta: -30 * 60 },
                    { label: "-1h", delta: -3600 },
                  ].map((o) => (
                    <button
                      key={o.label}
                      className="notion-time-menu-quick is-sub"
                      onClick={async () => {
                        await onAdjust(task, o.delta);
                        setOpen(false);
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 自定义 */}
              <div className="notion-time-menu-section">
                <div className="notion-time-menu-label">自定义</div>
                <div className="notion-time-menu-custom">
                  <button
                    className="notion-time-menu-quick"
                    onClick={() => {
                      const v = window.prompt("设置总时间（分钟）", "0");
                      if (v === null) return;
                      const m = parseFloat(v);
                      if (isNaN(m) || m < 0) return;
                      onSet(task, m * 60);
                      setOpen(false);
                    }}
                  >
                    ⌨ 自定义...
                  </button>
                </div>
              </div>

              {hasTime && (
                <div className="notion-time-menu-section">
                  <button
                    className="notion-time-menu-action is-clear"
                    onClick={async () => {
                      if (confirm("清零时间？")) {
                        await onSet(task, 0);
                        setOpen(false);
                      }
                    }}
                  >
                    🗑 清零
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
