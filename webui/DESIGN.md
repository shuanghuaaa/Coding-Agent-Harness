# DESIGN.md — Harness Terminal

Brand contract for the Coding Agent Harness WebUI.  
Produced under the [Open Design](https://github.com/nexu-io/open-design) workflow and polished with the Cursor skill `emil-design-eng`.

## Identity

| Field | Value |
|-------|--------|
| System name | **Harness Terminal** |
| Product | Coding Agent Harness |
| Mood | High-contrast terminal / operator console |
| Density | Tool-first, low ornament |

## Color tokens

| Token | Value | Usage |
|-------|--------|--------|
| `--bg` | `#0a0a0a` | Page background |
| `--bg-panel` | `#111111` | Panels, modal |
| `--bg-elevated` | `#1a1a1a` | Inputs, code blocks |
| `--border` | `#2a2a2a` | Hairline rules |
| `--text` | `#e8e8e8` | Primary text |
| `--text-dim` | `#8a8a8a` | Secondary / labels |
| `--accent` | `#3dd68c` | Connected, success, primary actions |
| `--warn` | `#e6a23c` | high severity, awaiting |
| `--danger` | `#f07178` | critical, reject, fail |
| `--cursor` | `#3dd68c` | Prompt caret accent |

## Typography

- **UI + log:** `IBM Plex Mono`, `JetBrains Mono`, `ui-monospace`, monospace
- Body: 13–14px; titles: 14–16px uppercase tracking optional for status labels
- No serif; no Inter / Roboto / system-ui as primary

## Layout

1. **Top bar** — product name + connection/agent status
2. **Main** — scrollable agent stream / empty prompt hint
3. **Bottom** — `>` task input + Send / Cancel

Single column. Max content width ~960px centered on wide screens. Radius ≤ 4px. No card stacks, no soft shadows.

## Components

- **Status pill:** square LED + label (`CONNECTED` / `DISCONNECTED`); connected LED may pulse gently
- **Agent log:** role tags, fail/pass in danger/accent backgrounds at low opacity
- **HITL modal:** dim overlay + bordered terminal dialog; Approve (accent or danger by severity) / Reject (outline)

## Motion (emil-design-eng)

| Interaction | Motion |
|-------------|--------|
| Button press | `transform: scale(0.97)` ~120ms, `--ease-out` |
| HITL appear | opacity + slight translateY, ~200ms ease-out |
| Connected LED | opacity pulse ~1.6s linear (ambient only) |
| Keyboard send | no entrance animation on the form itself |

`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`

## Skills & toolchain

| Layer | Choice |
|-------|--------|
| Design toolchain | [Open Design](https://github.com/nexu-io/open-design) |
| Design system | This file (`Harness Terminal`) |
| Prototype skill | Open Design prototype / live-artifact |
| Polish skill | Cursor `emil-design-eng` |
| Implementation | React 18 + Vite in `webui/` |
