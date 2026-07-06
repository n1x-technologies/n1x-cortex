import { existsSync, mkdirSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { scanVault } from '../vault.js';
import { loadConfig } from '../config.js';
import { collectFrontmatterKeys } from '../vault.js';
import { selectTopicNotes } from './moc.js';
import { mdToTyp } from './md2typ.js';
import type { CortexConfig, Note } from '../types.js';

export interface DocPlan { topic: string; notes: { title: string; body: string }[]; dest: string }

// Resolve the shipped Typst template dir (repo-root/templates/typst), valid from src/ and dist/.
const TEMPLATE_DIR = fileURLToPath(new URL('../../../templates/typst', import.meta.url));

function orderByMoc(vaultDir: string, config: CortexConfig, topic: string, selected: Note[]): Note[] {
  const mocPath = resolve(vaultDir, `${config.mocDir}/${topic}.md`);
  if (!existsSync(mocPath)) return selected;
  const moc = readFileSync(mocPath, 'utf8');
  const order: string[] = [];
  for (const m of moc.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)) order.push(m[1].trim());
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...selected].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
}

export function planDoc(vaultDir: string, config: CortexConfig, topic: string): DocPlan {
  const selected = selectTopicNotes(scanVault(vaultDir, config), config, topic);
  const ordered = orderByMoc(vaultDir, config, topic, selected);
  return {
    topic,
    notes: ordered.map(n => ({ title: n.title, body: n.body })),
    dest: `${config.outDir}/${topic}.typ`,
  };
}

export function renderDocTyp(plan: DocPlan, config: CortexConfig): string {
  const year = String(new Date().getFullYear());
  const lang = config.lang ?? 'en';
  const head = [
    '#import "template.typ": *',
    '#show: doc.with(',
    `  title: "${plan.topic}",`,
    '  doc-label: "Cortex",',
    '  client: "N1X Technologies",',
    `  date: "${year}",`,
    `  lang: "${lang}",`,
    ')',
    '',
  ];
  const body = plan.notes.map(n => `= ${n.title}\n\n${mdToTyp(n.body, 0)}`).join('\n\n');
  return head.join('\n') + '\n' + body + '\n';
}

export function runDoc(vaultDir: string, topic: string, opts: { pdf?: boolean }): {
  dest: string; pdf: string | null; compiled: boolean;
} {
  const config = loadConfig(vaultDir, collectFrontmatterKeys(vaultDir));
  const plan = planDoc(vaultDir, config, topic);
  const outAbs = resolve(vaultDir, config.outDir);
  mkdirSync(outAbs, { recursive: true });
  for (const f of ['template.typ', 'brand.typ']) copyFileSync(join(TEMPLATE_DIR, f), join(outAbs, f));
  const destAbs = resolve(vaultDir, plan.dest);
  writeFileSync(destAbs, renderDocTyp(plan, config));

  let pdf: string | null = null;
  let compiled = false;
  if (opts.pdf) {
    const pdfAbs = destAbs.replace(/\.typ$/, '.pdf');
    try {
      execFileSync('typst', ['compile', destAbs, pdfAbs], { stdio: 'ignore' });
      pdf = `${config.outDir}/${topic}.pdf`;
      compiled = true;
    } catch {
      compiled = false;   // typst missing or compile error → leave the .typ for manual compile
    }
  }
  return { dest: plan.dest, pdf, compiled };
}

export function formatDoc(r: ReturnType<typeof runDoc>): string {
  const lines = [`Doc → ${r.dest}`];
  if (r.compiled && r.pdf) lines.push(`Compiled PDF → ${r.pdf}`);
  else lines.push(`To build the PDF: typst compile ${r.dest} ${r.dest.replace(/\.typ$/, '.pdf')}`);
  return lines.join('\n');
}
