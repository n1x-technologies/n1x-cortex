# README Guide — N1X Cortex standard

What a good README looks like in N1X. The fillable template is in [`README.template.md`](README.template.md).

## Principles

1. **Understood in 30 seconds.** A centered header + tagline + badges → a human knows what it is and what state it's in without reading everything.
2. **Show, don't tell.** "Before/after" tables, mermaid diagrams (GitHub renders them natively), navigation tables. A diagram is worth more than three paragraphs.
3. **Navigable.** A table of contents plus an "If you want to… → start with" table that routes the reader to the right file.
4. **Honest about the state.** A status block showing what's done (✅) and what's pending. No vaporware.
5. **Close with branding.** A centered footer with © and attribution.

## Anatomy (sections in order)

| Section | What for | Mandatory? |
|---|---|---|
| Centered header + badges | What it is + status at a glance | ✅ |
| `> [!IMPORTANT]` | Clarify what the repo IS / is NOT | ✅ |
| Table of contents | Navigation | If the README is long |
| What is it? (+ before/after table) | The value | ✅ |
| Status | Verifiable progress | ✅ |
| Repository structure | Commented tree | ✅ |
| Architecture (mermaid + table) | Technical decisions | If applicable |
| How to start / navigate | Route the reader | ✅ |
| Next steps | What comes next | Recommended |
| License | Terms | ✅ |
| Centered footer | Branding + © | ✅ |

## Badges (shields.io)

Format: `![Label](https://img.shields.io/badge/label-value-COLOR)`. Spaces → `_`, hyphens → `--`. N1X brand colors: navy `1A1A2E`, coral `E94560`, or the project's primary color.

## Rules

- **Emojis in the README: OK.** GitHub renders them and they help with scanning. (Note: in **PDFs/documents** the rule is the opposite — zero emojis. See `templates/typst/`.)
- **Diagrams in mermaid**, not images (it's versioned, it's editable, GitHub renders it).
- **README kept up to date on every push** (N1X Cortex convention): if the push changes structure, files or decisions, the README is updated in the same push. An outdated README is a bug.

## Living references (examples of this standard)

- `n1x-cortex/README.md` — methodology repo (open source).
- `n1x-transport/README.md` — project/product (private).
