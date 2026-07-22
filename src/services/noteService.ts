// NoteService：笔记操作（不涉及任务元数据）

import { App, TFile } from "obsidian";

export class NoteService {
  private app: App;
  constructor(app: App) {
    this.app = app;
  }

  /** 获取最近编辑的 N 个 Markdown 笔记（按 mtime 倒序） */
  getRecentFiles(limit = 5): TFile[] {
    return this.app.vault
      .getMarkdownFiles()
      .sort((a, b) => b.stat.mtime - a.stat.mtime)
      .slice(0, limit);
  }

  /** 创建新笔记（不带 frontmatter，不当作 task） */
  async createNote(name: string, content = ""): Promise<TFile | null> {
    const safeName = name.endsWith(".md") ? name : `${name}.md`;
    const path = await this.app.vault.adapter.exists(safeName)
      ? this.findUniquePath(safeName)
      : safeName;
    return await this.app.vault.create(path, content);
  }

  /** Daily Note：默认按 YYYY-MM-DD 命名 */
  async openOrCreateDaily(): Promise<TFile> {
    const date = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    const name = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.md`;

    let file = this.app.vault.getAbstractFileByPath(name) as TFile | null;
    if (!file) {
      file = await this.app.vault.create(name, "");
    }
    await this.app.workspace.getLeaf().openFile(file);
    return file;
  }

  private findUniquePath(basePath: string): string {
    const dot = basePath.lastIndexOf(".");
    const stem = basePath.slice(0, dot);
    const ext = basePath.slice(dot);
    let i = 1;
    let candidate = `${stem} ${i}${ext}`;
    while (this.app.vault.adapter.exists(candidate)) {
      i++;
      candidate = `${stem} ${i}${ext}`;
    }
    return candidate;
  }
}
