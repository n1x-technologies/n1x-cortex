<!-- toolkit/skills/cortex-pause/SKILL.md -->
---
name: cortex-pause
description: Pause or resume Cortex autonomy (the lifecycle hooks). Use when the user wants Cortex to stop reacting to sessions/edits, or to re-enable it.
---

# Cortex pause / resume — autonomy kill switch

Cortex's lifecycle hooks (SessionStart status, Stop "run /atomize" suggestion, and any
Wave-2 hooks) are gated by a single flag in `.cortex/state.json`.

- To **pause** (hooks become silent no-ops): run `cortex pause` from the vault root.
- To **resume**: run `cortex resume`.

`cortex pause` is equivalent to setting `"autonomy": "off"` in `.cortex.json`, but is
session-local and reversible without editing config. No note is ever written by a hook
regardless of this flag — pausing only silences the read/notify behavior.
