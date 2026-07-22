// 插件入口

import { Plugin, WorkspaceLeaf } from "obsidian";
import { TaskService } from "./src/services/taskService";
import { NoteService } from "./src/services/noteService";
import { TimeTracker } from "./src/services/timeTracker";
import { SubTaskService } from "./src/services/subTaskService";
import { HomeView, VIEW_TYPE_HOME } from "./src/views/HomeView";
import { TaskView, VIEW_TYPE_TASK } from "./src/views/TaskView";
import { NotionHomeSettingTab } from "./src/modals/SettingsTab";
import { parseQuickCapture, mergeTemplateOpts, pickFolderForTemplate } from "./src/templates/taskTemplates";

/** 简单的 YYYY-MM-DD（不依赖 utils 避免循环引用） */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
}

const TIMELOG_BACKUP_KEY = "notion-home-timelog-backup";

export interface PluginSettings {
  openHomeOnStart: boolean;
  defaultTaskFilter: "all" | "Doing" | "Prepare" | "Done" | "Abandon";
  defaultTaskView: "list" | "board" | "gantt";
  timeFormat: "auto" | "hm" | "h";
  heatmapWeeks: number;
  heatmapPalette: "auto" | "blue" | "green" | "purple" | "orange";
  heatmapScrollToToday: boolean;
  /** 统计周期（影响扇形图 + 热力图）：本周/本月/本年 */
  statRangeDefault: "week" | "month" | "year";
  /** 时间线（甘特图）默认显示周期 */
  ganttRangeDefault: "week" | "month" | "year";
  /** 主页问候语言 */
  greetingLanguage: "zh" | "en";
  /** 主页背景：none / 渐变 / image */
  homeBackground: "none" | "gradient-blue" | "gradient-purple" | "gradient-warm" | "gradient-green" | "gradient-dark" | "image";
  /** 背景图片来源：dataURL（本地选择）或 vault 路径（vault 内图片） */
  homeBackgroundSource: "dataUrl" | "vault";
  homeBackgroundImage: string;     // dataURL（source=dataUrl 时）或 vault 路径
  homeBackgroundHeight: number;    // px
  homeBackgroundOpacity: number;   // 0-1
  /** Banner 标题颜色 */
  homeTitleColor: "light" | "dark";
  /** Banner 标题（在 banner 上的小字） */
  homeBannerTitle: string;
  /** Avatar 设置 */
  homeAvatarSource: "none" | "emoji" | "dataUrl" | "vault";
  homeAvatarDataUrl: string;
  homeAvatarVaultPath: string;
  homeAvatarEmoji: string;
  /** 主页大标题 */
  homePageTitle: string;
  /** 扇形图模式 */
  pieChartMode: "status" | "tag" | "file";
  pieChartEnabled: boolean;
  /** 任务默认存放文件夹（按模板） */
  taskFolder: string;          // 普通任务默认 folder（空 = 根目录）
  experimentFolder: string;    // 实验记录默认 folder
  paperFolder: string;         // 论文笔记默认 folder
  /** 模块开关：每个视图的 sub-task 都能开/关 */
  modules: {
    home: {
      greeting: boolean;
      taskSummary: boolean;
      quickCreate: boolean;
      heatmap: boolean;       // 热力图区（含 pie + heatmap）
      pieChart: boolean;      // 扇形图（关闭后只显示热力图）
      recent: boolean;
    };
    tasks: {
      search: boolean;
      filters: boolean;
      list: boolean;
      board: boolean;
      gantt: boolean;
      timer: boolean;
      addBar: boolean;
    };
  };
}

