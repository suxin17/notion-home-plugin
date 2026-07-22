// TagEditor - 任务 tag 内联编辑器
// 已有 tag 显示为 chip，hover 显示 x；点 + 输入新 tag

import React, { useState } from "react";

interface TagEditorProps {
  tags: string[];
  onAdd: (tag: string) => void | Promise<void>;
  onRemove: (tag: string) => void | Promise<void>;
}

export function TagEditor({ tags, onAdd, onRemove }: TagEditorProps) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");

  const handleAdd = async () => {
    const v = input.trim();
    if (!v) {
      setEditing(false);
      return;
    }
    await onAdd(v);
    setInput("");
    setEditing(false);
  };

  return (
    <div className="notion-tasks-tag-editor">
      {tags.map((tag) => (
        <span key={tag} className="notion-tasks-tag-chip">
          #{tag}
          <button
            className="notion-tasks-tag-chip-remove"
            onClick={() => onRemove(tag)}
            title={`移除 #${tag}`}
          >×</button>
        </span>
      ))}
      {editing ? (
        <input
          className="notion-tasks-tag-input"
          autoFocus
          placeholder="新 tag…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
            else if (e.key === "Escape") {
              setInput("");
              setEditing(false);
            }
          }}
          onBlur={handleAdd}
        />
      ) : (
        <button className="notion-tasks-tag-add" onClick={() => setEditing(true)} title="添加 tag">
          + tag
        </button>
      )}
    </div>
  );
}
