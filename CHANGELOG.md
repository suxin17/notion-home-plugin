# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.1] - 2026-07-22

### Added
- **Notion-style task table** — `TaskTable` component with real `<table>` layout, column-aligned properties (name / status / priority / start / due / tags / time / action), inline editing of dates, tags, priority, status cycling
- **`Pills` component** — `StatusPill` / `PriorityPill` / `TagChip` reusable across all 3 views, with stable per-tag colors
- **Bilingual sync across views** — language toggle in both Home and Tasks views; change in one reflects immediately in the other via a `languageListeners` pub/sub
- **Home page adaptive width** — `max-width: 1400px`, single column < 720px; two-column break point adjusted
- **Pie chart mode switcher** — inline `状态 / tags / 任务` tab in Home (no need to go to settings)

### Changed
- **Pie chart color palette** — replaced ugly brownish/amber tones with 18 soft Notion-style colors; **sequential color assignment with collision avoidance** so 2 tasks with hash-collision no longer share the same color
- **Status / Priority / Tags UI** in all 3 views now use Notion-style pills (dot + bg + bold text) instead of plain text
- **List view label** renamed to "Table" (internal `viewMode === "list"` unchanged for backward compat)

### Fixed
- Avatar no longer clipped by banner `overflow: hidden` (separate clip layer)
- Pie chart color: removed all brown/amber/brick-red tones; small "屎黄" issue gone
- Multi-tag task time is now split equally across all tags in pie chart

## [0.7.0] - 2026-07-22

### Added
- **Sub-task list** — expand/collapse inside any task in List / Board / Gantt; toggle checkboxes writes back to file
- **Drag-and-drop** in Board view to change task status
- **Multi-tag split** in pie chart — a task with N tags gets its time divided equally across all N tags
- **Stat range tab** for heatmap & pie — switch between 本周 / 本月 / 本年
- **Gantt time-range tab** (week / month / year), auto-scrolls to today on view open
- **Quick Capture templates** — `/exp` / `/paper` / `/task` prefixes in Home and Tasks quick input
- **Language toggle** in both Home and Tasks views (中文 / EN)
- **Adaptive width** for Home page (max 1400px, single column < 720px)
- **Pie chart mode switcher** (status / tags / task) inline in Home
- **Notion-style color palette** (16 soft, distinguishable colors)
- **Tags read from 3 sources**: plugin frontmatter `tafs`, Obsidian standard `tags`, inline `#tag`

### Changed
- Avatar is no longer clipped by banner `overflow: hidden` (now uses a separate clip layer)
- Heatmap range is fully driven by StatRange (week / month / year)
- Gantt view time range is fully driven by StatRange (no auto-fit to task dates)

## [0.6.0] - 2026-07-21

### Added
- Time-tracking button on every task row (3 variants: button / chip / compact)
- Localstorage backup of time log (survives Obsidian unload race)
- Adjustable time: `+15m / +30m / +1h / +2h` quick adjust, custom prompt, clear

## [0.5.0] - 2026-07-20

### Added
- Notion Personal Home style: banner + avatar + large title + two-column layout
- 4-status frontmatter mode (`Doing` / `Prepare` / `Done` / `Abandon`)
- Customizable background: gradient / local image / vault image
- Multilingual greeting (中文 / English)

## [0.4.0] - 2026-07-18

### Added
- Work-time heatmap (ResizedObserver-based, 4 palettes)
- Pie chart (SVG donut, aggregates from time log)
- Inline status / priority / date / tag editors
- StatusCircle (16px minimal Notion checkbox style)

## [0.3.0] - 2026-07-15

### Added
- Frontmatter-mode task model
- Inline editors for tag / priority / dates

## [0.2.0] - 2026-07-10

### Added
- Task timer (start / stop / accumulate)
- Work-time heatmap (GitHub-style)

## [0.1.0] - 2026-07-05

### Added
- Notion-style Home page (basic)
- Tasks panel with List + Gantt views
- Basic timer (no aggregation)
