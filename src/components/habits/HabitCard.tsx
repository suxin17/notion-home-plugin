// HabitCard - 主页上的"习惯"卡
// 行为：
//   - 列出所有非 archived 的 habit
//   - 每个 habit 显示今天是否已勾选（点击 toggle）
//   - 顶部：今日完成率 + 本周 7 天小格（hover 显示日期+状态）
//   - "+ 添加" 按钮：弹 prompt 输名字
//   - 已 archived 的不进显示，但点 "管理" 打开 settings

import React, { useEffect, useMemo, useState } from "react";
import type NotionHomePlugin from "../../../main";

interface HabitCardProps {
  plugin: NotionHomePlugin;
  language: "zh" | "en";
}

export function HabitCard({ plugin, language }: HabitCardProps) {
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("✅");

  useEffect(() => {
    const unsub = plugin.habitService.subscribe(() => setTick((n) => n + 1));
    return unsub;
  }, [plugin]);

  void tick;

  const habits = plugin.habitService.getHabits(false);
  const today = plugin.habitService.getTodayStatus();
  const last7 = useMemo(() => plugin.habitService.getLastDays(7), [plugin, tick]);

  if (habits.length === 0 && !adding) {
    return (
      <section className="notion-home-card notion-habit-card">
        <div className="notion-home-card-header">
          <span className="notion-home-card-title">
            <span className="notion-home-card-icon">🌱</span>
            {language === "en" ? "Habits" : "习惯"}
          </span>
        </div>
        <div className="notion-habit-empty">
          <p>{language === "en" ? "No habits yet. Add one to start tracking." : "还没有习惯。加一个开始追踪吧。"}</p>
          <button
            className="mod-cta"
            onClick={() => setAdding(true)}
          >
            {language === "en" ? "+ Add habit" : "+ 添加习惯"}
          </button>
        </div>
      </section>
    );
  }

  const handleAdd = () => {
    if (!name.trim()) return;
    plugin.habitService.addHabit({ name: name.trim(), icon: icon || "✅" });
    setName("");
    setIcon("✅");
    setAdding(false);
  };

  const completionRate = today.total > 0 ? Math.round(today.rate * 100) : 0;

  return (
    <section className="notion-home-card notion-habit-card">
      <div className="notion-home-card-header">
        <span className="notion-home-card-title">
          <span className="notion-home-card-icon">🌱</span>
          {language === "en" ? "Habits" : "习惯"}
        </span>
        <div className="notion-habit-summary">
          <span className="notion-habit-rate">{today.done}/{today.total}</span>
          <span className="notion-habit-rate-pct">({completionRate}%)</span>
          {!adding ? (
            <button
              className="notion-home-card-action"
              onClick={() => setAdding(true)}
              title={language === "en" ? "Add habit" : "添加习惯"}
            >
              {language === "en" ? "+ Add" : "+ 添加"}
            </button>
          ) : (
            <button
              className="notion-home-card-action"
              onClick={() => { setAdding(false); setName(""); }}
            >
              {language === "en" ? "Cancel" : "取消"}
            </button>
          )}
        </div>
      </div>

      {/* 本周 7 天小格 */}
      {habits.length > 0 && (
        <div className="notion-habit-week" aria-label={language === "en" ? "Last 7 days" : "近 7 天"}>
          {last7.map((day, i) => {
            const d = new Date(day.date);
            const weekday = language === "en"
              ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]
              : ["日", "一", "二", "三", "四", "五", "六"][d.getDay()];
            return (
              <div key={day.date} className="notion-habit-week-cell">
                <div className="notion-habit-week-day">{weekday}</div>
                <div
                  className="notion-habit-week-box"
                  style={{
                    background: day.rate >= 1 ? "var(--interactive-accent)" :
                                day.rate >= 0.5 ? "var(--interactive-accent-hover)" :
                                day.rate > 0 ? "var(--interactive-accent-faint)" :
                                "var(--background-modifier-border)",
                    opacity: day.rate > 0 ? 0.9 : 0.3,
                  }}
                  title={`${day.date}: ${day.done}/${day.total}`}
                >
                  <span className="notion-habit-week-num">{d.getDate()}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 添加表单 */}
      {adding && (
        <div className="notion-habit-addform">
          <input
            className="notion-habit-icon-input"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            maxLength={2}
            placeholder="📚"
            aria-label="icon"
          />
          <input
            className="notion-habit-name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={language === "en" ? "Habit name" : "习惯名"}
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          />
          <button className="mod-cta" onClick={handleAdd} disabled={!name.trim()}>
            {language === "en" ? "Add" : "添加"}
          </button>
        </div>
      )}

      {/* 习惯列表 */}
      {habits.length > 0 && (
        <ul className="notion-habit-list">
          {habits.map((h) => {
            const done = today.byHabit[h.id] || false;
            const c = plugin.habitService.getCheckin(h.id, today.date);
            const streak = plugin.habitService.getHabitStreak(h.id);
            return (
              <li key={h.id} className={`notion-habit-item ${done ? "is-done" : ""}`}>
                <button
                  className="notion-habit-check"
                  style={{ borderColor: h.color, background: done ? h.color : "transparent", color: done ? "#fff" : h.color }}
                  onClick={() => plugin.habitService.toggle(h.id)}
                  title={done
                    ? (language === "en" ? "Click to uncheck" : "点击取消")
                    : (language === "en" ? "Click to check" : "点击勾选")}
                  aria-pressed={done}
                >
                  {done ? "✓" : ""}
                </button>
                <span className="notion-habit-icon" style={{ color: h.color }}>{h.icon}</span>
                <span className="notion-habit-name">{h.name}</span>
                {h.mode === "count" && c && c.count > 1 && (
                  <span className="notion-habit-count">×{c.count}</span>
                )}
                {h.mode === "count" && (
                  <button
                    className="notion-habit-plus"
                    onClick={() => plugin.habitService.increment(h.id)}
                    title={language === "en" ? "+1" : "+1"}
                  >+</button>
                )}
                {streak > 0 && (
                  <span className="notion-habit-streak" title={language === "en" ? `Streak: ${streak} days` : `连续 ${streak} 天`}>
                    🔥{streak}
                  </span>
                )}
                <button
                  className="notion-habit-del"
                  onClick={() => {
                    if (confirm(language === "en" ? `Delete habit "${h.name}"?` : `删除习惯「${h.name}」？`)) {
                      plugin.habitService.removeHabit(h.id);
                    }
                  }}
                  title={language === "en" ? "Delete" : "删除"}
                  aria-label="delete"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
