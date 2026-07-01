<p align="center">
  <img src="docs/assets/hero.svg" alt="N1X Cortex — the knowledge cortex for you and your agents" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@n1x-technologies/cortex"><img alt="npm" src="https://img.shields.io/npm/v/@n1x-technologies/cortex?color=E94560&label=npm"></a>
  <img alt="node" src="https://img.shields.io/badge/node-%E2%89%A518-1A1A2E">
  <img alt="MCP" src="https://img.shields.io/badge/MCP-ready-E94560">
  <a href="LICENSE"><img alt="license" src="https://img.shields.io/badge/license-MIT-1A1A2E"></a>
  <img alt="local-first" src="https://img.shields.io/badge/local--first-%E2%9C%93-1A1A2E">
</p>

<h1 align="center">N1X&nbsp;Cortex</h1>

<p align="center">
  <b>Turn any folder of markdown notes into a cited, AI-queryable knowledge graph —<br>
  for <i>you</i> and for your <i>agents</i>.</b>
</p>

---

> **The bold version:** Cortex is the **knowledge layer for the agentic era** — a reliable, cited brain that one agent (or a whole factory of them) can query to do real work instead of hallucinating.
>
> **The grounded version:** today it's a **working CLI + local viewer + MCP server** you install in one command. Everything below marked "today" actually runs. The big stuff is in [Where this is going](#-where-this-is-going).

```bash
npm i -g @n1x-technologies/cortex
```

---

## What it is

Most knowledge lives in scattered markdown — Obsidian vaults, docs, wikis. Humans can read it; **AI agents can't trust it** (no structure, no provenance). Cortex fixes that. It reads any markdown vault into a **note graph**, then answers questions **with citations to the exact source notes** — so both a person and an agent know *where every answer came from*.

- 🧩 **Atomic & connected** — your notes become a graph of linked, typed notes (wikilinks, frontmatter).
- 📌 **Cited by design** — every answer points back to its source notes. Provenance = trust. This is what separates Cortex from an opaque RAG.
- 🔒 **Local-first & private** — runs on your machine, on your files. Nothing leaves unless you say so.
- 🤖 **Agent-native** — ships an **MCP server**, so any agent can query your vault as a tool.

## Quickstart (30 seconds)

```bash
npm i -g @n1x-technologies/cortex      # or run without installing: npx @n1x-technologies/cortex

cd my-vault                            # any folder of .md notes
cortex init                            # detect your frontmatter, write .cortex.json (+ gitignore the cache)
cortex status                          # notes by type/status + orphans
cortex query "how does X work?"        # a cited answer from your own notes
cortex viz                             # 🌐 local web viewer — your knowledge graph
```

That's it — no account, no server, no cloud.

### Updating

Re-run the install anywhere to jump to the latest version:

```bash
npm i -g @n1x-technologies/cortex@latest
```

## 🤖 Use it from an AI agent (MCP)

