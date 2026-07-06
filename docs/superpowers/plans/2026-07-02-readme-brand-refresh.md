# README rewrite + N1X brand refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is a docs + static-asset change: there are no unit tests — each task's "verify" step is a concrete grep / file / render check.

**Goal:** Rewrite `README.md` to lead with the shipped adoption story (any agent/CLI or none · bootstrap · cited+local+reversible), re-skin the repo to the real N1X monochrome brand (replacing the ad-hoc navy/coral), add a synced Spanish `README.es.md`, and reconcile `CLAUDE.md`'s brand rule.

**Architecture:** Three deliverables in dependency order — (1) the brand foundation (new monochrome hero SVG + CLAUDE.md brand rule), (2) the rewritten English README (source of truth), (3) the Spanish translation. No runtime code; the CLI is untouched.

**Tech Stack:** Markdown, a self-contained SVG hero, GitHub-flavored rendering.

## Global Constraints

- **Strictly monochrome:** `#292929` (charcoal base) / `#e5e5e5` (light) plus neutral grays only — **no hue, no gradient, no glow, no colored shadow.** Hierarchy via weight/size/tracking/spacing/borders, never color.
- **No `1A1A2E` (navy) and no `E94560` (coral)** anywhere in `README.md`, `README.es.md`, or `docs/assets/hero.svg`. Final grep must return nothing.
- **No bundled proprietary font.** The hero embeds no font file (MONTECHV02 is not redistributable); OSS type stand-ins are Space Grotesk / Inter.
- **Hero is a self-contained SVG** that renders on GitHub with no external web-font dependency.
- **English is the source of truth.** `README.es.md` tracks it; a language switcher sits at the top of both (both directions); `README.es.md` carries an "English is authoritative" note.
- **Accuracy:** every command and claim matches shipped behavior — `cortex mcp` modes, `cortex atomize --model …` (BYO-key), `cortex bootstrap … --write` (dry-run previews for free, one `cortex undo`), all as merged in PR #66 / #68.
- **Attribution/confidentiality:** N1X Technologies, © 2026, no personal names/emails, no client data.

---

### Task 1: Monochrome hero SVG + CLAUDE.md brand rule

