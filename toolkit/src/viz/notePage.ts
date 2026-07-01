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

const PAGE_CSS = `
@font-face{font-family:'MONTECHV02';src:url('/fonts/MONTECHV02-Light.woff2') format('woff2');font-weight:300;font-display:swap}
@font-face{font-family:'MONTECHV02';src:url('/fonts/MONTECHV02-Regular.woff2') format('woff2');font-weight:400;font-display:swap}
@font-face{font-family:'MONTECHV02';src:url('/fonts/MONTECHV02-Medium.woff2') format('woff2');font-weight:500;font-display:swap}
@font-face{font-family:'MONTECHV02';src:url('/fonts/MONTECHV02-SemiBold.woff2') format('woff2');font-weight:600;font-display:swap}
@font-face{font-family:'MONTECHV02';src:url('/fonts/MONTECHV02-Bold.woff2') format('woff2');font-weight:700;font-display:swap}
@font-face{font-family:'MONTECHV02';src:url('/fonts/MONTECHV02-ExtraBold.woff2') format('woff2');font-weight:800;font-display:swap}
:root{--bg:#292929;--bg-deep:#1e1e1e;--bg-elevated:#333333;--text:#e5e5e5;--text-secondary:#b0b0b0;--text-muted:#7d7d7d;--border:#3a3a3a;--border-strong:#565656;--font:'MONTECHV02',-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 var(--font);-webkit-font-smoothing:antialiased}
.wordmark{max-width:720px;margin:0 auto;padding:28px 24px 0;font-weight:700;font-size:12px;letter-spacing:.22em;text-transform:uppercase;color:var(--text-muted)}
main{max-width:720px;margin:0 auto;padding:32px 24px 40px}
h1{font-weight:800;font-size:34px;line-height:1.15;letter-spacing:-.02em;margin:0 0 10px}
.meta{color:var(--text-muted);font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:600;margin:0 0 32px}
article{border-top:1px solid var(--border);padding-top:32px;font-weight:400}
article h1,article h2,article h3,article h4{font-weight:700;letter-spacing:-.01em;line-height:1.25;margin:1.8em 0 .5em}
article h2{font-size:24px}article h3{font-size:19px}
article p{margin:0 0 1.1em}
article a{color:var(--text);text-decoration:underline;text-underline-offset:2px;text-decoration-color:var(--border-strong)}
article a:hover{text-decoration-color:var(--text)}
article code{background:var(--bg-elevated);padding:2px 6px;border-radius:4px;font-size:.9em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
article pre{background:var(--bg-deep);border:1px solid var(--border);padding:16px 18px;border-radius:8px;overflow:auto}
article pre code{background:none;padding:0}
article blockquote{border-left:2px solid var(--border-strong);margin:0 0 1.1em;padding:2px 16px;color:var(--text-secondary)}
article ul,article ol{padding-left:1.3em}
article table{border-collapse:collapse;width:100%}article th,article td{border:1px solid var(--border);padding:6px 10px;text-align:left}article th{background:var(--bg-elevated)}
article img{max-width:100%;border-radius:6px}
article hr{border:none;border-top:1px solid var(--border);margin:2em 0}
.footer{max-width:720px;margin:0 auto;padding:56px 24px 80px;color:var(--text-muted);font-size:11px;letter-spacing:.08em;text-transform:uppercase;border-top:1px solid var(--border);margin-top:24px}
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
