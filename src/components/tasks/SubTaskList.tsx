// SubTaskList - 复用的 sub-task 列表
//
// 行为：
//   - 读文件，解析所有 checkbox
//   - 渲染可勾选的复选框
//   - 勾选 / 取消勾选 → 原子写回文件
//   - 输入框 → 追加新 sub-task 到文件末尾
//   - 监听 vault.on("modify") 自动刷新（用户在编辑器里改了也能同步）
//   - 显示进度：X / Y 已完成
//
// 用法：
//   <SubTaskList file={t.file as TFile} app={app} />

import React, { useEffect, useState } from "react";
import { TFile } from "obsidian";
import type { SubTaskService } from "../../services/subTaskService";
import type { SubTask } from "../../services/subTaskService";

interface SubTaskListProps {
  file: TFile;
  service: SubTaskService;
  /** 紧凑模式（用于 popover / 卡片内） */
  compact?: boolean;
  language?: "zh" | "en";
  /** 顶部是否显示进度 */
  showProgress?: boolean;
}

export function SubTaskList({
  file,
  service,
  compact = false,
  language = "zh",
  showProgress = true,
}: SubTaskListProps) {
  const [subs, setSubs] = useState<SubTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");

  const reload = async () => {
    try {
      const list = await service.getSubTasks(file);
      setSubs(list);
    } catch (e) {
      setSubs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    reload();
    // 监听文件被改动（外部编辑 / 其它窗口改）
    const ref = file.vault.on("modify", (f) => {
      if (f.path === file.path) reload();
    });
    return () => {
      file.vault.offref(ref);
    };
  }, [file.path]);

  const handleToggle = async (sub: SubTask, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await service.toggleSubTask(file, sub.lineNumber);
    // 不需要手动 reload，modify 事件会触发 reload
  };

  const handleRemove = async (sub: SubTask, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    await service.removeSubTask(file, sub.lineNumber);
  };

  const handleAdd = async (e: React.FormEvent | React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const text = newText.trim();
    if (!text) {
      setAdding(false);
      return;
    }
    await service.addSubTask(file, text);
    setNewText("");
    setAdding(false);
  };

  const done = subs.filter((s) => s.checked).length;
  const total = subs.length;

  if (loading) {
    return (
      <div className={`notion-subtasks notion-subtasks-loading ${compact ? "is-compact" : ""}`}>
        <span className="muted">{language === "en" ? "Loading…" : "加载中…"}</span>
      </div>
    );
  }

  if (total === 0 && !adding) {
    return (
      <div className={`notion-subtasks notion-subtasks-empty ${compact ? "is-compact" : ""}`}>
        <span className="muted">
          {language === "en"
            ? "No sub-tasks. Click + to add."
            : "还没有子任务，点 + 添加"}
        </span>
        <button
          className="notion-subtasks-add-btn"
          onClick={(e) => {
            e.stopPropagation();
            setAdding(true);
          }}
          title={language === "en" ? "Add sub-task" : "添加子任务"}
        >
          +
        </button>
        {adding && (
          <form
            className="notion-subtasks-add-form"
            onSubmit={handleAdd}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              type="text"
              className="notion-subtasks-add-input"
              placeholder={language === "en" ? "New sub-task…" : "新子任务…"}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setAdding(false);
                  setNewText("");
                }
              }}
            />
            <button type="submit" className="mod-cta">✓</button>
          </form>
        )}
      </div>
    );
  }

  return (
    <div
      className={`notion-subtasks ${compact ? "is-compact" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      {showProgress && total > 0 && (
        <div className="notion-subtasks-progress">
          <div className="notion-subtasks-progress-bar">
            <div
              className="notion-subtasks-progress-fill"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
          <span className="notion-subtasks-progress-text">
            {done} / {total} {language === "en" ? "done" : "已完成"}
          </span>
        </div>
      )}
      <ul className="notion-subtasks-list">
        {subs.map((s) => (
          <li
            key={s.lineNumber}
            className={`notion-subtasks-item ${s.checked ? "is-done" : ""}`}
            style={{ paddingLeft: s.indent * 14 }}
          >
            <span
              className="notion-subtasks-check"
              role="checkbox"
              aria-checked={s.checked}
              onClick={(e) => handleToggle(s, e)}
            >
              {s.checked ? "✓" : ""}
            </span>
            <span
              className="notion-subtasks-text"
              onClick={(e) => handleToggle(s, e)}
              title={s.text}
            >
              {s.text}
            </span>
            <button
              className="notion-subtasks-remove"
              onClick={(e) => handleRemove(s, e)}
              title={language === "en" ? "Delete" : "删除"}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          className="notion-subtasks-add-form"
          onSubmit={handleAdd}
        >
          <input
            autoFocus
            type="text"
            className="notion-subtasks-add-input"
            placeholder={language === "en" ? "New sub-task…" : "新子任务…"}
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setAdding(false);
                setNewText("");
              }
            }}
          />
          <button type="submit" className="mod-cta">✓</button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAdding(false);
              setNewText("");
            }}
          >
            ×
          </button>
        </form>
      ) : (
        <button
          className="notion-subtasks-add-btn"
          onClick={(e) => {
            e.stopPropagation();
            setAdding(true);
          }}
          title={language === "en" ? "Add sub-task" : "添加子任务"}
        >
          + {language === "en" ? "Add sub-task" : "添加子任务"}
        </button>
      )}
    </div>
  );
}