const DEFAULT_SETTINGS: PluginSettings = {
  openHomeOnStart: true,
  defaultTaskFilter: "Doing",
  defaultTaskView: "board",
  timeFormat: "auto",
  heatmapWeeks: 12,
  heatmapPalette: "auto",
  heatmapScrollToToday: true,
  statRangeDefault: "month",
  ganttRangeDefault: "month",
  greetingLanguage: "zh",
  homeBackground: "none",
  homeBackgroundSource: "dataUrl",
  homeBackgroundImage: "",
  homeBackgroundHeight: 280,
  homeBackgroundOpacity: 1,
  homeTitleColor: "light",
  homeBannerTitle: "",
  homeAvatarSource: "emoji",
  homeAvatarDataUrl: "",
  homeAvatarVaultPath: "",
  homeAvatarEmoji: "👋",
  homePageTitle: "Personal Home",
  pieChartMode: "status",
  pieChartEnabled: true,
  taskFolder: "",
  experimentFolder: "Experiments",
  paperFolder: "Papers",
  modules: {
    home: {
      greeting: true,
      taskSummary: true,
      quickCreate: true,
      heatmap: true,
      pieChart: true,
      recent: true,
    },
    tasks: {
      search: true,
      filters: true,
      list: true,
      board: true,
      gantt: true,
      timer: true,
      addBar: true,
    },
  },
};

export default class NotionHomePlugin extends Plugin {
  settings!: PluginSettings;
  taskService!: TaskService;
  noteService!: NoteService;
  timeTracker!: TimeTracker;
  subTaskService!: SubTaskService;

  /** 语言变更订阅器（用于 Home / Task 视图实时同步） */
  private languageListeners = new Set<() => void>();

  /** 订阅语言变化，返回取消订阅的函数 */
  onLanguageChange(fn: () => void): () => void {
    this.languageListeners.add(fn);
    return () => this.languageListeners.delete(fn);
  }

  /** 触发语言变化通知（语言切换按钮调用） */
  emitLanguageChange(): void {
    for (const fn of this.languageListeners) fn();
  }

  async onload(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings);

    this.taskService = new TaskService(this.app);
    this.noteService = new NoteService(this.app);
    this.timeTracker = new TimeTracker();
    this.subTaskService = new SubTaskService(this.app);

    // 加载 timeLog，优先用 data.json，没有就用 localStorage 兜底（onunload 异步被打断时保命）
    let log = (data?.timeLog as any) || [];
    if (!log || log.length === 0) {
      try {
        const backup = localStorage.getItem(TIMELOG_BACKUP_KEY);
        if (backup) log = JSON.parse(backup);
      } catch (e) {
        // 忽略
      }
    }
    this.timeTracker.setLog(log);

    // 订阅 timeTracker：每次变化都同步写 localStorage 兜底
    this.timeTracker.subscribe(() => this.persistTimeLog());

    // 注册视图
    this.registerView(VIEW_TYPE_HOME, (leaf) => new HomeView(leaf, this));
    this.registerView(VIEW_TYPE_TASK, (leaf) => new TaskView(leaf, this));

    // 设置面板
    this.addSettingTab(new NotionHomeSettingTab(this.app, this));

    // Ribbon 图标
    this.addRibbonIcon("home", "Open Home", () => this.activateHomeView());
    this.addRibbonIcon("check-square", "Open Tasks", () => this.activateTaskView());

    // 命令
    this.addCommand({
      id: "open-home",
      name: "Open Home",
      callback: () => this.activateHomeView(),
    });
    this.addCommand({
      id: "open-tasks",
      name: "Open Tasks",
      callback: () => this.activateTaskView(),
    });
    this.addCommand({
      id: "add-task",
      name: "Create new task",
      callback: async () => {
        const text = window.prompt("新任务标题（支持 /exp /paper /task 前缀）");
        if (!text) return;
        const parsed = parseQuickCapture(text);
        if (parsed && parsed.title && parsed.rawPrefix !== "/note") {
          const tplOpts = mergeTemplateOpts(parsed.template, { start: todayStr() });
          const folder = pickFolderForTemplate(this.settings, parsed.template);
          await this.taskService.createTask(parsed.title, { ...tplOpts, folder });
        } else if (parsed && parsed.rawPrefix === "/note" && parsed.title) {
          await this.noteService.createNote(parsed.title);
        } else if (!parsed) {
          await this.taskService.createTask(text, { status: "Prepare" });
        }
      },
    });

