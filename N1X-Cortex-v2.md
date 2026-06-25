---
title: "N1X Cortex — AI-Assisted Knowledge Management Methodology"
author: "N1X Technologies"
version: "2.1"
date: "2026-06-25"
type: methodology
status: published
---

# N1X Cortex
## AI-Assisted Knowledge Management Methodology

**Author:** N1X Technologies  
**Version:** 2.1 · June 2026  
**© 2026 N1X Technologies — All rights reserved**

---

## 1. What is N1X Cortex

N1X Cortex is a methodology for turning large documentation corpora — technical, regulatory, strategic, legal, or operational — into **atomic knowledge graphs queryable by AI**, capable of generating precise answers, verifying compliance, and producing structured code or documents.

The core problem it solves: **monolithic documents don't scale**. A corpus of 50,000+ lines spread across dozens of files cannot be queried effectively by any AI system. Information fragments, context is lost, and generative code systems produce outputs that ignore the real constraints of the domain.

N1X Cortex converts that documentary mass into a **network of atomic nodes** — one note per concept, one note per rule, one note per flow — all interconnected with semantic links and tagged with structured frontmatter. The result is a "second brain" that:

- Answers complex questions citing the exact source
- Verifies whether a decision complies with the domain's rules
- Serves as precise context for an AI to generate compliant code

---

## 2. Who it applies to

N1X Cortex is applicable to any domain with **high documentary density and consistency requirements**:

| Domain | Type of corpus | What it produces |
|:---|:---|:---|
| **Regulatory / fintech** | Regulations, circulars, technical specifications | Verifiable compliance, standards-compliant code |
| **Legal / compliance** | Contracts, policies, regulatory frameworks | Fast queries, identification of obligations |
| **Strategic / product** | Research, market analysis, roadmaps | Informed decisions, product documents |
| **Technical / engineering** | APIs, specs, architectures, runbooks | Code generated with the correct context |
| **Operational** | Processes, procedures, manuals | Fast querying, flow automation |

The methodology is especially valuable when:
- The corpus exceeds 10,000 lines and does not fit in a single AI context
- The rules and data evolve frequently
- Traceability is needed: every answer must cite its source
- Multiple people or systems query the same knowledge

---

## 3. The 4 pillars

### Pillar 1 — Atomize

Split each source document into **minimal units of knowledge**. An atomic note contains exactly one idea: a concept, a rule, a flow, a message, an error code.

Atomicity criterion: *if the note covers two things that could change independently, it must be split in two.*

Each note carries:
- **YAML frontmatter** with type, ID, tags, status, and source
- **Body** with the information in structured natural language
- **Implications-for-implementation section** (in flow/process notes)
- **Source citation** at the bottom: file + page of origin

### Pillar 2 — Connect

Link each note to all related notes using **wikilinks** (`[[note-name]]`). Links are the connective tissue of the graph:

- A rule links to the flows that apply it
- A flow links to the messages it uses, the rules it complies with, and the errors it can generate
- A concept links to all the contexts where it appears

A link to a note that does not yet exist is valid — it marks future work without breaking the graph. This makes it possible to build the system incrementally.

### Pillar 3 — Curate

Maintain the quality of the graph over time:

- **MOC (Maps of Content):** thematic indexes that group notes by domain, generated as automatic tables with Dataview (Obsidian)
- **Glossary:** one note per domain term, with a canonical definition and aliases for equivalent terms
- **Duplicate merging:** when two notes represent the same concept, they are merged and aliases are added
- **Feedback loop:** every new learning (from meetings, implementations, regulatory changes) flows back to the brain as an updated note

### Pillar 4 — AI layer

The curated graph becomes the **precise context** for AI systems:

- Natural-language queries: the AI enters through the topic's MOC, navigates the links, and answers citing the notes
- Compliance verification: the AI follows the link tree from a flow to its rules and checks each one
- Code generation: the "Implications for implementation" section of each flow note is the requirements checklist the AI uses to generate code that already complies with the domain's constraints
- Document generation: strategic notes are consolidated into structured PDFs (see Section 6)

---

## 4. Vault structure

An N1X Cortex vault has the following generic structure, adaptable to any domain:

```
N1X-Cortex/
├── README.md              ← master plan and project status
├── CLAUDE.md              ← instructions for Claude Code (conventions)
├── HOME.md                ← dashboard / entry point
│
├── 00-MOC/                ← Maps of Content (indexes by topic)
├── 01-Concepts/           ← atomic glossary: one concept per note
├── 02-Flows/              ← processes and flows: one per note
├── 03-Rules/              ← rules and obligations: one per note
├── 04-Technical/          ← APIs, messages, specifications
├── 05-Errors/             ← catalog of error codes
├── 06-Security/           ← security guidelines
├── 07-UX/                 ← user experience
├── 08-MVPs/               ← implementation specifications
├── 09-Strategy/           ← market analysis, opportunities, competitive advantages
│
├── _templates/            ← note templates (copy when creating a new one)
└── Markdown/              ← original sources (DO NOT MODIFY — reference only)
```

