// StreakCard - 主页上的"连续打卡"卡
// 行为：
//   - 用 timeTracker.getStreak() 算出当前连续天数 + 史上最长
//   - 阈值：settings.streakMinSeconds（默认 60s = 任何计时都算打卡）
//   - 大火🔥 + 天数，下方一行：今日状态 / 史上最长
//   - 顶部右侧：今日番茄数（来自 PomodoroService）

import React, { useEffect, useState } from "react";
import type NotionHomePlugin from "../../../main";

interface StreakCardProps {
  plugin: NotionHomePlugin;
  language: "zh" | "en";
}

export function StreakCard({ plugin, language }: StreakCardProps) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsub = plugin.timeTracker.subscribe(() => setTick((n) => n + 1));
    return unsub;
  }, [plugin]);

  useEffect(() => {
    if (!plugin.pomodoroService) return;
    const unsub = plugin.pomodoroService.onTick(() => setTick((n) => n + 1));
    return unsub;
  }, [plugin]);

  void tick;

  const minSeconds = (plugin.settings as any).streakMinSeconds ?? 60;
  const streak = plugin.timeTracker.getStreak(minSeconds);
  const todayLabel = streak.todayActive
    ? (language === "en" ? "✅ Today" : "✅ 今日已打卡")
    : (language === "en" ? "○ Not yet" : "○ 今日未打卡");
  const pomoCount = plugin.pomodoroService ? plugin.pomodoroService.getTodayCount() : 0;

  return (
    <section className="notion-home-card notion-streak-card">
      <div className="notion-home-card-header">
        <span className="notion-home-card-title">
          <span className="notion-home-card-icon">🔥</span>
          {language === "en" ? "Streak" : "连续打卡"}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {pomoCount > 0 && (
            <span className="notion-streak-pomo" title={language === "en" ? "Pomodoros today" : "今日完成的番茄数"}>
              🍅 <b>{pomoCount}</b>
            </span>
          )}
          <span className="notion-streak-today">{todayLabel}</span>
        </div>
      </div>
      <div className="notion-streak-main">
        <div className="notion-streak-flame">
          {streak.current > 0 ? "🔥" : "🕊"}
        </div>
        <div className="notion-streak-number">{streak.current}</div>
        <div className="notion-streak-unit">
          {language === "en" ? (streak.current === 1 ? "day" : "days") : "天"}
        </div>
      </div>
      <div className="notion-streak-meta">
        <span>
          {language === "en" ? "Best" : "历史最长"}: <b>{streak.best}</b> {language === "en" ? "days" : "天"}
        </span>
        <span className="notion-streak-divider">·</span>
        <span>
          {language === "en" ? "Min" : "阈值"} {minSeconds}s {language === "en" ? "/ day" : "/ 天"}
        </span>
      </div>
    </section>
  );
}
