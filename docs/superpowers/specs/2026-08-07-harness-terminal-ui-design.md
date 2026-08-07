# Harness Terminal WebUI Design

**Date:** 2026-08-07  
**Status:** Approved for implementation (option A + Terminal Raw)  
**Tools:** [Open Design](https://github.com/nexu-io/open-design), Cursor skill `emil-design-eng`

## Goal

Replace the bare inline-style WebUI with a high-contrast terminal console aesthetic, and document the Open Design design system + skills in `SPEC.md` / `webui/DESIGN.md`.

## Design system

- **Name:** Harness Terminal
- **Contract file:** `webui/DESIGN.md`
- **Skills:**
  1. Open Design prototype / live-artifact workflow (structure + visual system)
  2. `emil-design-eng` (press feedback, modal enter, connection pulse — under 300ms, ease-out)

## Scope

- Restyle `ChatPanel`, `AgentLog`, `HITLModal`; add global CSS tokens
- Keep existing WebSocket protocol
- Disconnected hint for `?token=`
- No multi-page marketing site; no heavy UI kit

## Out of scope

- Light theme toggle
- Full settings / credentials UI rewrite
