# DESIGN.md — Harness Mission Control

Brand contract for the Coding Agent Harness WebUI (v2, 2026-08).

## Identity

| Field | Value |
|-------|--------|
| System name | **Harness Mission Control** |
| Product | Coding Agent Harness |
| Mood | Dark-tech HUD / space-station operator console |
| Density | Tool-first, medium-high information density |

## Color tokens

| Token | Value | Usage |
|-------|--------|--------|
| `--bg` | `#070b12` | Page background (deep space blue-black) |
| `--bg-panel` | `rgba(13, 20, 32, 0.72)` | Panels (with backdrop blur) |
| `--bg-elevated` | `#0d1420` | Buttons, inputs |
| `--bg-inset` | `#05080e` | Code blocks, tool results, stat bars |
| `--border` | `rgba(120, 160, 200, 0.14)` | Hairline rules |
| `--border-strong` | `rgba(120, 160, 200, 0.3)` | Corner ticks, hover states |
| `--text` | `#dbe4ee` | Primary text |
| `--text-dim` | `#7d8fa3` | Secondary / labels |
| `--accent` | `#3dd68c` | Signal green: connected, success, primary |
| `--info` | `#22d3ee` | Cyan: numbers, round numbers, done states |
| `--warn` | `#e6a23c` | high severity, awaiting, tool names |
| `--danger` | `#f07178` | critical, reject, fail |

Glow (`box-shadow` with accent color) is reserved for status LEDs and the
active loop stage only — never for decoration.

## Typography

- **UI + log:** `IBM Plex Mono`, `JetBrains Mono`, `ui-monospace`, monospace
- Body: 13px; panel labels: 10px uppercase with 0.12em tracking; dashboard
  numbers: 14px semibold
- No serif; no Inter / Roboto / system-ui as primary

## Layout

Three-zone app shell, full viewport height, page never scrolls (each zone
scrolls internally):

1. **Top bar** — brand, round/tool metrics, connection + agent status LEDs, panel toggles
2. **Left** — session history sidebar (240px, collapsible)
3. **Center** — chat timeline + bottom composer
4. **Right** — control deck (320px): loop indicator, round timeline, feedback trail, tool stats

Below 1100px the deck becomes a fixed overlay (toggled from the top bar).
Radius ≤ 6px; 1px translucent borders; grid backdrop (`36px` cells); panels
carry corner ticks via `.panel` pseudo-elements. No soft shadows, no card stacks.

## Components

- **Panel:** `.panel` + corner ticks; `.panel-label` for section titles
- **LED:** square, glowing when `.on` (green pulse) / `.warn` (amber pulse) / `.off` (red)
- **Round card:** `ROUND NN` header, collapsible tool blocks with per-tool lucide icons
- **Loop indicator:** 上下文 → LLM → 工具 → 反馈 nodes; active glows green,
  awaiting HITL pulses amber, done turns cyan, feedback node carries fail/pass color
- **Feedback trail:** `R1 FAIL → R2 PASS` node chain
- **HITL modal:** severity band on top (amber / pulsing red), editable JSON
  args, `A` approve / `R` reject shortcuts

## Motion

| Interaction | Motion |
|-------------|--------|
| Button press | `transform: scale(0.97)` ~120ms `--ease-out` |
| Card / modal appear | opacity + translateY(8px), ~200ms `--ease-out` |
| Connected LED | opacity pulse ~1.6s linear (ambient only) |
| Loop stage change | border/color/box-shadow 300ms transition |
| Tool stat bars | width 300ms transition |

`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`

## Toolchain

| Layer | Choice |
|-------|--------|
| Icons | lucide-react (only UI dependency) |
| Animation | Pure CSS (no animation library) |
| Data | WebSocket (unchanged protocol) + `/api/sessions` REST |
| Implementation | React 18 + Vite in `webui/` |
