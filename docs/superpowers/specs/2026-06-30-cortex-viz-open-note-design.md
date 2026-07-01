# Cortex `viz` — Open note (design)

**Date:** 2026-06-30
**Status:** Approved for planning
**Scope:** `toolkit/src/viz/server.ts`, a new `toolkit/src/viz/notePage.ts`, `toolkit/package.json` (`marked`), and `toolkit/src/viz/static/{app.js,index.html}`.

## Goal

Like Obsidian: clicking a node fills the info panel (already does), and an **"Open note"** button in that right-side panel opens the note's rendered content in a **new browser tab** at `/note/<id>`, served by the viz server.

## Design

### Frontend (`app.js` + `index.html`)

- Add an **"Open note"** button inside `#s-info` (near the title). It is shown only for **real notes** (`data.exists && !data.isFolder`) and hidden for gap/folder/no selection.
- `showPanel(n)`: if `n.exists && !n.isFolder`, show the button and set its handler to `window.open('note/' + encodeURIComponent(n.id), '_blank', 'noopener')`; otherwise hide it. `hidePanel()` hides it.
- The button is styled with the coral accent (reuse existing button styling).

### Backend (`server.ts` + `notePage.ts`)

- New route: `GET /note/<id>` (before the static-file fallback). `<id>` is URL-decoded.
- Resolution: `loadConfig(vaultDir, …)` → `scanVault(vaultDir, config)` → find the note whose `id` matches. If none, respond `404` with a small branded "note not found" page.
- Read the file at `join(vaultDir, note.path)`, **path-confined** (must resolve inside `vaultDir`, mirroring the existing static-file guard) — reject traversal with `403`.
- Split frontmatter/body via the existing `parseFrontmatter`.
- Render the body markdown → HTML with **`marked`** (new runtime dependency; small, MIT, no transitive deps). Before rendering, rewrite `[[target]]` / `[[target|alias]]` wikilinks into links to `/note/<target>` (alias as text) so links inside the note are clickable and open that note.
- `notePage.ts` exports `renderNotePage(note, bodyHtml): string` returning a **self-contained branded HTML page** (navy `#1A1A2E` / coral `#E94560`, inline `<style>`, no external assets): note title (`<h1>`), a small meta line (type · status · folder · id), then the rendered content in a readable prose column. Escape the title/meta.
- Content-Type `text/html; charset=utf-8`.

### Security

- The note path comes from `scanVault` (already inside the vault), and the read is additionally guarded so the resolved absolute path starts with `vaultDir` — no path escape. `marked` output for a *local, trusted* vault is rendered as-is; the page is served only on `localhost` by a viewer the user launched over their own files (same trust model as the existing raw-file serving).

## Non-goals

- Editing the note (view only).
- Live reload of the note page.
- Full CommonMark edge cases beyond what `marked` covers.
- Rendering in the main viewer (it opens a separate tab).

## Error handling & edge cases

- **Unknown id** → 404 branded page.
- **Path traversal / file outside vault** → 403.
- **Gap/folder nodes** → no button (frontend guard); if `/note/<gapid>` is hit directly, it 404s (no file).
- **Empty body** → page shows title + meta + an empty content note.
- **Wikilink to a non-existent note** → still a link to `/note/<target>` which 404s gracefully.

## Components touched

| File | Change |
|---|---|
| `package.json` | Add `marked` to `dependencies`. |
| `server.ts` | Add the `/note/<id>` route: resolve → read (guarded) → parseFrontmatter → wikilink rewrite → `marked` → `renderNotePage`. |
| `notePage.ts` (new) | `renderNotePage(note, bodyHtml)` → branded HTML string. |
| `index.html` | An `#open-note` button inside `#s-info`. |
| `app.js` | Show/hide + wire `#open-note` in `showPanel`/`hidePanel`. |

## Verification

Backend has vitest coverage available (unlike the static client):

1. **Unit test** (`notePage`/route): `renderNotePage` returns HTML containing the escaped title and the body HTML; the wikilink rewrite turns `[[x]]` into `/note/x`. A route-level test (in-memory server or the existing server test pattern) asserts `GET /note/<realid>` returns 200 HTML containing the title, and `GET /note/<unknown>` returns 404.
2. **Playwright** on a built `dist`: selecting a real note shows the "Open note" button; a gap/folder node hides it; `GET /note/<id>` renders the title + content; console clean.
3. **User sign-off**.

## Rollout

Single PR on `feat/viz-open-note`. Update the `README.md` `cortex viz` line to mention opening a note. Since it adds a runtime dep and a backend route, note both in the PR.