The numbered folders are indicative. They are added or removed depending on the domain. What is invariant is the separation between **sources** (`Markdown/`) and **atomized knowledge** (everything else).

### Localization (language)

N1X Cortex is language-agnostic: the canonical reference is shown in English, but a team works in whatever language its project uses. The notes themselves are written in your language; you may also localize the folder names, tags, and frontmatter values. What matters is **consistency within a vault**, not which language you choose. Spanish equivalents, for example:

- **Folders:** `01-Concepts/`→`01-Conceptos/`, `02-Flows/`→`02-Flujos/`, `03-Rules/`→`03-Reglamentos/`, `04-Technical/`→`04-Tecnico/`, `05-Errors/`→`05-Errores/`, `06-Security/`→`06-Seguridad/`, `09-Strategy/`→`09-Estrategia/` (`00-MOC/`, `07-UX/`, `08-MVPs/` stay the same).
- **`type:` values:** `concept / flow / rule / technical / error / security / ux / mvp / strategy` → `concepto / flujo / regla / tecnico / error / seguridad / ux / mvp / estrategia`.
- **`status:` values:** `draft / documented / verified` → `borrador / documentado / verificado`.

The generated PDFs follow the same principle: choose the document language with `lang: "en"` or `lang: "es"` in the Typst template (see `templates/typst/`).

### Standard frontmatter

Each note carries minimal YAML frontmatter:

```yaml
---
type: flow             # concept | flow | rule | technical | error | security | ux | mvp | strategy
id: FLOW-EXAMPLE-01
tags: [flow, process, example]
source: "[[source-document-name]]"
status: documented     # draft | documented | verified
---
```

The `source` field points to the source's note in `Markdown/`. The `status` field makes it possible to track which notes are complete and which are drafts.

### Wikilinks and navigation

The `[[note-name]]` links are the API of the graph. In Obsidian they render as a visual graph of connections. In AI queries they are used as navigation instructions: "follow this link to obtain more context".

---

## 5. What it produces

A well-built N1X Cortex vault produces four types of outputs:

### Cited answers

Any question about the domain is answered with citations to the source notes:

> *"What is the applicable limit for an operation of type X?"*  
> → The AI enters through `00-MOC/MOC-Rules.md`, locates the applicable rule, reads the note, answers with the exact value, and cites `[[RULE-NNN-Operation-limit]]` as the source.

### Compliance verification

For any flow or process, the AI can verify whether it complies with all the rules that apply:

> *"Does this authentication screen design comply with the guidelines?"*  
> → The AI navigates from `07-UX/` to `03-Rules/` following the links, and produces a checklist with each rule and its status (complies / does not comply / pending).

### Compliant code

The **"Implications for implementation"** section in each flow note lists the technical requirements the code must meet. The AI uses that section + the links to messages, rules, and errors to generate code that already meets the domain's specifications.

### Structured documents

Strategic and analysis notes are consolidated into PDF documents through the generation pipeline described in Section 6.

---

## 6. Document generation pipeline

N1X Cortex includes a pipeline for converting accumulated knowledge into **deliverable PDF documents** — with consistent visual identity, authorship attribution, and traceability to the source notes. This is a reproducible method, not an ad-hoc design per document.

### Guiding principle

The **markdown is the source of truth**; the PDF is a derived output. The PDF is never written by hand: it is compiled from a typography file (`.typ`) that reflects the markdown. If the content changes, change the markdown first, then regenerate. This preserves the same principle of immutability and traceability that governs the vault.

### Stack

| Tool | What for | When |
|:---|:---|:---|
| **Typst** (0.14+) | Typography engine → PDF (10× faster than LaTeX, CSS-like syntax) | **Default** pipeline |
| **Python 3 + matplotlib** | PNG charts to embed (brand palette, ≥180 DPI) | Only if the document carries charts |
| **HTML + Chrome headless** | Alternative for very visual documents / covers with gradients | When you prefer to lay out with CSS |

> The default engine is **Typst** for speed and reproducibility. The HTML→PDF path (`--headless --print-to-pdf`) is a valid alternative when the design relies on CSS; it produces the same type of deliverable with a different tool.

### 5-step flow

1. **Consolidate** — the atomic notes from the thematic folder (`09-Strategy/`, `02-Flows/`, etc.) are gathered into a structured markdown, **preserving the source citations**.
2. **Chart** (optional) — the PNGs are generated with Python/matplotlib in the brand palette, exported to `/tmp/` with **relative** paths (Typst prepends the directory of the `.typ`).
3. **Lay out** — the `.typ` is written: color tokens, reusable components, cover, table of contents, sections, header, and footer.
4. **Compile and verify** — `typst compile doc.typ doc.pdf` and it is **reviewed visually in Preview** (cover, pagination, tables, code blocks) before publishing.
5. **Publish and version** — `.typ` and `.pdf` are copied to the final directory; **previous versions are preserved** (`-v1`, `-v2`, …), never overwritten.

