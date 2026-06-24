---
title: "Update Process — N1X Cortex"
description: "How to maintain, version, and generate the PDF of the N1X Cortex methodology document"
date: "2026-06-23"
author: "N1X Technologies"
tools: [typst]
---

# Update Process — N1X Cortex

This document explains how to maintain and version the N1X Cortex methodology document (`N1X-Cortex-v*.md` and its corresponding PDF). For any instance of Claude Code or for future use.

> **Brand note:** the methodology was first published as **BRAIN** (v1); since v2.0 it is **N1X Cortex** (attribution **N1X Technologies**). Old versions live in git history, not in the tree.

---

## What this document is and where it lives

The N1X Cortex methodology document describes the AI-assisted knowledge management methodology, owned by N1X Technologies. It is an artifact independent of any project where N1X Cortex is applied.

```
n1x-cortex/   (git repo — latest version only)
├── N1X-Cortex-v2.md             ← current source of truth (markdown)
├── N1X-Cortex-v2.typ            ← Typst source (compile to PDF; PDFs are git-ignored)
└── UPDATE-PROCESS.md   ← this file
```

> **In the git repo, PDFs are git-ignored** (generated on demand from the `.typ`, not committed). The `.md`/`.typ` are the source of truth; compile a PDF when you need to read or share one. The external archive above may keep versioned PDFs.

---

## Generation stack

| Tool | Version | What for |
|:---|:---:|:---|
| **Typst** | 0.14.2+ | Typesetting engine → PDF |

Python/matplotlib is not needed for this document — it has no external charts, the entire design is pure Typst.

---

## N1X Cortex color palette (proprietary, independent of projects)

This palette identifies the N1X Cortex methodology as a product of N1X Technologies. **Do not mix it with the palette of any client project.**

```typst
#let sd-navy    = rgb("1A1A2E")   // Primary navy
#let sd-coral   = rgb("E94560")   // Coral accent
#let sd-mid     = rgb("4A4A6A")   // Neutral blue-gray
#let sd-light   = rgb("F5F5F5")   // Light background
#let sd-divider = rgb("D0D0E0")   // Dividers
#let bg-insight = rgb("EEF0FF")   // Blue callout background
#let bg-warn    = rgb("FFF0F0")   // Coral callout background
#let row-alt    = rgb("F0F0F8")   // Alternating rows
```

> The `sd-*` variable names are internal to the `.typ` (not visible in the PDF) and are kept for compatibility across versions.

---

## Document structure (9 sections)

| # | Section | What it contains |
|:---:|:---|:---|
| 01 | What N1X Cortex is | Definition, the problem it solves |
| 02 | Who it applies to | Table of domains and use cases |
| 03 | The 4 pillars | Atomize · Connect · Curate · AI Layer |
| 04 | Vault structure | Generic folders, frontmatter, wikilinks |
| 05 | What it produces | 4 types of output |
| 06 | Document pipeline | Typst + matplotlib, generation flow |
| 07 | Design principles | 7 principles explained |
| 08 | Application case | Hypothetical illustrative example (no real clients) |
| 09 | Authorship and IP | © N1X Technologies |

---

## When to update

Update the document when:

- [ ] A new pillar or principle is added to the methodology
- [ ] The standard vault structure changes
- [ ] A new tool is incorporated into the stack (e.g. a new PDF engine)
- [ ] There is a new application case worth mentioning
- [ ] There is a change in attribution

**Do not update** for:
- Changes specific to a client project (those belong in the project vault)
- Technical implementation details of a particular MVP
- Market data or strategy of a client

---

## Flow to create a new version (vN → vN+1)

### 1. Update the source markdown

```bash
# The markdown is the source of truth — edit it first
nano "~/Documents/0. WSDC Tech/BRAIN-Metodologia/N1X-Cortex-v2.md"
```

Update the `version:` field in the frontmatter and the date.

### 2. Update the Typst file

The `.typ` mirrors the `.md` but with Typst markup. Update both in parallel:
- The version in the header: `N1X Technologies · v2.0 · June 2026` → new version/date
- The version on the cover: `#text(size: 10.5pt, fill: sd-navy)[2.0 · June 2026]`
- The final footer: `N1X Cortex v2.0 · June 2026` → new version
- Any content that has changed

### 3. Compile

