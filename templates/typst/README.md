# Document template (Typst) — parameterizable by brand

Generates **consultancy-grade PDFs** (proposals, comparatives, reports) from Typst or from Markdown. **Generic:** anyone re-brands it with their own colors and logo. It ships no logos for any brand.

> **Philosophy (avoid the "auto-generated" look):** zero emojis · hierarchy through typography, weight and space (not color) · designed tables · a branded cover.

## Files

| File | What it is |
|---|---|
| `brand.typ` | **The only thing you edit to re-brand:** colors, logo, name, wordmark. |
| `template.typ` | The engine (styles, components, cover). Not edited when re-branding. |
| `example.typ` | Sample document showing every component. |
| `convert-md.py` | Converts existing Markdown to this look (via pandoc). |
| `assets/` | Where you put your logo (optional). See `assets/README.md`. |

## Requirements

- **Typst** (`typst --version`) — PDF rendering.
- **pandoc** — only if you convert from Markdown.
- Fonts: macOS ships Helvetica Neue. On Linux, install a metric-compatible alternative (e.g. Liberation Sans).

## Get started in 3 steps

1. **Copy this folder** into your project.
2. **Edit `brand.typ`** — set your colors, your name and (optionally) your logo in `assets/`.
3. **Write and compile:**

```bash
cp example.typ my-doc.typ        # start from the example
typst compile my-doc.typ my-doc.pdf
```

Minimal header of a document:

```typst
#import "template.typ": *
#show: doc.with(
  title: "Title", subtitle: "Subtitle",
  doc-label: "Proposal", client: "Client", date: "June 2026",
  lang: "en",   // "en" (default) or "es"
)
= First heading
Content...
```

## Language (en / es)

The PDF you generate can be in your own language. The `lang` option localizes the template's **chrome** — the cover labels (`FOR`, `DOCUMENT`, `DATE`, `CLASSIFICATION`, `PREPARED BY`, `VERSION`), the `For …` header, the default classification, the `yes`/`no` helpers, and hyphenation. Your document **body** is written in whatever language you want, independently.

```typst
#show: doc.with(title: "Título", doc-label: "Propuesta", client: "Cliente", date: "Junio 2026", lang: "es")
```

Ships with **`en`** (default) and **`es`**. To **add a language**, open `template.typ` and add an entry to `labels` with the same keys (e.g. `fr: ( yes: "Oui", cover-for: "POUR", … )`), then pass `lang: "fr"`. Nothing else changes.

## Components

`callout[..]` (note) · `dark-callout[..]` (key message) · `metric(value, label)` (in a `grid`) · `chk` (checkbox) · `yes` / `no`. Headings: `=` H1 (banner) · `==` H2 (bar) · `===` H3.

## Re-brand (brand.typ)

```typst
#let brand-name = "My Company"
#let wordmark   = "MY BRAND"            // cover if there is no logo
#let logo-light = "assets/logo-white.png"   // or none
#let logo-dark  = "assets/logo-black.png"    // or none
#let primary    = rgb("292929")         // your dark color
#let secondary  = rgb("E5E5E5")         // your light one
#let accent     = primary               // or an accent color
```

No logo → it uses the wordmark. With a logo → drop it in `assets/` (see `assets/README.md`).

## Convert existing Markdown

For long docs already written in `.md`, use `convert-md.py` (edit its `__main__`). It does the following: removes the title (the cover supplies it) · `> blockquotes` → callouts · unwraps tables so they **break across pages** · cleans out emojis (`⬜` → checkbox). Then `typst compile`.

## Check without opening the PDF

```bash
typst compile --pages 1 --ppi 110 my-doc.typ cover.png      # cover
typst compile --pages 5 --ppi 100 my-doc.typ interior.png   # an inner page
```

## Tips (don't repeat these mistakes)

- **Tables that don't break / an orphan header on an empty page:** pandoc wraps tables in `#figure`, which doesn't break; the script unwraps them. By hand, use `#table` directly.
- **Ugly hyphenation** (`exam-ple`, `data--driven`): the template already disables `hyphenate` and justification inside tables and metrics.
- **Disproportionate column:** force explicit `columns:` on that table.