```bash
# Compile (Typst) and review
typst compile /tmp/doc.typ /tmp/doc-v2.pdf && open /tmp/doc-v2.pdf

# HTML → PDF alternative (Chrome headless)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="doc.pdf" "file:///path/doc.html"
```

### Anatomy of the document

Every N1X Cortex deliverable follows the same structure: **cover** (title, version, date, "PREPARED BY") → **table of contents** → **numbered sections** with H1/H2/H3 headings of consistent style → **footer** with automatic numbering → **final note** of authorship. The layout uses A4, generous margins, and `page-break` between major blocks.

### Tokens and visual identity

The palette is declared as variables at the start of the `.typ`. **Brand separation rule:** a deliverable of the *N1X Cortex methodology* uses N1X Cortex's own palette (navy/coral); a deliverable of a *client project* uses that client's palette. **They are never mixed.**

```typst
// N1X Cortex palette (methodology — N1X Technologies)
#let sd-navy  = rgb("1A1A2E")   #let sd-coral = rgb("E94560")
#let sd-mid   = rgb("4A4A6A")   #let sd-light = rgb("F5F5F5")
```

### Reusable components

The pipeline defines Typst components that are copied unmodified between documents in the same series:
- `callout()` — insight box with a colored left border
- `coral-callout()` — warning/important-note box
- `hero-box()` — main highlight box (solid background, white text)
- `pillar-box()` — thematic box with an accent top border
- H1/H2/H3 heading styles and header/footer with automatic numbering

### Attribution — fixed rule

Every generated document carries attribution in **three places**:
1. **Cover** — "PREPARED BY" field with N1X Technologies
2. **Footer of each page** — N1X Technologies + © + year
3. **Final note** — full authorship note with © and distribution restrictions

The attribution always goes to N1X Technologies and the © is updated to the current year.

### Reproducibility

The detailed operating procedure — exact commands, the vN→vN+1 versioning flow, the pre-publish checklist, and common Typst errors with their solution — is kept in an accompanying process document alongside the vault or the document (e.g., `UPDATE-PROCESS-*.md`). That document is what guarantees that any AI instance can regenerate the deliverable identically.

---

## 7. Design principles

**Fidelity over completeness.** Never invent data, rules, or steps. If the source doesn't say it, it isn't asserted. Whatever requires verification is marked as `status: draft`.

**Atomicity.** One idea per note. If a note grows to cover two concepts that could change independently, it is split in two.

**Mandatory citation.** Every note cites its source at the bottom: source file and page number. Without a source, the note is not finished.

**Liberal linking.** Links are made even when the destination note does not yet exist. An orphan link is a valid marker of future work, not an error. The graph grows incrementally.

**Immutability of sources.** The files in `Markdown/` are sacred — they are never modified. They are the immutable source of truth. All the atomization and curation work happens in the numbered folders.

**Living cycle.** The brain is not built only once. Every time something new is learned — in a meeting, while implementing code, when receiving a new version of a document — that knowledge flows back to the brain as a new note or an update.

**Incremental scale.** It is not necessary to atomize the entire corpus before using the system. You can start with the most critical flow or domain and expand on-demand, when you need to query something that is not yet atomized.

---

## 8. Application case (illustrative)

By way of a **hypothetical** example — corresponding to no client or real project — consider the application of N1X Cortex to an integration project in a regulated sector with high documentary density, whose corpus includes:

- Tens of thousands of lines of technical and regulatory documentation (API specifications, regulations, UX and cybersecurity guidelines, error catalogs)
- A series of functional workshops documenting process flows
- Strategic market analysis with a set of identified opportunities

The resulting vault would contain **several hundred atomic notes** organized into thematic folders, with a graph of thousands of connections. It would make it possible to answer complex questions about regulatory compliance, generate code that already meets the technical specifications, and produce structured strategic documents.

A case like this validates the methodology at its most demanding scale: a multidimensional corpus (technical + regulatory + strategic), multiple versions of documents, and the need for complete traceability between each line of code and the rule that justifies it.

The methodology is applicable to any project with similar characteristics — it is not specific to any sector or country.

---

## 9. Authorship and IP

**N1X Cortex** is an original methodology developed by **N1X Technologies**.

The name, the four-pillar structure, the document generation pipeline, the atomization patterns, and the design components are the intellectual property of N1X Technologies.

**Applications of the methodology** are instances of use — the generated vault belongs to the context of each project, but the methodology itself belongs to its creator.

---

*© 2026 N1X Technologies — All rights reserved.*
