import { marked } from 'marked';
import type { Note } from '../types.js';

function esc(s: unknown): string {
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

// The note page shares the viewer's ink palette and fonts (served from /fonts/).
const PAGE_CSS = `
@font-face{font-family:'Archivo';src:url('/fonts/archivo.woff2') format('woff2');font-weight:100 900;font-display:swap}
@font-face{font-family:'Plus Jakarta Sans';src:url('/fonts/plus-jakarta-sans.woff2') format('woff2');font-weight:200 800;font-display:swap}
@font-face{font-family:'Martian Mono';src:url('/fonts/martian-mono.woff2') format('woff2');font-weight:100 800;font-display:swap}
:root{--bg:#161615;--bg-deep:#1c1b1a;--bg-elevated:#232220;--text:#f1efea;--text-secondary:rgba(241,239,234,.70);--text-muted:rgba(241,239,234,.44);--border:rgba(241,239,234,.12);--border-strong:rgba(241,239,234,.30);--font-display:'Archivo',-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;--font-body:'Plus Jakarta Sans',-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;--font-mono:'Martian Mono',ui-monospace,SFMono-Regular,Menlo,monospace}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font:400 16px/1.7 var(--font-body);-webkit-font-smoothing:antialiased}
.wordmark{max-width:720px;margin:0 auto;padding:28px 24px 0;font-family:var(--font-mono);font-weight:400;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--text-muted)}
main{max-width:720px;margin:0 auto;padding:36px 24px 40px}
h1{font-family:var(--font-display);font-weight:300;font-size:42px;line-height:1.06;letter-spacing:-.032em;margin:0 0 14px}
.meta{color:var(--text-muted);font-family:var(--font-mono);font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:400;margin:0 0 32px}
article{border-top:1px solid var(--border);padding-top:32px;font-weight:400;color:var(--text)}
article strong{font-weight:600}
article h1,article h2,article h3,article h4{font-family:var(--font-display);font-weight:400;letter-spacing:-.018em;line-height:1.25;margin:1.8em 0 .5em}
article h2{font-size:25px}article h3{font-size:20px}
article p{margin:0 0 1.1em}
article a{color:var(--text);text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--border-strong)}
article a:hover{text-decoration-color:var(--text)}
article code{background:var(--bg-elevated);padding:2px 6px;border-radius:0;font-size:.84em;font-family:var(--font-mono)}
article pre{background:var(--bg-deep);border:1px solid var(--border);padding:16px 18px;border-radius:0;overflow:auto}
article pre code{background:none;padding:0}
article blockquote{border-left:1px solid var(--border-strong);margin:0 0 1.1em;padding:2px 16px;color:var(--text-secondary)}
article ul,article ol{padding-left:1.3em}
article table{border-collapse:collapse;width:100%}article th,article td{border:1px solid var(--border);padding:6px 10px;text-align:left}article th{background:var(--bg-elevated);font-family:var(--font-mono);font-weight:400;font-size:11px;letter-spacing:.1em;text-transform:uppercase}
article img{max-width:100%;border-radius:0}
article hr{border:none;border-top:1px solid var(--border);margin:2em 0}
.footer{max-width:720px;margin:0 auto;padding:56px 24px 80px;color:var(--text-muted);font-family:var(--font-mono);font-size:10px;letter-spacing:.14em;text-transform:uppercase;border-top:1px solid var(--border);margin-top:24px}
`;

export function renderNotePage(note: Note, bodyHtml: string): string {
  const meta = [note.type, note.status, note.folder, note.id].filter(Boolean).map(esc).join(' · ');
  const title = esc(note.title || note.id);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>` +
    `<title>${title} — N1X Cortex</title><style>${PAGE_CSS}</style></head>` +
    `<body>` +
    `<div class="wordmark">N1X&nbsp;Cortex</div>` +
    `<main><h1>${title}</h1><p class="meta">${meta}</p><article>${bodyHtml}</article></main>` +
    `<div class="footer">© 2026 N1X Technologies</div>` +
    `</body></html>`;
}

export function renderNotFound(id: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"/>` +
    `<title>Not found — N1X Cortex</title><style>${PAGE_CSS}</style></head>` +
    `<body>` +
    `<div class="wordmark">N1X&nbsp;Cortex</div>` +
    `<main><h1>Note not found</h1><p class="meta">${esc(id)}</p></main>` +
    `<div class="footer">© 2026 N1X Technologies</div>` +
    `</body></html>`;
}