    this.addCommand({
      id: "add-experiment",
      name: "🧪 新建实验记录",
      callback: async () => {
        const text = window.prompt("实验名称（会作为文件名）");
        if (!text) return;
        const tplOpts = mergeTemplateOpts("experiment", { start: todayStr() });
        const folder = pickFolderForTemplate(this.settings, "experiment");
        await this.taskService.createTask(text, { ...tplOpts, folder });
      },
    });

    this.addCommand({
      id: "add-paper",
      name: "📄 新建论文笔记",
      callback: async () => {
        const text = window.prompt("论文标题（作者-年份 这种格式也好认）");
        if (!text) return;
        const tplOpts = mergeTemplateOpts("paper", { start: todayStr() });
        const folder = pickFolderForTemplate(this.settings, "paper");
        await this.taskService.createTask(text, { ...tplOpts, folder });
      },
    });
    this.addCommand({
      id: "open-daily",
      name: "Open / Create today's daily note",
      callback: () => this.noteService.openOrCreateDaily(),
    });
    this.addCommand({
      id: "stop-current-timer",
      name: "Stop current task timer",
      callback: () => this.stopAndPersist(),
    });
    this.addCommand({
      id: "toggle-timer",
      name: "Toggle timer on selected task",
      editorCallback: (editor) => {
        // 当前光标所在行如果是任务行，启动/停止计时
        const line = editor.getCursor().line;
        const allTasks = this.timeTracker; // 简化：直接走 timeTracker
        void allTasks; // 实际逻辑需要在 taskService 里查行
        void line;
        // 暂留接口，下一版接
      },
    });

    // 启动时打开 Home
    if (this.settings.openHomeOnStart) {
      this.app.workspace.onLayoutReady(() => this.activateHomeView());
    }
  }

  async onunload(): Promise<void> {
    // 同步写 localStorage 兜底（saveData 是 async，Obsidian 关闭时可能不等）
    this.persistTimeLog();
    // 停掉正在跑的计时（fire-and-forget）
    void this.stopAndPersist();
  }

  /** 停掉正在跑的计时，把日志写回磁盘 */
  async stopAndPersist(): Promise<void> {
    const entry = this.timeTracker.stopIfRunning();
    if (entry) {
      const tasks = await this.taskService.getAllTasks();
      const target = tasks.find((t) => t.file === entry.file);
      if (target) {
        await this.taskService.accumulateTime(target, Math.round(entry.durationMs / 1000));
      }
    }
    this.persistTimeLog();
  }

  /** 同步持久化 timeLog：data.json + localStorage 兜底 */
  persistTimeLog(): void {
    const log = this.timeTracker.getLog();
    // localStorage 同步写（保命用）
    try {
      localStorage.setItem(TIMELOG_BACKUP_KEY, JSON.stringify(log));
    } catch (e) {
      // 忽略（localStorage 满了或被禁用）
    }
    // data.json 异步写
    void this.saveData({ settings: this.settings, timeLog: log });
  }

  async loadSettings(): Promise<void> {
    // 兼容老版本（之前是 settings 整个塞在 data 里）
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings || data);
  }

  async saveSettings(): Promise<void> {
    this.persistTimeLog();
  }

  /** 激活 / 创建 Home 视图 */
  async activateHomeView(): Promise<void> {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_HOME);
    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = workspace.getLeaf("tab");
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_HOME, active: true });
    workspace.revealLeaf(leaf);
  }

  /** 激活 / 创建 Task 视图（右侧栏） */
  async activateTaskView(): Promise<void> {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_TASK);
    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE_TASK, active: true });
    workspace.revealLeaf(leaf);
  }
}