**Files:**
- Replace: `docs/assets/hero.svg`
- Modify: `CLAUDE.md` (rule #3, "Own brand palette")

**Interfaces:**
- Produces: `docs/assets/hero.svg` — the monochrome banner both READMEs embed via `<img src="docs/assets/hero.svg">`.

- [ ] **Step 1: Replace the hero with a monochrome, self-contained SVG**

Overwrite `docs/assets/hero.svg` with exactly:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 340" role="img" aria-label="N1X Cortex — the cited knowledge graph, for you and your agents">
  <rect width="1200" height="340" fill="#292929"/>
  <text x="600" y="168" text-anchor="middle" fill="#e5e5e5"
        font-family="'Space Grotesk','Helvetica Neue',Arial,sans-serif"
        font-size="104" font-weight="700" letter-spacing="16">N1X CORTEX</text>
  <rect x="540" y="196" width="120" height="2" fill="#e5e5e5"/>
  <text x="600" y="240" text-anchor="middle" fill="#9a9a9a"
        font-family="'Space Grotesk','Helvetica Neue',Arial,sans-serif"
        font-size="25" font-weight="400" letter-spacing="7">THE CITED KNOWLEDGE GRAPH — FOR YOU AND YOUR AGENTS</text>
</svg>
```

This is monochrome (`#292929` field, `#e5e5e5` wordmark, neutral `#9a9a9a` tagline), self-contained, and renders on GitHub (a geometric sans is used; no external font file is loaded). The thin `#e5e5e5` rule is the only ornament.

> Optional fidelity upgrade (only if a text-to-path tool + Space Grotesk OFL are available): outline the two `<text>` elements to `<path>` data so the letterforms are pixel-identical regardless of the viewer's fonts. Not required — the `<text>` version above is the shippable deliverable.

- [ ] **Step 2: Verify the hero is monochrome and self-contained**

Run: `grep -iE '1A1A2E|E94560|linearGradient|radialGradient|filter|<image|@font-face|url\(' docs/assets/hero.svg || echo "CLEAN"`
Expected: `CLEAN` (no navy/coral, no gradient/glow/filter, no embedded image or font).

Manual: open `docs/assets/hero.svg` in a browser (or the GitHub preview) — confirm charcoal band, light wordmark "N1X CORTEX", tagline, no color.

- [ ] **Step 3: Update the CLAUDE.md brand rule**

In `CLAUDE.md`, replace rule #3 under "Rules for working in this repo" — the line beginning **"3. **Own brand palette:** N1X Cortex uses its own palette — navy `1A1A2E` / coral `E94560`…"** — with:

```markdown
3. **Brand — real N1X identity (monochrome):** N1X Cortex uses the canonical N1X brand — **strictly monochrome `#292929` (charcoal) / `#e5e5e5` (light), no accent hue, no gradient, no glow.** Hierarchy comes from weight/size/tracking/spacing/borders, never color. Source of truth: the `n1x-brand-identity` repo. For OSS deliverables use the libre fonts **Space Grotesk** (display) / **Inter** (body) — never bundle MONTECHV02 (not redistributable). The old ad-hoc navy `1A1A2E` / coral `E94560` palette is retired.
```

- [ ] **Step 4: Verify CLAUDE.md no longer states the old palette**

Run: `grep -iE '1A1A2E|E94560' CLAUDE.md || echo "CLEAN"`
Expected: `CLEAN`.

- [ ] **Step 5: Commit**

```bash
git add docs/assets/hero.svg CLAUDE.md
git commit -m "docs(brand): monochrome N1X hero + reconcile CLAUDE.md brand rule"
```

---

### Task 2: Rewrite README.md (English, source of truth)

**Files:**
- Rewrite: `README.md`

**Interfaces:**
- Consumes: `docs/assets/hero.svg` (Task 1).
- Produces: the final English README that `README.es.md` (Task 3) translates section-for-section.

**Method:** Rewrite the whole file to the structure below. Preserve the *accurate command blocks* already in the current README (the `cortex init/status/query/viz` quickstart, the `cortex mcp` invocations, the BYO-key `cortex atomize --model` and `cortex bootstrap` examples, the commands table, semantic search) — copy them across verbatim so no command drifts. Only the framing, ordering, and prose change. Every prose claim must match shipped behavior.

- [ ] **Step 1: Write the header (switcher + hero + badges, monochrome)**

The file begins with the language switcher, then the hero, then monochrome badges. Use exactly:

```markdown
<p align="right"><b>English</b> · <a href="README.es.md">Español</a></p>

<p align="center">
  <img src="docs/assets/hero.svg" alt="N1X Cortex — the cited knowledge graph, for you and your agents" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@n1x-technologies/cortex"><img alt="npm" src="https://img.shields.io/npm/v/@n1x-technologies/cortex?color=292929&label=npm"></a>
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A518-292929">
  <img alt="MCP" src="https://img.shields.io/badge/MCP-ready-292929">
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-292929"></a>
  <img alt="local-first" src="https://img.shields.io/badge/local--first-%E2%9C%93-292929">
</p>

<p align="center">
  <b>Turn any folder of markdown — or an undocumented repo — into a cited, AI-queryable knowledge graph.<br>
  For <i>you</i> and for your <i>agents</i>, from <i>any</i> CLI.</b>
</p>

\`\`\`bash
npm i -g @n1x-technologies/cortex
\`\`\`
```

(All five badges use `292929`; no `E94560`/`1A1A2E`. The old "bold version / grounded version" blockquote is removed.)

- [ ] **Step 2: Write the body in this exact section order**

Write these sections, in order. Prose is yours to craft to the intent; command blocks are copied verbatim from the current README where noted.

1. `## What it is` — 2–3 sentences: scattered markdown that humans can read but agents can't trust (no structure/provenance); Cortex reads it into a **cited note graph** so a person *and* an agent know where every answer came from. Keep four tightened bullets: **Atomic & connected**, **Cited by design**, **Local-first & private**, **Agent-native (MCP)**.
2. `## Why it clicks` — three subsections (the hooks), each 1–2 sentences + its command:
   - **Any agent, any CLI — or none.** Read/query and write back over **MCP** from Claude Code, Copilot (agent mode), Cursor, Cline, etc. — or distill with your own key and no agent at all (`cortex atomize source.md --model anthropic:claude-3-5-sonnet --write`). One distillation methodology drives every path.
   - **Point it at an undocumented repo — it documents itself.** `cortex bootstrap . --model anthropic:claude-3-5-sonnet --write` reads every file (code included) and distills the project's concepts into connected notes. Dry-run (no `--write`) previews the file plan **for free — it calls no model**; the whole run is reversible with `cortex undo`.
   - **Cited, local-first, reversible.** Every answer cites its source notes; nothing leaves your machine; every write is backed up and `cortex undo`-able.
3. `## Quickstart (30 seconds)` — copy the current quickstart code block verbatim (`npm i -g …`, `cd my-vault`, `cortex init`, `cortex status`, `cortex query "…"`, `cortex viz`) + the "no account, no server, no cloud" line + the `### Updating` block.
4. `## Use it from any agent (MCP)` — condense the current MCP section: the `cortex mcp` / `--write` / `--write=curate` invocations (copy the command block verbatim) and the read/draft/curate mode table, tightened.
5. `## Distill or bootstrap without an agent (BYO-key)` — merge the current `### Distill without an agent (BYO-key)` and `### Bootstrap an undocumented repo` sections; copy their command blocks verbatim (Anthropic + `openai-compat`/local Ollama; `cortex bootstrap` with dry-run/undo note).
6. `## Commands` — copy the current commands table verbatim.
7. `## How it works` — keep, tightened.
8. `## Semantic search (optional)` — keep, tightened.
9. `## Where this is going` + `## Roadmap` — keep.
10. `## From source (contributors)` — keep.
11. `## License` — keep; ensure "N1X Technologies", "© 2026", MIT.

- [ ] **Step 3: Verify accuracy, brand, and structure**

Run: `grep -iE '1A1A2E|E94560' README.md || echo "CLEAN"`
Expected: `CLEAN`.

Run: `grep -c '^## ' README.md`
Expected: the section count matches the list above (≈ 10 top-level `##` sections).

Manual accuracy check — confirm every command block still reflects shipped flags: `cortex mcp [--write[=curate]]`, `cortex atomize <src> --model <provider:model> [--base-url] --write`, `cortex bootstrap [path] --model … [--write]`. Confirm the hero `<img>` path is `docs/assets/hero.svg` and the switcher points to `README.es.md`.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): rewrite — lead with any-agent/bootstrap story, monochrome brand"
```

---

### Task 3: README.es.md (Spanish translation) + switcher

**Files:**
- Create: `README.es.md`

**Interfaces:**
- Consumes: the final `README.md` (Task 2) and `docs/assets/hero.svg` (Task 1).

- [ ] **Step 1: Create README.es.md as a faithful translation**

Translate the finalized `README.md` section-for-section into Spanish. Rules:
- **Same structure, same order, same assets** — the identical hero `<img>` (English `alt` is fine, or a Spanish `alt`), the identical badges (they carry no translatable prose).
- **Code/command blocks are NOT translated** — copy them byte-identical from `README.md` (flags, package names, and `cortex` output stay in their original form).
- **Prose is translated** to clear, natural Spanish.
- Top of file — the switcher (reversed) and the authoritative-source note:

```markdown
<p align="right"><a href="README.md">English</a> · <b>Español</b></p>

