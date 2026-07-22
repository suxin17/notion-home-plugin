// 插件设置面板
// 在 Obsidian 设置 → 第三方插件 → Notion-style Home & Tasks → Options 里出现

import { App, PluginSettingTab, Setting, Notice, TFile } from "obsidian";
import type NotionHomePlugin from "../../main";
import type { PluginSettings } from "../../main";
import { BG_OPTIONS, type BgMode } from "../components/home/HomeBackground";
import { VaultImageSuggestModal } from "./VaultImageSuggestModal";

export class NotionHomeSettingTab extends PluginSettingTab {
  private plugin: NotionHomePlugin;

  constructor(app: App, plugin: NotionHomePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("notion-home-settings");

    // ====== 启动 ======
    containerEl.createEl("h3", { text: "🚀 启动" });

    new Setting(containerEl)
      .setName("启动时打开 Home 主页")
      .setDesc("Obsidian 启动后自动打开 Home 标签页。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.openHomeOnStart).onChange(async (v) => {
          this.plugin.settings.openHomeOnStart = v;
          await this.plugin.saveSettings();
        })
      );

    // ====== 任务 ======
    containerEl.createEl("h3", { text: "✅ 任务" });

    new Setting(containerEl)
      .setName("Tasks 面板默认显示")
      .setDesc("打开 Tasks 面板时默认的过滤条件。")
      .addDropdown((d) =>
        d
          .addOption("Doing", "🟢 Doing")
          .addOption("Prepare", "🟡 Prepare")
          .addOption("Done", "🔵 Done")
          .addOption("Abandon", "⚪ Abandon")
          .addOption("all", "全部")
          .setValue(this.plugin.settings.defaultTaskFilter)
          .onChange(async (v) => {
            this.plugin.settings.defaultTaskFilter = v as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Tasks 面板默认视图")
      .setDesc("打开 Tasks 面板时显示哪种视图。")
      .addDropdown((d) =>
        d
          .addOption("board", "▦ 看板（推荐）")
          .addOption("list", "☰ 列表")
          .addOption("gantt", "📊 时间线")
          .setValue(this.plugin.settings.defaultTaskView)
          .onChange(async (v) => {
            this.plugin.settings.defaultTaskView = v as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("时间线默认显示周期")
      .setDesc("时间线（甘特图）视图默认的统计周期。打开时间线 tab 可临时切换。")
      .addDropdown((d) =>
        d
          .addOption("week", "📅 本周")
          .addOption("month", "🗓️ 本月")
          .addOption("year", "📆 本年")
          .setValue(this.plugin.settings.ganttRangeDefault)
          .onChange(async (v) => {
            this.plugin.settings.ganttRangeDefault = v as "week" | "month" | "year";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("任务时间显示精度")
      .setDesc("⏱️ 时长显示格式。")
      .addDropdown((d) =>
        d
          .addOption("auto", "自动（小于 1 小时显示 Xm）")
          .addOption("hm", "始终显示 Xh Ym")
          .addOption("h", "只显示小时")
          .setValue(this.plugin.settings.timeFormat)
          .onChange(async (v) => {
            this.plugin.settings.timeFormat = v as "auto" | "hm" | "h";
            await this.plugin.saveSettings();
          })
      );

    // ====== 任务模板 / 文件夹 ======
    containerEl.createEl("h3", { text: "📁 任务模板 & 文件夹" });
    const tplHint = containerEl.createDiv({ cls: "setting-item" });
    tplHint.createDiv({
      cls: "setting-item-description",
      text: "Quick Capture 输入 /exp <名称> /paper <名称> /task <名称> 会按下面的设置自动套模板 + 放文件夹。",
    });

    new Setting(containerEl)
      .setName("实验记录默认文件夹")
      .setDesc("新建实验任务（/exp）时存放的文件夹，不存在会自动创建。")
      .addText((t) =>
        t
          .setPlaceholder("Experiments")
          .setValue(this.plugin.settings.experimentFolder)
          .onChange(async (v) => {
            this.plugin.settings.experimentFolder = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("论文笔记默认文件夹")
      .setDesc("新建论文笔记（/paper）时存放的文件夹，不存在会自动创建。")
      .addText((t) =>
        t
          .setPlaceholder("Papers")
          .setValue(this.plugin.settings.paperFolder)
          .onChange(async (v) => {
            this.plugin.settings.paperFolder = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("普通任务默认文件夹")
      .setDesc("普通任务（/task 或无前缀）存放的文件夹，留空 = 根目录。")
      .addText((t) =>
        t
          .setPlaceholder("（留空 = 根目录）")
          .setValue(this.plugin.settings.taskFolder)
          .onChange(async (v) => {
            this.plugin.settings.taskFolder = v.trim();
            await this.plugin.saveSettings();
          })
      );

    // ====== 模块（sub-task 开关）======
    containerEl.createEl("h3", { text: "📦 模块" });
    const modulesHint = containerEl.createDiv({ cls: "setting-item" });
    modulesHint.createDiv({
      cls: "setting-item-description",
      text: "关闭不需要的子模块。每个视图的子功能都能独立开关。",
    });

    // ====== Home 主页（语言 + 背景） ======
    containerEl.createEl("h3", { text: "🎨 Home 主页外观" });

    new Setting(containerEl)
      .setName("主页问候语言")
      .setDesc("顶部欢迎区显示的语言。")
      .addDropdown((d) =>
        d
          .addOption("zh", "中文")
          .addOption("en", "English")
          .setValue(this.plugin.settings.greetingLanguage)
          .onChange(async (v) => {
            this.plugin.settings.greetingLanguage = v as "zh" | "en";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("页面上沿背景")
      .setDesc("像 Notion 一样在页面顶部显示 banner。")
      .addDropdown((d) => {
        BG_OPTIONS.forEach((opt) => d.addOption(opt.value, opt.label));
        d.setValue(this.plugin.settings.homeBackground)
          .onChange(async (v) => {
            this.plugin.settings.homeBackground = v as BgMode;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("主页大标题")
      .setDesc("显示在 banner 下方的大粗体标题。")
      .addText((t) =>
        t.setValue(this.plugin.settings.homePageTitle).onChange(async (v) => {
          this.plugin.settings.homePageTitle = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Banner 上小标题（可选）")
      .setDesc("显示在 banner 上的小字（Notion 在 banner 右上角显示页面名）。")
      .addText((t) =>
        t.setPlaceholder("如：Personal Home")
          .setValue(this.plugin.settings.homeBannerTitle)
          .onChange(async (v) => {
            this.plugin.settings.homeBannerTitle = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Banner 文字颜色")
      .setDesc("Banner 上小标题的颜色，浅色背景用 dark，深色背景用 light。")
      .addDropdown((d) =>
        d.addOption("light", "浅色（深色 banner 用）")
          .addOption("dark", "深色（浅色 banner 用）")
          .setValue(this.plugin.settings.homeTitleColor)
          .onChange(async (v) => {
            this.plugin.settings.homeTitleColor = v as "light" | "dark";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Avatar 头像（banner 左下角）")
      .setDesc("选个 emoji 当头像，或者用图片（从本机/vault）。")
      .addDropdown((d) =>
        d.addOption("none", "无")
          .addOption("emoji", "Emoji")
          .addOption("dataUrl", "本机图片")
          .addOption("vault", "Vault 图片")
          .setValue(this.plugin.settings.homeAvatarSource)
          .onChange(async (v) => {
            this.plugin.settings.homeAvatarSource = v as any;
            await this.plugin.saveSettings();
            this.display();
          })
      );

    if (this.plugin.settings.homeAvatarSource === "emoji") {
      new Setting(containerEl)
        .setName("Emoji")
        .addText((t) =>
          t.setValue(this.plugin.settings.homeAvatarEmoji).onChange(async (v) => {
            this.plugin.settings.homeAvatarEmoji = v;
            await this.plugin.saveSettings();
          })
        );
    } else if (this.plugin.settings.homeAvatarSource === "dataUrl") {
      new Setting(containerEl)
        .setName("选择本机图片")
        .addButton((b) =>
          b.setButtonText("📂 选择").onClick(async () => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = async () => {
              const file = input.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = async () => {
                this.plugin.settings.homeAvatarDataUrl = String(reader.result || "");
                await this.plugin.saveSettings();
                this.display();
              };
              reader.readAsDataURL(file);
            };
            input.click();
          })
        );
    } else if (this.plugin.settings.homeAvatarSource === "vault") {
      new Setting(containerEl)
        .setName("选择 vault 图片")
        .addButton((b) =>
          b.setButtonText("📁 选择").onClick(() => {
            const modal = new VaultImageSuggestModal(this.app, async (file: TFile) => {
              this.plugin.settings.homeAvatarVaultPath = file.path;
              await this.plugin.saveSettings();
              this.display();
              new Notice(`Avatar 已设为：${file.path}`);
            });
            modal.open();
          })
        );
    }

    new Setting(containerEl)
      .setName("背景高度")
      .setDesc("顶部 banner 的高度（像素），0-500。")
      .addSlider((s) =>
        s.setLimits(0, 500, 20)
          .setValue(this.plugin.settings.homeBackgroundHeight)
          .onChange(async (v) => {
            this.plugin.settings.homeBackgroundHeight = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("自定义背景图片")
      .setDesc("从本机或 vault 内选一张图片。仅在背景模式选「自定义图片」时生效。")
      .addButton((b) =>
        b.setButtonText("📂 本机选择").onClick(async () => {
          // 触发本机文件选择
          const input = document.createElement("input");
          input.type = "file";
          input.accept = "image/*";
          input.onchange = async () => {
            const file = input.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async () => {
              const dataUrl = String(reader.result || "");
              this.plugin.settings.homeBackgroundImage = dataUrl;
              this.plugin.settings.homeBackgroundSource = "dataUrl";
              await this.plugin.saveSettings();
              this.display();
              new Notice(`已加载本机图片：${file.name}`);
            };
            reader.readAsDataURL(file);
          };
          input.click();
        })
      )
      .addButton((b) =>
        b.setButtonText("📁 vault 选择").onClick(() => {
          const modal = new VaultImageSuggestModal(this.app, async (file: TFile) => {
            this.plugin.settings.homeBackgroundImage = file.path;
            this.plugin.settings.homeBackgroundSource = "vault";
            await this.plugin.saveSettings();
            this.display();
            new Notice(`已选 vault 图片：${file.path}`);
          });
          modal.open();
        })
      )
      .addButton((b) =>
        b.setButtonText("清除").setWarning().onClick(async () => {
          this.plugin.settings.homeBackgroundImage = "";
          await this.plugin.saveSettings();
          this.display();
        })
      );

    // 显示当前状态
    if (this.plugin.settings.homeBackgroundImage) {
      const statusEl = containerEl.createDiv({ cls: "notion-home-settings-image-status" });
      const source = this.plugin.settings.homeBackgroundSource;
      const preview = this.plugin.settings.homeBackgroundImage.length > 60
        ? this.plugin.settings.homeBackgroundImage.slice(0, 60) + "..."
        : this.plugin.settings.homeBackgroundImage;
      statusEl.createEl("div", {
        text: `当前：${source === "vault" ? "📁 vault" : "📂 本机"} · ${preview}`,
        cls: "muted",
      });
      // 缩略图（仅 dataUrl 能显示）
      if (source === "dataUrl") {
        const img = statusEl.createEl("img", { cls: "notion-home-settings-thumb" });
        img.src = this.plugin.settings.homeBackgroundImage;
      }
    }

    // ====== 扇形图 ======
    containerEl.createEl("h3", { text: "🥧 扇形图" });

    new Setting(containerEl)
      .setName("启用扇形图")
      .setDesc("在热力图区左侧显示扇形图。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.pieChartEnabled).onChange(async (v) => {
          this.plugin.settings.pieChartEnabled = v;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("扇形图分组维度")
      .setDesc("按哪个维度分配时间占比。按 tags 时，一个任务的多个 tag 会均分这个任务的时长。")
      .addDropdown((d) =>
        d.addOption("status", "按状态（Doing/Prepare/Done/Abandon）")
          .addOption("tag", "按 tags（多 tag 均分）")
          .addOption("file", "按任务")
          .setValue(this.plugin.settings.pieChartMode)
          .onChange(async (v) => {
            this.plugin.settings.pieChartMode = v as any;
            await this.plugin.saveSettings();
          })
      );

    // ====== 番茄钟 ======
    containerEl.createEl("h3", { text: "🍅 番茄钟" });

    new Setting(containerEl)
      .setName("单个 focus 时长（分钟）")
      .setDesc("专注 25 分钟 → 短休 5 分钟 → 每 4 个 focus 长休 15 分钟（经典配置）。")
      .addText((t) =>
        t
          .setPlaceholder("25")
          .setValue(String(this.plugin.settings.pomodoro.focusMinutes))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 1 && n <= 120) {
              this.plugin.settings.pomodoro.focusMinutes = n;
              this.plugin.pomodoroService?.setConfig({ focusMinutes: n });
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("短休时长（分钟）")
      .addText((t) =>
        t
          .setPlaceholder("5")
          .setValue(String(this.plugin.settings.pomodoro.shortBreakMinutes))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 1 && n <= 30) {
              this.plugin.settings.pomodoro.shortBreakMinutes = n;
              this.plugin.pomodoroService?.setConfig({ shortBreakMinutes: n });
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("长休时长（分钟）")
      .addText((t) =>
        t
          .setPlaceholder("15")
          .setValue(String(this.plugin.settings.pomodoro.longBreakMinutes))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 1 && n <= 60) {
              this.plugin.settings.pomodoro.longBreakMinutes = n;
              this.plugin.pomodoroService?.setConfig({ longBreakMinutes: n });
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("每 N 个 focus 后长休")
      .setDesc("每完成 N 个 focus 触发一次长休（默认 4）。")
      .addText((t) =>
        t
          .setPlaceholder("4")
          .setValue(String(this.plugin.settings.pomodoro.longBreakEvery))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 2 && n <= 10) {
              this.plugin.settings.pomodoro.longBreakEvery = n;
              this.plugin.pomodoroService?.setConfig({ longBreakEvery: n });
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("自动开始休息")
      .setDesc("focus 结束后自动进入短休/长休。")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.pomodoro.autoStartBreak)
          .onChange(async (v) => {
            this.plugin.settings.pomodoro.autoStartBreak = v;
            this.plugin.pomodoroService?.setConfig({ autoStartBreak: v });
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("自动开始下一个 focus")
      .setDesc("休息结束后自动开始下一个 focus（关闭后休息结束会回到 idle 状态）。")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.pomodoro.autoStartFocus)
          .onChange(async (v) => {
            this.plugin.settings.pomodoro.autoStartFocus = v;
            this.plugin.pomodoroService?.setConfig({ autoStartFocus: v });
            await this.plugin.saveSettings();
          })
      );

    // 番茄今日统计
    const pomoCount = this.plugin.pomodoroService ? this.plugin.pomodoroService.getTodayCount() : 0;
    const pomoTotal = this.plugin.pomodoroService ? this.plugin.pomodoroService.getTotalCount() : 0;
    new Setting(containerEl)
      .setName("番茄统计")
      .setDesc("今日完成 / 累计完成。")
      .addButton((b) =>
        b
          .setButtonText(`🍅 今日 ${pomoCount} · 累计 ${pomoTotal}`)
          .setDisabled(true)
      );

    // ====== 连续打卡 ======
    containerEl.createEl("h3", { text: "🔥 连续打卡" });

    new Setting(containerEl)
      .setName("打卡阈值（秒/天）")
      .setDesc("每天累计达到这个秒数就算「打过卡」。默认 60 秒 = 任何计时都算。")
      .addText((t) =>
        t
          .setPlaceholder("60")
          .setValue(String(this.plugin.settings.streakMinSeconds))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            if (!isNaN(n) && n >= 1 && n <= 3600) {
              this.plugin.settings.streakMinSeconds = n;
              await this.plugin.saveSettings();
            }
          })
      );

    // Home 模块
    const homeGroup = containerEl.createDiv({ cls: "notion-home-settings-group" });
    homeGroup.createEl("h4", { text: "🏠 Home 主页 sub-task 开关" });
    const homeItems: { key: keyof PluginSettings["modules"]["home"]; label: string; desc: string }[] = [
      { key: "greeting", label: "顶部欢迎区", desc: "显示当前日期 + 问候语" },
      { key: "taskSummary", label: "任务摘要卡片", desc: "待办 / 今天到期 / 已逾期 + Top 3" },
      { key: "quickCreate", label: "快速创建卡片", desc: "顶部输入框，回车直接建任务/笔记" },
      { key: "heatmap", label: "工作时间区", desc: "热力图 + 扇形图（包含两者）" },
      { key: "pieChart", label: "扇形图", desc: "热力图区左侧的扇形图（关闭后只显示热力图）" },
      { key: "recent", label: "最近编辑笔记", desc: "最近修改的 5 篇笔记" },
      { key: "streak", label: "连续打卡卡", desc: "显示连续工作天数 + 今日番茄数（任何计时都算打卡）" },
      { key: "habits", label: "习惯追踪卡", desc: "新建/勾选/计数习惯（Habit Tracker 风格）" },
    ];
    homeItems.forEach((it) => {
      new Setting(homeGroup)
        .setName(it.label)
        .setDesc(it.desc)
        .addToggle((t) =>
          t.setValue(this.plugin.settings.modules.home[it.key]).onChange(async (v) => {
            this.plugin.settings.modules.home[it.key] = v;
            await this.plugin.saveSettings();
          })
        );
    });

    // Tasks 模块
    const tasksGroup = containerEl.createDiv({ cls: "notion-home-settings-group" });
    tasksGroup.createEl("h4", { text: "✅ Tasks 任务面板" });
    const tasksItems: { key: keyof PluginSettings["modules"]["tasks"]; label: string; desc: string }[] = [
      { key: "search", label: "搜索栏", desc: "按文字搜索任务/文件名" },
      { key: "filters", label: "过滤栏", desc: "状态 + 优先级按钮组" },
      { key: "list", label: "列表视图", desc: "经典的勾选式任务列表" },
      { key: "board", label: "看板视图", desc: "按状态分列的卡片式看板（Notion Board）" },
      { key: "gantt", label: "时间线视图", desc: "按文件分组的时间轴 bar" },
      { key: "timer", label: "任务计时器", desc: "每行的 ▶ 计时按钮 + 顶部计时条" },
      { key: "addBar", label: "底部添加条", desc: "快速新增任务的输入条" },
      { key: "pomodoro", label: "番茄按钮", desc: "每个任务行的 🍅 按钮 + 全屏专注模式 overlay" },
    ];
    tasksItems.forEach((it) => {
      new Setting(tasksGroup)
        .setName(it.label)
        .setDesc(it.desc)
        .addToggle((t) =>
          t.setValue(this.plugin.settings.modules.tasks[it.key]).onChange(async (v) => {
            this.plugin.settings.modules.tasks[it.key] = v;
            await this.plugin.saveSettings();
          })
        );
    });

    // ====== 热力图 ======
    containerEl.createEl("h3", { text: "📊 工作时间热力图" });

    new Setting(containerEl)
      .setName("显示周数")
      .setDesc("Home 主页热力图展示的周数（被「统计周期」覆盖，仅在周期切换未启用时生效）。")
      .addDropdown((d) =>
        d
          .addOption("4", "4 周（1 个月）")
          .addOption("8", "8 周（2 个月）")
          .addOption("12", "12 周（3 个月）")
          .addOption("26", "26 周（半年）")
          .addOption("52", "52 周（一年）")
          .setValue(String(this.plugin.settings.heatmapWeeks))
          .onChange(async (v) => {
            this.plugin.settings.heatmapWeeks = parseInt(v, 10);
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("默认统计周期")
      .setDesc("Home 主页 Work 区的默认统计周期。点击头部「周/月/年」tab 可临时切换。")
      .addDropdown((d) =>
        d
          .addOption("week", "📅 本周")
          .addOption("month", "🗓️ 本月")
          .addOption("year", "📆 本年")
          .setValue(this.plugin.settings.statRangeDefault)
          .onChange(async (v) => {
            this.plugin.settings.statRangeDefault = v as "week" | "month" | "year";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("配色")
      .setDesc("热力图格子的颜色主题。")
      .addDropdown((d) =>
        d
          .addOption("auto", "自动（用主题色）")
          .addOption("blue", "蓝色")
          .addOption("green", "绿色")
          .addOption("purple", "紫色")
          .addOption("orange", "橙色")
          .setValue(this.plugin.settings.heatmapPalette)
          .onChange(async (v) => {
            this.plugin.settings.heatmapPalette = v as any;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("自动滚动到今天")
      .setDesc("打开 Home 时热力图自动滚动到今天的列。")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.heatmapScrollToToday).onChange(async (v) => {
          this.plugin.settings.heatmapScrollToToday = v;
          await this.plugin.saveSettings();
        })
      );

    // ====== 数据 ======
    containerEl.createEl("h3", { text: "💾 数据" });

    const stats = this.plugin.timeTracker.getLog();
    const totalSec = stats.reduce((acc, e) => acc + e.durationMs, 0);
    const days = new Set(stats.map((e) => e.date)).size;
    const hours = Math.floor(totalSec / 3600000);
    const minutes = Math.floor((totalSec % 3600000) / 60000);

    new Setting(containerEl)
      .setName("计时记录统计")
      .setDesc("当前累计的计时数据（不包含正在进行的计时）。")
      .addButton((b) =>
        b
          .setButtonText(`${stats.length} 次 · ${days} 天 · ${hours}h ${minutes}m`)
          .setDisabled(true)
      );

    new Setting(containerEl)
      .setName("清空所有计时数据")
      .setDesc("⚠️ 删除所有累计的工作时间记录（不可恢复）。任务的 ⏱️ 标记会保留。")
      .addButton((b) =>
        b
          .setButtonText("清空")
          .setWarning()
          .onClick(async () => {
            if (confirm("确认清空所有计时数据？此操作不可恢复。")) {
              this.plugin.timeTracker.setLog([]);
              await this.plugin.saveSettings();
              this.display();
              new Notice("计时数据已清空");
            }
          })
      );

    // ====== 关于 ======
    containerEl.createEl("h3", { text: "ℹ️ 关于" });
    const about = containerEl.createDiv({ cls: "setting-item" });
    about.createDiv({ cls: "setting-item-name", text: "Notion-style Home & Tasks" });
    const aboutDesc = about.createDiv({ cls: "setting-item-description" });
    aboutDesc.createEl("div", { text: "版本 0.8.0" });
    aboutDesc.createEl("div", {
      text: "数据存储位置：.obsidian/plugins/notion-home-plugin/data.json",
    });
  }
}