```bash
# Compile (the .typ can be in /tmp/ or the final folder)
typst compile /tmp/N1X-Cortex.typ /tmp/N1X-Cortex-v3.pdf

# Review in Preview
open /tmp/N1X-Cortex-v3.pdf

# Copy to the final directory
cp /tmp/N1X-Cortex.typ \
  "~/Documents/0. WSDC Tech/BRAIN-Metodologia/N1X-Cortex-v3.typ"
cp /tmp/N1X-Cortex-v3.pdf \
  "~/Documents/0. WSDC Tech/BRAIN-Metodologia/N1X-Cortex-v3.pdf"
```

### 4. Keep only the latest version

The repo holds **only the current version**. Older versions are preserved in **git history** (`git log -- N1X-Cortex-*.md`), not as files cluttering the tree. When you publish vN+1, the previous vN files are replaced in the tree — git remembers them.

---

## Attribution — Fixed rule across all versions

The N1X Cortex document always carries N1X Technologies attribution in three places:

### 1. Cover — PREPARED BY field
```typst
#text(size: 8pt, fill: sd-mid, weight: "bold")[PREPARED BY]\
#text(size: 10.5pt, fill: sd-navy)[N1X Technologies]
```

### 2. Footer of each page
```typst
#text(size: 8pt, fill: sd-mid)[N1X Cortex · by N1X Technologies · © 2026]
```

### 3. Final footer of the document
```typst
Prepared by *N1X Technologies* · N1X Cortex v2.0 · June 2026 \
© 2026 N1X Technologies — All rights reserved
```

**Rules:**
- Attribution always goes to **N1X Technologies** — no personal names.
- **No contact email** in the document.
- N1X Cortex is property of N1X Technologies — not of any project or client.
- The © appears in all versions, updating the year as needed.

---

## Reusable Typst components

Copy these into any new version without modifying them:

```typst
// Insight box (left navy border)
#let callout(body) = block(
  fill: bg-insight,
  stroke: (left: 4pt + sd-navy),
  inset: (x: 14pt, y: 11pt),
  width: 100%,
  radius: (top-right: 4pt, bottom-right: 4pt),
)[#body]

// Warning box (left coral border)
#let coral-callout(body) = block(
  fill: bg-warn,
  stroke: (left: 4pt + sd-coral),
  inset: (x: 14pt, y: 11pt),
  width: 100%,
  radius: (top-right: 4pt, bottom-right: 4pt),
)[#body]

// Hero box (navy background, white text)
#let hero-box(body) = block(
  fill: sd-navy,
  inset: (x: 16pt, y: 14pt),
  width: 100%,
  radius: 4pt,
)[#text(fill: white)[#body]]

// Pillar box (top coral border, light gray background)
#let pillar-box(num, title, body) = block(
  fill: sd-light,
  stroke: (top: 3pt + sd-coral, left: none, right: none, bottom: none),
  inset: (x: 14pt, y: 12pt),
  width: 100%,
  radius: (bottom-left: 4pt, bottom-right: 4pt),
)[
  #text(fill: sd-coral, weight: "bold", size: 11pt)[#num] #h(6pt) #text(fill: sd-navy, weight: "bold", size: 11pt)[#title]
  #v(6pt)
  #body
]
```

---

## Checklist before publishing a new version

- [ ] The .md frontmatter has the version and date updated
- [ ] The .typ reflects all the changes from the .md
- [ ] Correct version and date on the cover, header, and final footer of the .typ
- [ ] Attribution: "N1X Technologies" in all 3 places (cover, footer, footer line); no personal name or email
- [ ] PDF compiled without errors (font warnings are acceptable)
- [ ] PDF visually reviewed in Preview: cover, pagination, tables, code blocks
- [ ] Old version left in git history (replaced in the tree, not accumulated)
- [ ] Section 08 (Application case) does not reveal confidential client information

---

## Common Typst errors and how to resolve them

| Error | Cause | Solution |
|:---|:---|:---|
| `unclosed delimiter` in `_templates` | `_` activates emphasis mode in markup | Escape: `\_templates` |
| `expected expression` with `#` in a comment | `#` starts code in markup | Escape: `\#` |
| Doubled image paths (`/tmp/tmp/...`) | Typst prepends the directory of the `.typ` | Use relative paths, not absolute |
| `counter(page)` without context | Requires a `#context` block | `#context text(...)[#counter(page).display()]` |
| Font "liberation sans" not found | Linux font, not available on macOS | Benign warning — use the "Arial" fallback |

---

*Document created on June 3, 2026 (under the previous name BRAIN). Rebranded to N1X Cortex on June 23, 2026. Update with each new version of the methodology.*