<p align="center">
  <img src="docs/assets/hero.svg" alt="N1X Cortex — el grafo de conocimiento citado, para ti y para tus agentes" width="100%">
</p>

> **Nota:** el inglés (`README.md`) es la fuente de verdad. Si esta traducción queda desactualizada, prevalece el inglés.
```

Then the translated badges block (identical shields to `README.md`), the translated tagline, the install line, and every translated section (`## Qué es`, `## Por qué funciona`, `## Inicio rápido (30 segundos)`, `## Úsalo desde cualquier agente (MCP)`, `## Distila o haz bootstrap sin agente (BYO-key)`, `## Comandos`, `## Cómo funciona`, `## Búsqueda semántica (opcional)`, `## Hacia dónde va` / `## Roadmap`, `## Desde el código (colaboradores)`, `## Licencia`).

- [ ] **Step 2: Verify parity, links, and brand**

Run: `grep -iE '1A1A2E|E94560' README.es.md || echo "CLEAN"`
Expected: `CLEAN`.

Run: `test -f README.es.md && grep -q 'README.md' README.es.md && grep -q 'README.es.md' README.md && echo "SWITCHER OK"`
Expected: `SWITCHER OK` (both files link to each other).

Run: `grep -c '^## ' README.es.md` and compare to `grep -c '^## ' README.md`
Expected: equal counts (section parity).

Manual: confirm command blocks in `README.es.md` are byte-identical to `README.md` (untranslated) and the "fuente de verdad" note is present.

- [ ] **Step 3: Commit**

```bash
git add README.es.md
git commit -m "docs(readme): add synced Spanish README.es.md + language switcher"
```

---

## Verification (whole change)

- [ ] `grep -riE '1A1A2E|E94560' README.md README.es.md docs/assets/hero.svg CLAUDE.md` returns nothing (no navy/coral anywhere).
- [ ] `docs/assets/hero.svg` renders monochrome on GitHub (no missing-font boxes, no color).
- [ ] Language switcher resolves both ways (`README.md` ↔ `README.es.md`); `README.es.md` has the "English authoritative" note.
- [ ] Section counts match between the two READMEs; every command block is identical (untranslated) across them.
- [ ] Every command/claim matches shipped behavior (MCP modes, `atomize --model`, `bootstrap` dry-run-free-preview + single `undo`).
- [ ] Attribution: N1X Technologies, © 2026, MIT, no personal names/emails, no client data.
- [ ] Open a PR from `docs/readme-brand-refresh`.
