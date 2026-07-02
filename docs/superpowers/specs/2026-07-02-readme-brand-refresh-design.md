# README rewrite + N1X brand refresh (EN/ES) — design

> **Status:** designed on `docs/readme-brand-refresh`. Not yet implemented.
> **Builds on:** the two shipped open-source-hardening features — portable distillation (PR #66: any agent / any person / BYO-key) and repo bootstrap (PR #68: document an undocumented repo). This is open-source hardening item #3: make the README simple, well-documented, and on-brand so anyone can adopt Cortex from any CLI or agent.
> **Branch:** `docs/readme-brand-refresh`.
> **Product context:** the current README (257 lines) is competent but dense, still leads with abstract framing ("bold version / grounded version"), and is branded with an **ad-hoc navy `#1A1A2E` / coral `#E94560` palette that is NOT the real N1X identity**. The canonical N1X brand (repo `n1x-brand-identity`, local at `../n1x-brand-identity`) is **strictly monochrome**: `#292929` (charcoal base) / `#e5e5e5` (light surface), no accent hue, no gradient, no glow — industrial, minimal, "a system/control surface, not a SaaS marketing site." This cycle rewrites the README to lead with the adoption story the two shipped features made true, re-skins it to the real monochrome brand, adds a Spanish translation, and reconciles the repo's own brand rule.

## 1. Goal

A README a newcomer understands in ~10 seconds and can act on immediately, correctly branded in the real N1X monochrome identity, available in English (source of truth) and Spanish. Concretely:

1. **New hero** — a monochrome, pure-wordmark banner (charcoal `#292929` / light `#e5e5e5`), replacing the navy/coral `docs/assets/hero.svg`.
2. **Re-skinned badges** — recolored from coral/navy to monochrome charcoal.
3. **Rewritten `README.md`** (English, source of truth) — leads with the three adoption hooks the shipped features enable, then a clean reference.
4. **`README.es.md`** — a synced Spanish translation with a language switcher and an "English is authoritative" note.
5. **`CLAUDE.md` brand rule updated** — replace the navy/coral palette rule with the real N1X monochrome, citing the brand repo, so the repo's own instructions match reality.

Out of scope: additional languages beyond EN/ES (a later cycle if there's audience), any translation tooling/automation (2 languages are maintained by hand), and any code/CLI behavior changes.

## 2. Design principles

- **Real brand, not ad-hoc.** Adopt the canonical N1X monochrome identity from `n1x-brand-identity`: `#292929` / `#e5e5e5`, **strictly monochrome — no accent hue, no gradient, no glow, no colored shadow.** Hierarchy comes from weight/size/tracking/spacing/borders, never color. This supersedes the ad-hoc navy/coral used so far.
- **Lead with the payoff.** The first screenful sells the three things the shipped work made true: works with *any* agent/CLI (or none), points at an undocumented repo and documents it, and every answer is cited + local-first + reversible. Abstract "bold vs grounded" framing is cut.
- **Simple first, complete below.** A newcomer gets value in 10 seconds (hero → one-line install → what-it-is → hooks → 30-second quickstart); depth (MCP modes, commands, how-it-works, semantics) lives further down for those who want it.
- **English is the source of truth; Spanish tracks it.** Two hand-maintained files. `README.es.md` carries a visible note that English is authoritative if the two drift. A language switcher sits at the top of both. No translation tooling (YAGNI for two languages).
- **OSS-safe assets.** The hero is a self-contained SVG with text **outlined to vector paths** (no web-font dependency — renders identically on GitHub) and **no bundled proprietary font** (MONTECHV02 is not redistributable; its OSS stand-ins are Space Grotesk / Inter, already used by `cortex viz`). Monochrome only.
- **Accurate and generic.** Every claim reflects shipped behavior (per the merged features). N1X Technologies attribution, current-year ©, no personal names/emails, no client data (repo rule).

## 3. Components

### 3.1 Hero — `docs/assets/hero.svg` (replace)

A monochrome, pure-wordmark banner:
- Field: charcoal `#292929`. Wordmark **N1X CORTEX** in `#e5e5e5`, geometric/industrial (Space Grotesk character), letter-spaced per the brand's spacing discipline. Tagline beneath in a lighter weight: *"The cited knowledge graph — for you and your agents."*
- No color, gradient, glow, colored shadow, or decorative pattern. Optional: a thin `#e5e5e5` hairline rule as the only ornament, if it reads as "control surface" rather than decoration.
- **Text outlined to paths** so it renders without external fonts; self-contained; wide aspect (≈ 1200×300) so it scales full-width in the README.
- Sources the wordmark from the brand repo's canonical logo (`../n1x-brand-identity/assets/logo/`) for letterform fidelity; the SVG itself embeds no proprietary font file.

### 3.2 Badges (top of `README.md`)

Recolor the existing shields from coral (`E94560`) / navy (`1A1A2E`) to monochrome charcoal (`#292929` label/background). Keep the set (npm version, node ≥18, MCP-ready, license MIT, local-first). One tone only.

### 3.3 `README.md` (English — source of truth, rewrite)

Structure, top to bottom:
1. **Language switcher** — `English · [Español](README.es.md)` (top line).
2. **Hero** (`docs/assets/hero.svg`) + monochrome badges.
3. **One-line install** — `npm i -g @n1x-technologies/cortex`.
4. **What it is** — 2–3 sentences: scattered markdown → a cited, AI-queryable note graph; humans and agents both know where every answer came from. Keep the four value bullets (atomic & connected, cited, local-first, agent-native), tightened.
5. **Why it clicks — the three hooks:**
   - **Any agent, any CLI — or none.** Query/read and write back over **MCP** from Claude Code, Copilot (agent mode), Cursor, Cline, etc.; or distill with your own key and no agent (`cortex atomize --model …`, BYO-key). The same distillation methodology drives every path.
   - **Point it at an undocumented repo — it documents itself.** `cortex bootstrap . --model … --write` reads every file (code included), distills the project's concepts into connected notes; dry-run previews for free, the whole run is reversible.
   - **Cited, local-first, reversible.** Every answer cites its source notes; nothing leaves your machine; every write is backed up and `cortex undo`-able.
6. **Quickstart (30 seconds)** — `init` / `status` / `query` / `viz` (kept from current, tightened).
7. **Use it from any agent (MCP)** — the `cortex mcp` modes (read / draft / curate), condensed from the current section.
8. **Distill or bootstrap without an agent (BYO-key)** — `cortex atomize --model` and `cortex bootstrap`, incl. OpenAI-compatible/local (Ollama).
9. **Commands** — the reference table (kept).
10. **How it works** — brief (kept, tightened).
11. **Semantic search (optional)** — kept.
12. **Where this is going / Roadmap** — kept.
13. **From source (contributors)** — kept.
14. **License** — kept.

The rewrite reorders and tightens; it preserves the accurate command examples already in the file. Length target: meaningfully shorter and scannable, not padded.

### 3.4 `README.es.md` (Spanish translation)

A faithful translation of the rewritten `README.md`, same structure and assets (same hero, same badges). Top line: the language switcher `[English](README.md) · Español` plus a one-line note: *"El inglés (`README.md`) es la fuente de verdad; si esta traducción queda desactualizada, prevalece el inglés."* Command blocks stay identical (code is not translated); prose is translated.

### 3.5 `CLAUDE.md` (brand rule reconciliation)

Replace rule #3 ("Own brand palette: N1X Cortex uses its own palette — navy `1A1A2E` / coral `E94560`…") with the real identity: **N1X Cortex uses the canonical N1X brand — strictly monochrome `#292929` (charcoal) / `#e5e5e5` (light), no accent hue, no gradient/glow; see the `n1x-brand-identity` repo. For OSS deliverables use the libre fonts Space Grotesk / Inter (never bundle MONTECHV02).** This removes the contradiction between the repo's stated palette and the actual brand.

## 4. Data flow / dependencies

None runtime. This is a documentation + static-asset change. The `README` convention (repo rule: "the README is updated on every push") is satisfied by this rewrite; going forward both `README.md` and `README.es.md` are updated together, with English authoritative.

## 5. Verification

- **Rendered check:** the new `hero.svg` renders correctly on GitHub (no missing fonts — text is outlined), monochrome only, and looks crisp full-width in both READMEs.
- **Badge check:** all shields render in monochrome; no coral/navy remains in either README.
- **Accuracy check:** every command and claim in the rewritten README matches shipped behavior — `cortex mcp` modes, `cortex atomize --model`, `cortex bootstrap` flags and dry-run/undo semantics (as merged in PR #66 / #68).
- **Parity check:** `README.es.md` covers the same sections as `README.md`, links resolve (switcher both directions), and the "English authoritative" note is present.
- **No leftovers:** `grep -i '1A1A2E\|E94560'` across `README.md`, `README.es.md`, and `docs/assets/hero.svg` returns nothing; `CLAUDE.md` no longer states the navy/coral palette.
- **Confidentiality:** N1X Technologies attribution, current-year ©, no personal names/emails, no client data.

## 6. Deferred

- Additional languages (ZH / PT / JA / KO …) and any AI-assisted translation workflow — a later cycle if audience warrants; two hand-maintained languages now.
- Any isotipo/favicon refresh for `cortex viz` beyond the README — separate from this doc cycle.
