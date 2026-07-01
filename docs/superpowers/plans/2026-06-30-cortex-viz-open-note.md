# Cortex `viz` — Open note Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An "Open note" button in the viewer's info panel opens the note's rendered markdown in a new browser tab at `/note/<id>`.

**Architecture:** Task 1 adds the backend — `marked` dep, a `notePage.ts` renderer (branded HTML + wikilink rewrite), and a guarded `/note/<id>` route in `server.ts`, with vitest coverage. Task 2 adds the frontend button and wiring.

**Tech Stack:** Node/TS server (http, gray-matter via existing `parseFrontmatter`, `marked`), vitest; vanilla browser JS for the button.

## Global Constraints

- Files: `toolkit/package.json`, `toolkit/src/viz/server.ts`, new `toolkit/src/viz/notePage.ts`, `toolkit/src/viz/static/{app.js,index.html}`, and a new test file. No `graphData.ts`/`/api/graph` change.
- `marked` is a runtime **dependency** (server-side render). Keep it the only new dep.
- Path-confined reads: the resolved note file must live inside the vault (mirror the existing static-file guard using `normalize` + `startsWith(vaultDir + sep)`); reject with 403 otherwise. Unknown id → 404 branded page.
- Palette navy `#1A1A2E` / coral `#E94560`.
- Backend verified by **vitest** (real tests); the frontend button by Playwright + `node --check`.

---

## Task 1: Backend — `/note/<id>` route, `notePage.ts`, `marked`

**Files:**
- Modify: `toolkit/package.json` (add `marked`)
- Create: `toolkit/src/viz/notePage.ts`
- Modify: `toolkit/src/viz/server.ts` (add the route)
- Create: `toolkit/test/note-page.test.ts`

**Interfaces:**
- Produces: `renderMarkdown(body: string): string` (wikilink rewrite + marked), `renderNotePage(note, bodyHtml): string`, `renderNotFound(id): string`.

- [ ] **Step 1: Add `marked`**

```bash
cd /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit && npm install marked@^12
```
Confirm it lands in `dependencies` (not devDependencies).

- [ ] **Step 2: Create `toolkit/src/viz/notePage.ts`**

Read `toolkit/src/types.ts` for the exact `Note` field names (expected: `id`, `title`, `type`, `status`, `folder`, `path`), then create the file. Use those field names verbatim.

```ts
import { marked } from 'marked';
import type { Note } from '../types.js';

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

// Rewrite [[target]] / [[target|alias]] into markdown links to /note/<target> before rendering.
export function renderMarkdown(body: string): string {
  const withLinks = String(body ?? '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => {
    const t = String(target).trim();
    const text = String(alias ?? t).trim();
    return `[${text}](/note/${encodeURIComponent(t)})`;
  });
  return marked.parse(withLinks, { async: false }) as string;
}

const PAGE_CSS = `
  :root { --navy:#1A1A2E; --coral:#E94560; --bg:#11111b; --panel:#1c1c2b; --ink:#e8e8f2; --muted:#9a9ab5; --line:#2a2a40; }
  * { box-sizing:border-box; } html,body { margin:0; background:var(--bg); color:var(--ink);
    font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif; }
  main { max-width:760px; margin:0 auto; padding:40px 24px 80px; }
  h1 { margin:0 0 4px; } .meta { color:var(--muted); font-size:13px; margin:0 0 24px; }
  article { border-top:1px solid var(--line); padding-top:20px; }
  article a { color:var(--coral); } article code { background:var(--panel); padding:1px 5px; border-radius:4px; }
  article pre { background:var(--panel); padding:12px 14px; border-radius:8px; overflow:auto; }
  article pre code { background:none; padding:0; }
  article blockquote { border-left:3px solid var(--line); margin:0; padding:2px 14px; color:var(--muted); }
  article table { border-collapse:collapse; } article th, article td { border:1px solid var(--line); padding:4px 8px; }
  article img { max-width:100%; }
`;

export function renderNotePage(note: Note, bodyHtml: string): string {
  const meta = [note.type, note.status, note.folder, note.id].filter(Boolean).map(esc).join(' · ');
  const title = esc(note.title || note.id);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>` +
    `<title>${title} — Cortex</title><style>${PAGE_CSS}</style></head>` +
    `<body><main><h1>${title}</h1><p class="meta">${meta}</p><article>${bodyHtml}</article></main></body></html>`;
}