This is the part that matters for the future. Cortex speaks the **[Model Context Protocol](https://modelcontextprotocol.io)**, so an agent can use your vault as a **cited knowledge source** — one of the first building blocks for agents that work from a *reliable* brain instead of guessing.

Run `cortex mcp install` **inside your vault** to register the server with Claude Code. The flag you give it decides what the agent is allowed to do:

```bash
# read-only (default) — agents can query and read your vault:
cortex mcp install

# ⭐ recommended — also let agents capture knowledge back as drafts (reversible):
cortex mcp install --write=draft

# full curator — drafts + promote + merge (structural, still reversible):
cortex mcp install --write=curate

# options — choose the vault and the registration scope (default scope: local):
cortex mcp install --write=draft --vault /path/to/vault --scope project   # scope: local | project | user

# verify, or remove:
claude mcp list
cortex mcp uninstall
```

`cortex mcp install` registers `cortex` with Claude Code for you (via the `claude` CLI when present, falling back to a merged `.mcp.json` for `--scope project`). It's idempotent — **re-run it any time to switch modes**. One catch: **reconnect the session afterward** (restart Claude Code, or `/mcp` → reconnect) so the agent picks up the new tool set — a running session won't see the change until it reconnects.

### Pick a mode

| Mode | Flag | What the agent can do | Use it when |
|------|------|------------------------|-------------|
| **Read-only** | *(none)* | Query & read notes. | You only want the agent to *consult* the brain. |
| **Draft** ⭐ | `--write=draft` | Read **+** capture: distill sources into `draft`s in `_inbox/`, set status, undo. Nothing leaves `_inbox/`. | **The recommended default.** The agent captures knowledge as it works; you review the drafts in `_inbox/` before anything is curated. Fully reversible. |
| **Curate** | `--write=curate` | Draft **+** promote drafts out of `_inbox/` and merge duplicates (structural moves). | You also trust the agent to *organize*, not just capture. Still reversible. |

Write is **opt-in at install time** — an agent can never enable or escalate its own scope. Every write is backed up and reversible (`cortex_undo`), sources under `Markdown/` are never touched, and an audit trail lands in `.cortex/mcp-writes.log`.

**Read tools (always on):**

| Tool | What the agent does with it |
|------|------------------------------|
| `cortex_query` | Ask a question → ranked, **cited** notes as JSON (id, title, path, excerpt, source). |
| `cortex_get_note` | Fetch a full note by id or path when the excerpt isn't enough. |

The server is long-running, so it loads the embedding model **once** and stays warm → fast semantic queries.

**Write/curate tools (added by `--write`):**

| Tool (scope) | What the agent does with it |
|------|------------------------------|
| `cortex_atomize_emit` (draft) | Get a source's distillation worksheet — **the agent itself distills** it. |
| `cortex_atomize_apply` (draft) | Write its distilled notes as `draft`s in `_inbox/`. Dry-run unless `write:true`. |
| `cortex_set_status` (draft) | Advance a note's lifecycle status. |
| `cortex_dupes` / `cortex_gaps` (draft) | Read companions — find merge candidates / thin spots. |
| `cortex_promote` (curate) | Graduate ready drafts out of `_inbox/` into curated folders. |
| `cortex_merge` (curate) | Fold a near-duplicate pair into one note, redirecting links. |
| `cortex_undo` (any write) | Reverse the latest write run — the escape hatch, never capped. |

```mermaid
flowchart LR
  A["🤖 Agent<br/>(Claude Code, …)"] -->|cortex_query / cortex_get_note| M["Cortex MCP server<br/>(stdio, warm model)"]
  M --> E["Cortex engine"]
  E --> V[("📁 your markdown vault")]
  E -.cited answer.-> A
  A -->|"✍️ atomize / promote / merge<br/>(--write, opt-in)"| W["capture / curate"]
  W -->|reversible| V
```

> Over **MCP** the loop is now **read *and* write**: agents consume the brain (default) and — when the human opts in with `--write` — capture and curate it back, every change reversible. The same write-back also runs autonomously via Cortex's Claude Code hooks. See [the roadmap](#-roadmap).

## How it works

Cortex is built on four pillars — **Atomize · Connect · Curate · AI Layer** — over one engine that feeds three surfaces (a CLI, a local viewer, and the MCP server):

```mermaid
flowchart TB
  V[("📁 Markdown vault<br/>notes · wikilinks · frontmatter")] --> ENG["⚙️ Cortex engine<br/>scan · graph · index · embed"]
  ENG --> G["🕸️ note graph"]
  ENG --> I["🔎 lexical index (TF-IDF)"]
  ENG --> EM["🧠 embeddings<br/>(optional, local)"]
  G --> S{{surfaces}}
  I --> S
  EM --> S
  S --> CLI["⌨️ CLI"]
  S --> VIZ["🌐 local viewer"]
  S --> MCP["🤖 MCP server"]
  CLI --> U["👤 you + 🤖 agents"]
  VIZ --> U
  MCP --> U
```

- **Atomize** — distill sources into small, single-idea notes (AI-assisted, dry-run by default, every write reversible).
- **Connect** — wikilinks + frontmatter become a typed graph; orphans and gaps surface automatically.
- **Curate** — diagnostics (`gaps`, `dupes`, `verify`) keep the brain healthy; `merge` folds duplicates into one note, reversibly.
- **AI Layer** — cited query (hybrid lexical + semantic), the MCP server, and a branded document generator.

## Commands

| Command | What it does |
|---------|--------------|
| `cortex init` | Detect frontmatter fields, write `.cortex.json`, gitignore the `.cortex/` cache. |
| `cortex new <type> <id>` | Scaffold a note from `_templates/<type>.md` in the right folder (`--title`/`--module`/`--dir`). |
| `cortex status` / `orphans` | Notes by type/status; dangling links ranked "atomize-next". |
| `cortex query "..."` | Cited answer from your notes (hybrid retrieval). `--json` (or the `/query` skill) for machine-readable output. |
| `cortex viz` | Local web viewer: interactive graph — search, color-by, animated focus, neighbor highlighting, and a bidirectional (in/out) link panel. |
| `cortex mcp install` | **One-command hookup** to Claude Code (`uninstall` to remove; `--write[=curate]` to register a writer). |
| `cortex mcp` | **Run the MCP server** for agents (stdio). Read-only by default; `--write[=draft\|curate]` exposes reversible capture/curation tools. |
| `cortex embed` | Build the local embedding store (enables semantic search). |
| `cortex atomize <src>` | AI-distill a source into draft notes (dry-run; `--write`). |
| `cortex gaps` / `dupes` / `verify` | Curation diagnostics. `dupes` compares within a type by default (`--cross-type` to widen); `verify --all` sweeps the whole vault for incomplete notes. |
| `cortex merge <keep> <drop>` | Fold a near-duplicate pair into one note, redirecting inbound links (via the `/dupes-merge` skill). Dry-run; `--write`, reversible. |
| `cortex moc` / `doc` | Generate a Map-of-Content note / a branded Typst PDF. |
| `cortex hook` · `pause` · `resume` | Claude Code autonomy hooks. With `autonomy: auto-draft`/`full`, the Stop hook captures changed sources into the graph **in the background** (reversible); `pause` is the kill switch. |
| `cortex undo` | Reverse the last write. Everything is reversible. |

## Semantic search (optional)

Lexical search works out of the box. For meaning-based search (synonyms, paraphrase, cross-language ES↔EN) the embedding model is an **opt-in peer** so the base install stays light:

```bash
npm i -g @xenova/transformers      # the local, on-device model — nothing leaves your machine
cortex embed                       # build the store once (incremental after that)
```

Then `cortex query` and `cortex dupes` become hybrid (lexical + semantic), and the MCP server keeps the model warm.

## 🔭 Where this is going

Cortex today is the **open-source, local engine** — free, yours, on your machine. It's the open core of a bigger idea:

- **A reliable brain for autonomous software.** As teams hand more work to agents, those agents need a *single source of truth* they can trust and cite. Cortex is that layer — the **brain of an agentic / autonomous software factory**, where many agents read from and (soon) write to one shared, verifiable knowledge base.
- **Local-first, always.** Cortex stays the open, on-your-machine engine — no vault content ever leaves your machine. The roadmap below is all Cortex; it grows by deepening the local engine and its agent loop, not by locking anything behind a service.

The path is incremental, so nothing gets thrown away on the way there.

## 🗺️ Roadmap

- ✅ **Engine + CLI** — graph, status, orphans, cited query, local viewer.
- ✅ **AI atomization** — AI-distilled notes, reversible writes, status-gated promotion.
- ✅ **Curation & outputs** — gaps/dupes/verify, MOC notes, branded PDFs.
- ✅ **Semantic layer** — local embeddings, hybrid query/dupes.
- ✅ **MCP server (read)** — `cortex_query` + `cortex_get_note` for agents.
- ✅ **Autonomous capture (hooks)** — the Stop hook distills changed sources into the graph in the background (`auto-draft`/`full`), reversible; plus reversible duplicate `merge`.
- ✅ **MCP write/curate** — `cortex mcp --write[=draft|curate]` exposes capture & curation as MCP tools so *any* agent writes back ("agent as curator"), read-only by default, every write reversible.

## From source (contributors)

```bash
git clone https://github.com/n1x-technologies/n1x-cortex.git
cd n1x-cortex/toolkit && npm install && npm run build
npm test
```

The engine lives in [`toolkit/`](toolkit/); design specs and plans are in [`docs/design/`](docs/design/). Contributions go through PRs — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE) © N1X Technologies. *"N1X" and "N1X Cortex" are trademarks of N1X Technologies.*
