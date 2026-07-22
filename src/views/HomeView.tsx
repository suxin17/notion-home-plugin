// Home 视图 - Notion 风格
// 布局：
//   1. 顶部 banner（图片）+ 左下角 avatar
//   2. 大标题 + 工具栏（Notion 风格）
//   3. 两栏布局：左 Tasks / 右 Work（含 pie + heatmap）
//   4. 底部：快速创建 / 最近 / 其它

import { ItemView, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import React, { useEffect, useState, useMemo } from "react";
import type NotionHomePlugin from "../../main";
import { today, relativeDate } from "../utils/date";
import { greeting, greetingSub } from "../services/greeting";
import type { Task } from "../types";
import { Heatmap } from "../components/home/Heatmap";
import { PieChart } from "../components/home/PieChart";
import { HomeBackground } from "../components/home/HomeBackground";
import { NotionHero } from "../components/home/NotionHero";
import { StreakCard } from "../components/home/StreakCard";
import { HabitCard } from "../components/habits/HabitCard";
import { STAT_RANGES, STAT_RANGE_LABELS, type StatRange } from "../services/timeTracker";
import { PIE_MODE_LABELS, type PieMode } from "../components/home/PieChart";
import { parseQuickCapture, mergeTemplateOpts, pickFolderForTemplate, QUICK_CAPTURE_PREFIXES } from "../templates/taskTemplates";

const PIE_MODES: PieMode[] = ["status", "tag", "file"];

export const VIEW_TYPE_HOME = "notion-home-view";

export class HomeView extends ItemView {
  private root: Root | null = null;
  private plugin: NotionHomePlugin;

  constructor(leaf: WorkspaceLeaf, plugin: NotionHomePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_HOME; }
  getDisplayText(): string { return "Home"; }
  getIcon(): string { return "home"; }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();
    container.addClass("notion-home-container");
    this.root = createRoot(container);
    this.root.render(<HomeScreen plugin={this.plugin} />);
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}

function HomeScreen({ plugin }: { plugin: NotionHomePlugin }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [recent, setRecent] = useState(plugin.noteService.getRecentFiles(5));
  const [quickInput, setQuickInput] = useState("");
  const [heatKey, setHeatKey] = useState(0);
  // 统计周期（本周/本月/本年），影响 pie + heatmap。默认从设置读。
  const [statRange, setStatRange] = useState<StatRange>(
    (plugin.settings.statRangeDefault as StatRange) || "month"
  );
  // 扇形图分组维度（按状态/按 tag/按任务）
  const [pieMode, setPieMode] = useState<PieMode>(
    (plugin.settings.pieChartMode as PieMode) || "status"
  );
  // 本地语言 state（点击切换按钮立即生效，保存到 settings 持久化）
  const [langLocal, setLangLocal] = useState<"zh" | "en">(
    (plugin.settings.greetingLanguage as "zh" | "en") || "zh"
  );
  const lang = langLocal;

  // 订阅语言变化（其他 view 切换语言时同步过来）
  useEffect(() => {
    const unsub = plugin.onLanguageChange(() => {
      setLangLocal((plugin.settings.greetingLanguage as "zh" | "en") || "zh");
    });
    return unsub;
  }, [plugin]);

  useEffect(() => {
    const reload = async () => {
      const all = await plugin.taskService.getAllTasks();
      setTasks(all);
      setRecent(plugin.noteService.getRecentFiles(5));
    };
    reload();
    return plugin.taskService.subscribe(reload);
  }, [plugin]);

  useEffect(() => {
    const unsub = plugin.timeTracker.subscribe(() => setHeatKey((n) => n + 1));
    return unsub;
  }, [plugin]);

  useEffect(() => {
    const id = window.setInterval(() => setHeatKey((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    const active = tasks.filter((t) => t.status === "Doing" || t.status === "Prepare");
    const todayStr = today();
    const overdue = active.filter((t) => t.completionDate && t.completionDate < todayStr);
    const dueToday = active.filter((t) => t.completionDate === todayStr);
    return { total: active.length, overdue: overdue.length, today: dueToday.length };
  }, [tasks]);

  const mods = plugin.settings.modules.home;

  // avatar
  let avatarDataUrl: string | undefined;
  let avatarSource: "dataUrl" | "vault" | "emoji" = "emoji";
  if (plugin.settings.homeAvatarSource === "dataUrl" && plugin.settings.homeAvatarDataUrl) {
    avatarDataUrl = plugin.settings.homeAvatarDataUrl;
    avatarSource = "dataUrl";
  } else if (plugin.settings.homeAvatarSource === "vault" && plugin.settings.homeAvatarVaultPath) {
    avatarDataUrl = plugin.settings.homeAvatarVaultPath;
    avatarSource = "vault";
  } else if (plugin.settings.homeAvatarSource === "emoji") {
    avatarSource = "emoji";
  }

  const handleQuickCapture = async () => {
    const text = quickInput.trim();
    if (!text) return;
    const parsed = parseQuickCapture(text);
    if (parsed) {
      // /note <name> → 普通笔记（不带 frontmatter）
      if (parsed.rawPrefix === "/note") {
        if (parsed.title) await plugin.noteService.createNote(parsed.title);
      } else {
        // /exp /paper /task → 套模板建任务
        const title = parsed.title || `${parsed.template}-${Date.now()}`;
        const tplOpts = mergeTemplateOpts(parsed.template, {
          start: today(),
        });
        // 根据 template 选 folder（用 settings 里的配置）
        const folder = pickFolderForTemplate(plugin.settings, parsed.template);
        await plugin.taskService.createTask(title, {
          ...tplOpts,
          folder,
        });
      }
    } else {
      // 没有前缀 → 当成普通任务
      await plugin.taskService.createTask(text);
    }
    setQuickInput("");
  };

  /** 打开设置面板 */
  const openSettings = () => {
    // @ts-ignore - Obsidian 提供全局 openSettings API
    if (typeof app.setting === "function") {
      // @ts-ignore
      app.setting.open();
      // @ts-ignore
      app.setting.openTabById("notion-home-plugin");
    }
  };

  const dueSoon = useMemo(() => {
    return tasks
      .filter((t) => (t.status === "Doing" || t.status === "Prepare") && (t.completionDate === today() || (t.completionDate && t.completionDate < today())))
      .sort((a, b) => (a.completionDate || "z").localeCompare(b.completionDate || "z"))
      .slice(0, 5);
  }, [tasks]);

  return (
    <div className="notion-home">
      {/* 顶部 banner + avatar */}
      {plugin.settings.homeBackground !== "none" && (
        <HomeBackground
          app={plugin.app}
          mode={plugin.settings.homeBackground}
          imageDataUrl={plugin.settings.homeBackgroundImage}
          imageSource={plugin.settings.homeBackgroundSource}
          height={plugin.settings.homeBackgroundHeight}
          title={plugin.settings.homeBannerTitle || undefined}
          titleColor={plugin.settings.homeTitleColor}
          avatar={avatarDataUrl}
          avatarSource={avatarSource}
          avatarEmoji={plugin.settings.homeAvatarEmoji}
          onAvatarClick={() => openSettings()}
        />
      )}

      {/* 顶部 banner 已关但有 avatar：单独显示 avatar */}
      {plugin.settings.homeBackground === "none" && (
        <div className="notion-home-avatar-standalone">
          <div
            className="notion-home-avatar"
            style={{ position: "relative", bottom: 0, cursor: "pointer" }}
            onClick={() => openSettings()}
            title="点击更换头像"
          >
            {avatarSource === "emoji" || !avatarDataUrl ? (
              <span className="notion-home-avatar-emoji">{plugin.settings.homeAvatarEmoji}</span>
            ) : (
              <img src={avatarDataUrl as string} alt="avatar" />
            )}
            <span className="notion-home-avatar-edit">✎</span>
          </div>
        </div>
      )}

      {/* 大标题区 + 工具栏 */}
      {mods.greeting && (
        <div className="notion-home-hero-wrap">
          <NotionHero
            title={plugin.settings.homePageTitle}
            subtitle={`${greeting(lang)} · ${today()}`}
            language={lang}
          />
          {/* 语言切换按钮 */}
          <div className="notion-lang-toggle" role="tablist" aria-label="语言">
            <button
              role="tab"
              aria-selected={lang === "zh"}
              className={`notion-lang-btn${lang === "zh" ? " is-active" : ""}`}
              onClick={async () => {
                plugin.settings.greetingLanguage = "zh";
                await plugin.saveSettings();
                plugin.emitLanguageChange();
              }}
              title="切换到中文"
            >
              中
            </button>
            <button
              role="tab"
              aria-selected={lang === "en"}
              className={`notion-lang-btn${lang === "en" ? " is-active" : ""}`}
              onClick={async () => {
                plugin.settings.greetingLanguage = "en";
                await plugin.saveSettings();
                plugin.emitLanguageChange();
              }}
              title="Switch to English"
            >
              EN
            </button>
          </div>
        </div>
      )}

      {/* 两栏布局 */}
      <div className="notion-home-twocol">
        {/* 左栏：Tasks 摘要 + Due Soon */}
        <div className="notion-home-col">
          {mods.taskSummary && (
            <section className="notion-home-card">
              <div className="notion-home-card-header">
                <span className="notion-home-card-title">
                  <span className="notion-home-card-icon">✅</span>
                  {lang === "en" ? "Tasks" : "任务"}
                </span>
                <button
                  className="notion-home-card-action"
                  onClick={() => plugin.activateTaskView()}
                >
                  {lang === "en" ? "Open →" : "打开 →"}
                </button>
              </div>
              <div className="notion-home-stats">
                <div className="notion-home-stat">
                  <div className="notion-home-stat-num">{stats.total}</div>
                  <div className="notion-home-stat-label">{lang === "en" ? "Active" : "进行中"}</div>
                </div>
                <div className="notion-home-stat notion-home-stat-warn">
                  <div className="notion-home-stat-num">{stats.today}</div>
                  <div className="notion-home-stat-label">{lang === "en" ? "Today" : "今天"}</div>
                </div>
                <div className="notion-home-stat notion-home-stat-danger">
                  <div className="notion-home-stat-num">{stats.overdue}</div>
                  <div className="notion-home-stat-label">{lang === "en" ? "Overdue" : "已逾期"}</div>
                </div>
              </div>
              {dueSoon.length > 0 && (
                <ul className="notion-home-mini-list">
                  {dueSoon.map((t) => (
                    <li
                      key={t.id}
                      className="notion-home-mini-item"
                      onClick={() => plugin.app.workspace.getLeaf().openFile(t.file as any)}
                    >
                      <span className="notion-home-mini-prio">
                        {t.priority === "high" ? "🔺" : t.priority === "medium" ? "🔼" : ""}
                      </span>
                      <span className="notion-home-mini-text">{t.basename}</span>
                      <span className={`notion-home-mini-due ${t.completionDate === today() ? "is-today" : ""}`}>
                        📅 {relativeDate(t.completionDate || "")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {mods.streak && (
            <StreakCard plugin={plugin} language={lang} />
          )}

          {mods.habits && (
            <HabitCard plugin={plugin} language={lang} />
          )}

          {mods.quickCreate && (
            <section className="notion-home-card">
              <div className="notion-home-card-header">
                <span className="notion-home-card-title">
                  <span className="notion-home-card-icon">⚡</span>
                  {lang === "en" ? "Quick Capture" : "快速创建"}
                </span>
              </div>
              <div className="notion-home-quick">
                <input
                  type="text"
                  className="notion-home-quick-input"
                  placeholder={
                    lang === "en"
                      ? "/exp my experiment  ·  /paper Smith 2024  ·  or just type a task"
                      : "/exp 跑一组对照实验  ·  /paper Smith-2024  ·  或直接输入任务名"
                  }
                  value={quickInput}
                  onChange={(e) => setQuickInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleQuickCapture();
                  }}
                />
                <button className="notion-home-quick-btn" onClick={handleQuickCapture}>
                  {lang === "en" ? "Add" : "添加"}
                </button>
              </div>
              <div className="notion-home-quick-hints">
                {QUICK_CAPTURE_PREFIXES.slice(0, 3).map((p) => (
                  <span key={p.prefix} className="notion-home-quick-hint" title={p.hint}>
                    {p.prefix}
                  </span>
                ))}
              </div>
            </section>
          )}

          {mods.recent && (
            <section className="notion-home-card">
              <div className="notion-home-card-header">
                <span className="notion-home-card-title">
                  <span className="notion-home-card-icon">📝</span>
                  {lang === "en" ? "Recent" : "最近编辑"}
                </span>
              </div>
              {recent.length === 0 ? (
                <div className="notion-home-empty">{lang === "en" ? "No notes yet" : "还没有笔记"}</div>
              ) : (
                <ul className="notion-home-recent">
                  {recent.map((f) => (
                    <li
                      key={f.path}
                      className="notion-home-recent-item"
                      onClick={() => plugin.app.workspace.getLeaf().openFile(f)}
                    >
                      <span className="notion-home-recent-name">{f.basename}</span>
                      <span className="notion-home-recent-meta">
                        {relativeDate(new Date(f.stat.mtime).toISOString().slice(0, 10))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        {/* 右栏：Work（pie + heatmap） */}
        <div className="notion-home-col">
          {mods.heatmap && (
            <section className="notion-home-card notion-home-card-work">
              <div className="notion-home-card-header">
                <span className="notion-home-card-title">
                  <span className="notion-home-card-icon">📊</span>
                  {lang === "en" ? "Work" : "工作时间"}
                </span>
                <div className="notion-stat-tabs" role="tablist" aria-label="统计周期">
                  {STAT_RANGES.map((r) => (
                    <button
                      key={r}
                      role="tab"
                      aria-selected={statRange === r}
                      className={`notion-stat-tab${statRange === r ? " is-active" : ""}`}
                      onClick={() => setStatRange(r)}
                    >
                      {lang === "en" ? STAT_RANGE_LABELS[r].en : STAT_RANGE_LABELS[r].zh}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`notion-home-stats-row ${mods.pieChart ? "has-pie" : "no-pie"}`}>
                {mods.pieChart && plugin.settings.pieChartEnabled && (
                  <div className="notion-home-pie-wrap">
                    <div className="notion-pie-tabs" role="tablist" aria-label="扇形图分组">
                      {PIE_MODES.map((m) => (
                        <button
                          key={m}
                          role="tab"
                          aria-selected={pieMode === m}
                          className={`notion-stat-tab${pieMode === m ? " is-active" : ""}`}
                          onClick={() => setPieMode(m)}
                          title={lang === "en" ? PIE_MODE_LABELS[m].en : PIE_MODE_LABELS[m].zh}
                        >
                          {lang === "en" ? PIE_MODE_LABELS[m].en : PIE_MODE_LABELS[m].zh}
                        </button>
                      ))}
                    </div>
                    <PieChart
                      tasks={tasks}
                      timeLog={plugin.timeTracker.getLog()}
                      refreshKey={heatKey}
                      mode={pieMode}
                      language={lang}
                      range={statRange}
                    />
                  </div>
                )}
                <div className="notion-home-heatmap-wrap">
                  <Heatmap
                    range={statRange}
                    palette={plugin.settings.heatmapPalette}
                    language={lang}
                    refreshKey={heatKey}
                    getData={() => plugin.timeTracker.getHeatmapForRange(statRange)}
                  />
                </div>
              </div>
            </section>
          )}
        </div>
      </div>

      {/* 全部模块都关了的提示 */}
      {!mods.greeting && !mods.taskSummary && !mods.quickCreate && !mods.heatmap && !mods.recent && !mods.streak && !mods.habits && (
        <div className="notion-home-empty-all">
          <h2>🫥</h2>
          <p>{lang === "en" ? "All sub-modules are off." : "Home 主页的子模块都关了。"}</p>
          <p className="muted">
            {lang === "en"
              ? "Open settings to enable some."
              : "去 设置 → 第三方插件 → Notion-style Home & Tasks → Options → 📦 模块 打开几个吧。"}
          </p>
        </div>
      )}
    </div>
  );
}
