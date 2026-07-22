// SubTaskService：解析 / 切换文件里的 checkbox sub-task
//
// 行为：
//   - getSubTasks(file)：解析文件中所有 "- [ ] xxx" / "- [x] xxx" 形式的 checkbox
//   - toggleSubTask(file, lineNumber, newChecked)：原子写入
//   - addSubTask(file, text, parentLineNumber?)：在文件末尾或某行后追加新 checkbox
//   - removeSubTask(file, lineNumber)：移除整行 checkbox
//
// 匹配规则：
//   - 行首可以有缩进（每个 tab 或 2 空格算 1 级）
//   - `- [ ]` `* [ ]` 都支持
//   - `[ ]` 内可以是空格、`x`、`X`

import { App, TFile } from "obsidian";

export interface SubTask {
  /** 用 lineNumber 当稳定 id（在文件里唯一） */
  lineNumber: number;
  /** checkbox 文本（去掉 - [ ] 前缀） */
  text: string;
  /** 是否勾选 */
  checked: boolean;
  /** 缩进级别（0 = 顶级） */
  indent: number;
}

/** 匹配一行 checkbox：^(indent)[-*]\s\[(x| )\]\s(.+)$ */
const SUBTASK_RE = /^(\s*)([-*])\s\[( |x|X)\]\s+(.+?)\s*$/;

export class SubTaskService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /** 读取文件并解析 sub-task 列表 */
  async getSubTasks(file: TFile): Promise<SubTask[]> {
    const content = await this.app.vault.cachedRead(file);
    return parseSubTasks(content);
  }

  /** 切换某个 sub-task 的勾选状态 */
  async toggleSubTask(file: TFile, lineNumber: number): Promise<boolean> {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    if (lineNumber < 0 || lineNumber >= lines.length) return false;
    const line = lines[lineNumber];
    const m = line.match(SUBTASK_RE);
    if (!m) return false;
    const wasChecked = m[3] !== " ";
    const newLine = line.replace(/\[[ xX]\]/, wasChecked ? "[ ]" : "[x]");
    lines[lineNumber] = newLine;
    await this.app.vault.modify(file, lines.join("\n"));
    return !wasChecked;
  }

  /** 在文件末尾追加一个顶级 checkbox */
  async addSubTask(file: TFile, text: string, indent = 0): Promise<SubTask | null> {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    // 去掉末尾的连续空行
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }
    const prefix = " ".repeat(indent * 2);
    const newLine = `${prefix}- [ ] ${text}`;
    lines.push(newLine);
    // 文件末尾加一个空行（美观）
    if (lines.length > 0 && lines[lines.length - 1].trim() !== "") {
      lines.push("");
    }
    await this.app.vault.modify(file, lines.join("\n"));
    return {
      lineNumber: lines.length - (lines[lines.length - 1] === "" ? 2 : 1),
      text,
      checked: false,
      indent,
    };
  }

  /** 删除一行 sub-task（连同行尾 \n 一起删） */
  async removeSubTask(file: TFile, lineNumber: number): Promise<boolean> {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    if (lineNumber < 0 || lineNumber >= lines.length) return false;
    if (!SUBTASK_RE.test(lines[lineNumber])) return false;
    lines.splice(lineNumber, 1);
    await this.app.vault.modify(file, lines.join("\n"));
    return true;
  }
}

/** 纯函数：把文件内容解析成 SubTask 列表（行号从 0 开始） */
export function parseSubTasks(content: string): SubTask[] {
  const lines = content.split("\n");
  const out: SubTask[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(SUBTASK_RE);
    if (!m) continue;
    const indentRaw = m[1];
    // 1 个 tab 或 2 个空格算 1 级
    const indent = Math.floor(indentRaw.replace(/\t/g, "  ").length / 2);
    out.push({
      lineNumber: i,
      text: m[4],
      checked: m[3] !== " ",
      indent,
    });
  }
  return out;
}
