# Notion-style Home & Tasks

A Notion-style homepage and lightweight task manager for Obsidian. Each task is a single `.md` file, with metadata in frontmatter and progress tracked automatically via the plugin's built-in timer.

> [中文文档 (Chinese)](README.zh.md) · v0.7.0

![Home screenshot](docs/screenshot.png)

---

## ✨ Features

### 🏠 Notion-style Home page

- **Banner + Avatar** with full Notion aesthetic (硬切, no gradient fade)
- **Large title + toolbar** (Share / Star / More) on the left
- **Two-column layout**:
  - Left: Tasks summary / Quick create / Recent
  - Right: Work (pie chart + heatmap)
- **Language toggle** (中文 / English) in the hero area — affects the entire plugin
- **Customizable background**: gradient / local image / vault image

### ✅ Task manager (3 views, one-click switch)

- **List view** — compact checkbox rows, inline tag/priority/date editors, hover-revealed timer
- **Board view** — 4 status columns, **drag-and-drop to change status**, inline sub-task list
- **Gantt view** — bar chart by file, **scroll-to-today by default**, sub-task drawer
- **4-status model**: `Doing` / `Prepare` / `Done` / `Abandon` (color-coded)
- **Timer** — start/stop from any view, live elapsed display, writes `Time Tracking` + `Last Timer Start` to frontmatter
- **Time adjustment** — `+15m / +30m / +1h / +2h` quick adjust, custom prompt, clear
- **Sub-task list** — expand/collapse any task to see & toggle its inline `- [ ]` checkboxes
- **Filter** — by status, priority, tag, or full-text search

### 📊 Work-time statistics

- **Heatmap** — by day, with **This Week / This Month / This Year** switcher
- **Pie chart** — by **status** / **tags** (multi-tag tasks split equally) / **task** (file)
- **localStorage backup** for the time log (survives Obsidian crash)

### 📁 Quick-capture templates

- `/exp <name>` → creates an experiment record with built-in template
- `/paper <title>` → creates a paper-reading note
- `/task <name>` → plain task
- Each template auto-uses its default folder (`Experiments/` / `Papers/`) — configurable in settings

### 🌍 Multilingual

- Full **中文 / English** UI across Home, Tasks, Settings
- Quick toggle button in both Home and Tasks views
- Change once, applies to the entire plugin immediately

---

## 📦 Installation

### Option 1: BRAT (recommended for beta testing)

1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) from Community Plugins
2. Open BRAT settings → "Add Beta plugin"
3. Enter: `suxin17/notion-home-plugin`
4. Click "Add Plugin" — done. Updates are auto-installed.

### Option 2: Manual install

1. Go to [Releases](https://github.com/suxin17/notion-home-plugin/releases) and download the latest `main.js`, `manifest.json`, `styles.css`
2. Create folder: `<your-vault>/.obsidian/plugins/notion-home-plugin/`
3. Copy the three files there
4. In Obsidian: Settings → Community plugins → enable **Notion-style Home & Tasks**

### Option 3: Community Plugins

_(coming soon — submit a PR to [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases))_

---

## 🚀 Quick start

1. After installing, open the **Home** view from the ribbon (🏠 icon) or run command "Open Home"
2. Customize the look in **Settings → Notion-style Home & Tasks → Options**:
   - Pick a background (gradient or image)
   - Set your avatar (emoji, local image, or vault image)
   - Set default task/exp/paper folders if you use templates
3. Start a task timer: open **Tasks** view → click ▶ on any task
4. Write experiment / paper notes via Quick Capture:
   - In Home: type `/exp my first experiment` → Enter
   - In Tasks: click ➕ New task, then type with prefix

---

## 📝 Task data format

Each task is a `.md` file with frontmatter:

```yaml
---
tafs: [work, design]                  # tag list (also reads Obsidian #tags)
Status: Doing                          # Doing | Prepare | Done | Abandon
Start Date: 2026-07-21                # start date
Completion Date: 2026-07-25           # due date
Priority: high                        # high | medium | low | none
Time Tracking: 1h 30m                 # total tracked time (written by plugin)
Last Timer Start: 2026-07-21 14:30    # currently-timing marker
---
```

### Status colors

| Status | Label (zh) | Color | Use when |
|---|---|---|---|
| `Doing` | 进行中 | 🟢 Green | Currently working on |
| `Prepare` | 待开始 | 🟡 Amber | Planned, not started yet |
| `Done` | 已完成 | 🔵 Blue | Finished |
| `Abandon` | 已放弃 | ⚪ Gray | Not doing anymore |

---

## 🛠 Development

```powershell
# install
npm install

# type-check
npx tsc --noEmit

# build (produces main.js + styles.css)
npm run build

# copy to vault for testing
$dest = "E:\OneDrive\Obsidian\.obsidian\plugins\notion-home-plugin"
Copy-Item main.js, styles.css, manifest.json -Destination $dest -Force
```

### Release flow (auto via GitHub Actions)

1. Bump version in `manifest.json` + add entry to `versions.json`
2. Build, commit, tag, push:
   ```bash
   git add .
   git commit -m "Release v0.x.y"
   git tag 0.x.y
   git push origin main --tags
   ```
3. GitHub Actions automatically:
   - Validates manifest & versions
   - Builds
   - Creates a GitHub Release with `main.js` / `manifest.json` / `styles.css` attached

---

## 🗺 Changelog

### v0.7.0 (current)

**Added**
- **Sub-task list** — expand/collapse inside any task in List / Board / Gantt; toggle checkboxes writes back to file
- **Drag-and-drop** in Board view to change task status
- **Multi-tag split** in pie chart — a task with N tags gets its time divided equally across all N tags
- **Stat range tab** for heatmap & pie — switch between This Week / This Month / This Year
- **Gantt time-range tab** (week / month / year), auto-scrolls to today on view open
- **Quick Capture templates** — `/exp` / `/paper` / `/task` prefixes in Home and Tasks quick input
- **Language toggle** in both Home and Tasks views (中文 / EN)
- **Adaptive width** for Home page (max 1400px, single column < 720px)
- **Pie chart mode switcher** (status / tags / task) inline in Home
- **Notion-style color palette** (16 soft, distinguishable colors)
- **Tags read from 3 sources**: plugin frontmatter `tafs`, Obsidian standard `tags`, inline `#tag`

**Fixed**
- Avatar no longer clipped by banner `overflow: hidden` (now uses a separate clip layer)
- Heatmap & pie stat range now fully driven by `StatRange`
- Gantt view time range now fully driven by `StatRange` (no auto-fit to task dates)

### v0.6.0
- Timer button on every task row (3 variants: button / chip / compact)
- Localstorage backup of time log
- Time adjust: `+15m / +30m / +1h / +2h` quick, custom, clear

### v0.5.0
- Notion Personal Home: banner + avatar + title + two-column
- 4-status frontmatter mode
- Customizable background: gradient / local image / vault image
- Multilingual greeting

### v0.4.0
- Work-time heatmap (ResizedObserver-based, 4 palettes)
- Pie chart (SVG donut, aggregates from time log)
- Inline status / priority / date / tag editors

### v0.3.0
- Frontmatter-mode task model
- Inline editors for tag / priority / dates

### v0.2.0
- Task timer (start / stop / accumulate)
- Work-time heatmap

### v0.1.0
- Notion-style Home page (basic)
- Tasks panel with List + Gantt views

---

## 📄 License

[MIT](LICENSE) © 2026 suxin17