export function renderNotFound(id: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>Not found — Cortex</title>` +
    `<style>${PAGE_CSS}</style></head><body><main><h1>Note not found</h1>` +
    `<p class="meta">${esc(id)}</p></main></body></html>`;
}
```

- [ ] **Step 3: Add the `/note/<id>` route in `server.ts`**

Read `server.ts`. It already imports `scanVault`? If not, add `import { scanVault } from '../vault.js';` and `import { parseFrontmatter } from '../note.js';` (verify the exact export locations of `scanVault` and `parseFrontmatter`), plus `import { renderNotePage, renderMarkdown, renderNotFound } from './notePage.js';` and `readFile` for utf8. Insert this handler **after** the `/api/graph` block and **before** the static-file fallback (`const rel = ...`):

```ts
      if (url.pathname.startsWith('/note/')) {
        const id = decodeURIComponent(url.pathname.slice('/note/'.length));
        const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
        const note = scanVault(vaultDir, config).find((n) => n.id === id);
        if (!note) {
          res.writeHead(404, { 'content-type': MIME['.html'] });
          res.end(renderNotFound(id));
          return;
        }
        const abs = normalize(join(vaultDir, note.path));
        if (abs !== vaultDir && !abs.startsWith(vaultDir + sep)) {
          res.writeHead(403); res.end('forbidden'); return;
        }
        const raw = await readFile(abs, 'utf8');
        const { body } = parseFrontmatter(raw);
        res.writeHead(200, { 'content-type': MIME['.html'] });
        res.end(renderNotePage(note, renderMarkdown(body)));
        return;
      }
```

(`loadConfig`, `collectFrontmatterKeys`, `MIME`, `normalize`, `join`, `sep`, `readFile` are already imported/used by the file. Add only what's missing.)

- [ ] **Step 4: Test — `toolkit/test/note-page.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown, renderNotePage, renderNotFound } from '../src/viz/notePage.js';

describe('notePage', () => {
  it('renders markdown to html', () => {
    const html = renderMarkdown('# Hi\n\n**bold** text');
    expect(html).toContain('<h1');
    expect(html).toContain('<strong>bold</strong>');
  });
  it('rewrites wikilinks to /note/ links', () => {
    const html = renderMarkdown('see [[alpha]] and [[beta|B]]');
    expect(html).toContain('href="/note/alpha"');
    expect(html).toContain('href="/note/beta"');
    expect(html).toContain('>B</a>');
  });
  it('renderNotePage includes escaped title + body + meta', () => {
    const note = { id: 'n1', title: 'A & B', type: 'concept', status: 'draft', folder: '', path: 'n1.md' } as any;
    const page = renderNotePage(note, '<p>hello</p>');
    expect(page).toContain('A &amp; B');
    expect(page).toContain('<p>hello</p>');
    expect(page).toContain('concept · draft');
  });
  it('renderNotFound escapes the id', () => {
    expect(renderNotFound('<x>')).toContain('&lt;x&gt;');
  });
});
```

- [ ] **Step 5: Run tests + build**

```bash
cd /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit && npm test 2>&1 | tail -8 && npm run build 2>&1 | tail -2
```
Expected: all tests pass (incl. the 4 new); build clean.

- [ ] **Step 6: Commit**

```bash
git add toolkit/package.json toolkit/package-lock.json toolkit/src/viz/notePage.ts toolkit/src/viz/server.ts toolkit/test/note-page.test.ts
git commit -m "feat(viz): serve rendered notes at /note/<id>

Adds a guarded /note/<id> route that resolves the note, reads it (path-confined),
rewrites wikilinks to /note/ links, and renders the markdown to a branded HTML
page via marked. Unknown id -> 404. New notePage.ts renderer + tests.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Controller verification:** launch on a vault, `curl`-equivalent `GET /note/<realid>` returns 200 HTML with the title + rendered body; `GET /note/<unknown>` → 404 page.

---

## Task 2: Frontend — "Open note" button

**Files:**
- Modify: `toolkit/src/viz/static/index.html` (button in `#panel`)
- Modify: `toolkit/src/viz/static/style.css` (button style)
- Modify: `toolkit/src/viz/static/app.js` (show/hide + wire in `showPanel`)

**Interfaces:**
- Consumes: the `/note/<id>` route (Task 1). Button id `#open-note`.

- [ ] **Step 1: Add the button in `index.html`**

In `#panel`, right after the `<h2 id="p-title"></h2>` line, add:

```html
          <button id="open-note" class="hidden">Open note ↗</button>
```

- [ ] **Step 2: Style it in `style.css`**

Append:

```css
#open-note { display: inline-block; margin: 0 0 10px; background: var(--coral); color: #fff;
  border: none; border-radius: 6px; padding: 5px 10px; font-size: 12px; cursor: pointer; }
#open-note.hidden { display: none; }
```

- [ ] **Step 3: Wire it in `app.js`'s `showPanel`**

In `showPanel(n)`, right after the line that sets `#p-title` textContent, add:

```js
  const openBtn = document.getElementById('open-note');
  if (n.exists && !n.isFolder) {
    openBtn.classList.remove('hidden');
    openBtn.onclick = () => window.open('note/' + encodeURIComponent(n.id), '_blank', 'noopener');
  } else {
    openBtn.classList.add('hidden');
  }
```

(`hidePanel` already hides the whole `#panel`, so the button hides with it; the per-note guard handles gap/folder selections.)

- [ ] **Step 4: Syntax gate**

Run: `node --check /Users/wagnersebastian/Documents/0_WSDC-Tech/4_N1X/n1x-cortex/toolkit/src/viz/static/app.js`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add toolkit/src/viz/static/index.html toolkit/src/viz/static/style.css toolkit/src/viz/static/app.js
git commit -m "feat(viz): Open note button in the info panel

Real-note selections show an 'Open note' button that opens /note/<id> in a new
browser tab; hidden for gap/folder nodes.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Controller verification:** Playwright — selecting a real note shows `#open-note`; a gap node hides it; the button's target is `note/<id>`; console clean. Then a real `/note/<id>` tab renders the note.

---

## Final: README + PR

- [ ] Update the README `cortex viz` line to append `, and click a node's "Open note" to read it rendered in a new tab.` (keep concise).
- [ ] `git push -u origin feat/viz-open-note && gh pr create --fill` — note in the body that this adds the `marked` runtime dep and a backend route.

## Self-Review (plan author)
- Backend route + notePage + marked + tests → Task 1. ✅
- Button (real-notes only) opens new tab → Task 2. ✅
- Path-guard, 404, wikilink rewrite, escaping → Task 1 (route + notePage). ✅
- Names consistent: `renderMarkdown`/`renderNotePage`/`renderNotFound`, `#open-note`, `/note/<id>`. ✅
