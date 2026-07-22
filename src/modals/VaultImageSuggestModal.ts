// VaultImageSuggestModal - 模糊搜索 vault 内的图片
// 用 Obsidian 的 FuzzySuggestModal 实现

import { App, FuzzySuggestModal, TFile } from "obsidian";

export class VaultImageSuggestModal extends FuzzySuggestModal<TFile> {
  private onChoose: (file: TFile) => void;

  constructor(app: App, onChoose: (file: TFile) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("搜索 vault 内的图片（jpg / png / gif / webp / svg）...");
  }

  getItems(): TFile[] {
    const exts = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "webp"];
    return this.app.vault.getFiles().filter((f) => exts.includes(f.extension.toLowerCase()));
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}
