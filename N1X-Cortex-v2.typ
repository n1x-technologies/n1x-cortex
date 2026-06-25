// ─────────────────────────────────────────────────────────────────────────────
// N1X Cortex — AI-Assisted Knowledge Management Methodology
// © 2026 N1X Technologies
// Independent palette: navy + coral (NOT Intercorp)
// ─────────────────────────────────────────────────────────────────────────────

// ── Own color palette ──────────────────────────────────────────────────────────
#let sd-navy    = rgb("1A1A2E")   // Primary navy
#let sd-coral   = rgb("E94560")   // Coral accent
#let sd-mid     = rgb("4A4A6A")   // Neutral blue-gray
#let sd-light   = rgb("F5F5F5")   // Light background
#let sd-white   = rgb("FFFFFF")
#let sd-divider = rgb("D0D0E0")
#let ok-green   = rgb("1B7A3E")
#let row-alt    = rgb("F0F0F8")
#let bg-insight = rgb("EEF0FF")
#let bg-warn    = rgb("FFF0F0")

// ── Reusable components ─────────────────────────────────────────────────────────
#let callout(body) = block(
  fill: bg-insight,
  stroke: (left: 4pt + sd-navy),
  inset: (x: 14pt, y: 11pt),
  width: 100%,
  radius: (top-right: 4pt, bottom-right: 4pt),
)[#body]

#let coral-callout(body) = block(
  fill: bg-warn,
  stroke: (left: 4pt + sd-coral),
  inset: (x: 14pt, y: 11pt),
  width: 100%,
  radius: (top-right: 4pt, bottom-right: 4pt),
)[#body]

#let hero-box(body) = block(
  fill: sd-navy,
  inset: (x: 16pt, y: 14pt),
  width: 100%,
  radius: 4pt,
)[#text(fill: white)[#body]]

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

// ── Table styles ────────────────────────────────────────────────────────────────
#set table(
  stroke: (col, row) => (
    top: if row == 0 { none } else { 0.5pt + sd-divider },
    bottom: 0.5pt + sd-divider,
    left: none, right: none,
  ),
  fill: (col, row) => (
    if row == 0 { sd-navy }
    else if calc.odd(row) { row-alt }
    else { white }
  ),
  inset: (x: 8pt, y: 6pt),
)
#show table.cell.where(y: 0): it => text(fill: white, weight: "bold", size: 9.5pt)[#it]

// ── Heading styles ──────────────────────────────────────────────────────────────
#show heading.where(level: 1): it => {
  pagebreak(weak: true)
  v(0.4em)
  block(fill: sd-navy, width: 100%, inset: (x: 12pt, y: 10pt), radius: 4pt)[
    #set text(fill: white, weight: "bold", size: 15pt)
    #it
  ]
  v(0.8em)
}

#show heading.where(level: 2): it => {
  v(1em)
  grid(columns: (5pt, 1fr), gutter: 9pt,
    block(fill: sd-coral, width: 5pt, height: 1.7em),
    align(horizon)[#text(fill: sd-navy, weight: "bold", size: 12.5pt)[#it.body]],
  )
  v(0.35em)
}

#show heading.where(level: 3): it => {
  v(0.8em)
  text(fill: sd-mid, weight: "bold", size: 11pt)[#it.body]
  v(0.2em)
}

// ── Page configuration ──────────────────────────────────────────────────────────
#set text(font: ("Helvetica Neue", "Arial", "Liberation Sans"), size: 10.5pt, fill: sd-navy)
#set par(leading: 0.72em, justify: true)

#set page(
  paper: "a4",
  margin: (top: 3cm, bottom: 3cm, left: 2.8cm, right: 2.8cm),
  header: [
    #set text(size: 8.5pt)
    #grid(columns: (1fr, auto))[
      #text(fill: sd-navy, weight: "bold")[N1X Cortex — Knowledge Management Methodology]
    ][
      #text(fill: sd-mid)[N1X Technologies · v2.1 · June 2026]
    ]
    #v(-4pt)
    #line(length: 100%, stroke: 1.2pt + sd-navy)
  ],
  footer: [
    #line(length: 100%, stroke: 0.5pt + sd-divider)
    #v(-4pt)
    #grid(columns: (1fr, auto))[
      #text(size: 8pt, fill: sd-mid)[N1X Cortex · by N1X Technologies · © 2026]
    ][
      #context text(size: 8pt, fill: sd-mid)[Page #counter(page).display()]
    ]
  ],
  numbering: "1",
)

// ═════════════════════════════════════════════════════════════════════════════
// COVER
// ═════════════════════════════════════════════════════════════════════════════
#page(margin: 0pt, header: none, footer: none, numbering: none)[
  // Top navy block
  #block(fill: sd-navy, width: 100%, height: 11.5cm,
    inset: (x: 3cm, top: 3.5cm, bottom: 1.5cm),
  )[
    #align(bottom + left)[
      #text(fill: sd-coral, size: 9.5pt, weight: "bold", tracking: 3.5pt)[
        KNOWLEDGE MANAGEMENT METHODOLOGY
      ]
      #v(0.9em)
      #text(fill: white, size: 52pt, weight: "black")[
        N1X Cortex
      ]
      #v(0.5em)
      #text(fill: sd-divider, size: 13pt, weight: "light")[
        Knowledge Management Methodology\
        Assisted by Artificial Intelligence
      ]
    ]
  ]
  // Coral stripe
  #block(fill: sd-coral, width: 100%, height: 7pt)
  // White body
  #block(fill: white, width: 100%, inset: (x: 3cm, top: 2.5cm, bottom: 2cm))[
    #text(fill: sd-mid, size: 11pt)[
      Turns large corpora of technical, regulatory, or strategic documentation\
      into atomic knowledge graphs queryable by AI — with full traceability,\
      verifiable compliance, and compliant code generation.
    ]
    #v(2cm)
    #grid(columns: (1fr, 1fr, 1fr), gutter: 20pt)[
      #text(size: 8pt, fill: sd-mid, weight: "bold")[PREPARED BY]\
      #text(size: 10.5pt, fill: sd-navy)[N1X Technologies]
    ][
      #text(size: 8pt, fill: sd-mid, weight: "bold")[VERSION]\
      #text(size: 10.5pt, fill: sd-navy)[2.1 · June 2026]
    ][
      #text(size: 8pt, fill: sd-mid, weight: "bold")[STATUS]\
      #text(size: 10.5pt, fill: ok-green, weight: "bold")[Published]
    ]
    #v(1.5cm)
    #line(length: 100%, stroke: 0.5pt + sd-divider)
    #v(0.5cm)
    #text(size: 8pt, fill: sd-mid)[© 2026 N1X Technologies — All rights reserved]
  ]
]

// ═════════════════════════════════════════════════════════════════════════════
// TABLE OF CONTENTS
// ═════════════════════════════════════════════════════════════════════════════
#page[
  #v(0.5em)
  #block(fill: sd-navy, width: 100%, inset: (x: 12pt, y: 10pt), radius: 4pt)[
    #set text(fill: white, weight: "bold", size: 15pt)
    Table of Contents
  ]
  #v(1.2em)

  #set text(size: 10.5pt)

  #let toc-item(num, title, desc) = {
    grid(columns: (2.5em, 1fr),
      text(fill: sd-coral, weight: "bold")[#num],
      [
        #text(fill: sd-navy, weight: "bold")[#title] \
        #text(fill: sd-mid, size: 9.5pt)[#desc]
      ]
    )
    v(0.8em)
  }

  #toc-item("01", "What is N1X Cortex", "Definition, the problem it solves")
  #toc-item("02", "Who it applies to", "Domains: regulatory, technical, strategic, legal, operational")
  #toc-item("03", "The 4 pillars", "Atomize · Connect · Curate · AI Layer")
  #toc-item("04", "Vault structure", "Folders, frontmatter, wikilinks, MOCs")
  #toc-item("05", "What it produces", "Answers, compliance, compliant code, PDF documents")
  #toc-item("06", "Document generation pipeline", "matplotlib + Typst + attribution")
  #toc-item("07", "Design principles", "Fidelity, atomicity, citation, liberal linking")
  #toc-item("08", "Application case", "Hypothetical illustrative example")
  #toc-item("09", "Authorship and IP", "© 2026 N1X Technologies")
]

// ═════════════════════════════════════════════════════════════════════════════
// 01 — WHAT IS N1X CORTEX
// ═════════════════════════════════════════════════════════════════════════════
= 01 — What is N1X Cortex

#hero-box[
  *N1X Cortex* is a methodology for turning large documentation corpora — technical, regulatory, strategic, legal, or operational — into *atomic knowledge graphs queryable by AI*, capable of generating precise answers, verifying compliance, and producing structured code or documents.
]

#v(1em)

== The problem

Monolithic documents do not scale for AI-assisted work.

A corpus of 50,000+ lines spread across dozens of files presents three fundamental problems:

#table(
  columns: (auto, 1fr),
  table.header([Problem], [Consequence]),
  [*Context exceeds the AI window*], [The system cannot read the entire corpus at once; it generates answers without complete context],
  [*No semantic structure*], [The AI cannot reason about relationships between rules, flows, and errors],
  [*No traceability*], [There is no way to verify where each statement or decision comes from],
)

#v(0.8em)

== The solution

#callout[
  N1X Cortex turns that documentary mass into a *network of atomic nodes*: one note per concept, one note per rule, one note per flow. All interconnected with semantic links and tagged with structured frontmatter.
]

The result is a "second brain" that:

- Answers complex questions *citing the exact source*
- Verifies whether a decision *complies with the domain's rules*
- Serves as precise context so that an AI can *generate compliant code*
- Produces *structured documents* consolidating accumulated knowledge

// ═════════════════════════════════════════════════════════════════════════════
// 02 — WHO IT APPLIES TO
// ═════════════════════════════════════════════════════════════════════════════
= 02 — Who it applies to

N1X Cortex is applicable to any domain with *high documentary density and consistency requirements*:

#v(0.5em)

#table(
  columns: (auto, 1fr, 1fr),
  table.header([Domain], [Type of corpus], [What it produces]),
  [*Regulatory / fintech*], [Regulations, circulars, technical specifications], [Verifiable compliance, code conforming to regulation],
  [*Legal / compliance*], [Contracts, policies, regulatory frameworks], [Quick queries, identification of obligations],
  [*Strategic / product*], [Research, market analysis, roadmaps], [Informed decisions, product documents],
  [*Technical / engineering*], [APIs, specs, architectures, runbooks], [Code generated with the correct context],
  [*Operational*], [Processes, procedures, manuals], [Quick consultation, workflow automation],
)

#v(1em)

== When it is most valuable

The methodology is especially valuable when one or more of these criteria are met:

#coral-callout[
  - The corpus exceeds *10,000 lines* and does not fit in a single AI context
  - Rules and data *evolve frequently* (versions, regulatory updates)
  - *Traceability* is needed: every answer must cite its source
  - *Multiple people or systems* consult the same knowledge
  - It is required to generate *code or documents* that reflect the domain's rules
]

// ═════════════════════════════════════════════════════════════════════════════
// 03 — THE 4 PILLARS
// ═════════════════════════════════════════════════════════════════════════════
= 03 — The 4 pillars

#v(0.3em)

#pillar-box("01", "Atomize")[
  Split each source document into *minimal units of knowledge*. An atomic note contains exactly one idea: a concept, a rule, a flow, a message, an error code.

  *Atomicity criterion:* if the note deals with two things that could change independently, it must be split into two.

  Each note carries: YAML frontmatter with type, ID, tags, and status · structured body in natural language · implementation implications section (for flows and processes) · source citation at the foot with origin file and page.
]

#v(0.8em)

#pillar-box("02", "Connect")[
  Link each note to all related notes using *wikilinks* (`[[note-name]]`). Links are the connective tissue of the graph:

  - A rule links to the flows that apply it
  - A flow links to the messages it uses, the rules it complies with, and the possible errors
  - A concept links to all the contexts where it appears

  A link to a note that does not yet exist is *valid* — it marks future work without breaking the graph. This allows the system to be built incrementally.
]

#v(0.8em)

#pillar-box("03", "Curate")[
  Maintain the quality of the graph over time:

  - *MOC (Maps of Content):* thematic indexes that group notes by domain
  - *Glossary:* one note per domain term, with a canonical definition and aliases for equivalent terms
  - *Duplicate merging:* when two notes represent the same concept, they are merged with aliases
  - *Feedback loop:* every new learning returns to the brain as a new note or update
]

#v(0.8em)

#pillar-box("04", "AI Layer")[
  The curated graph becomes the *precise context* for AI systems:

  - *Natural language queries:* the AI navigates the links and answers by citing the notes
  - *Compliance verification:* the AI follows the link tree from a flow to its rules
  - *Code generation:* the "Implementation implications" section of each note is the requirements checklist
  - *Document generation:* strategic notes are consolidated into structured PDFs
]

// ═════════════════════════════════════════════════════════════════════════════
// 04 — VAULT STRUCTURE
// ═════════════════════════════════════════════════════════════════════════════
= 04 — Vault structure

An N1X Cortex vault has the following generic structure, adaptable to any domain:

#v(0.5em)

#block(
  fill: rgb("0D1117"),
  inset: (x: 16pt, y: 14pt),
  width: 100%,
  radius: 6pt,
)[
  #set text(font: ("Courier New", "Monaco", "Menlo"), size: 9pt, fill: rgb("E6EDF3"))
  #text(fill: sd-coral)[N1X-Cortex/]\
  #text(fill: rgb("7EE787"))[├── README.md]            #h(2em) #text(fill: rgb("8B949E"))[← master plan and status]\
  #text(fill: rgb("7EE787"))[├── CLAUDE.md]             #h(2em) #text(fill: rgb("8B949E"))[← conventions for AI]\
  #text(fill: rgb("7EE787"))[├── HOME.md]               #h(2em) #text(fill: rgb("8B949E"))[← dashboard / entry point]\
  #text(fill: rgb("79C0FF"))[│]\
  #text(fill: rgb("79C0FF"))[├── 00-MOC/]               #h(2em) #text(fill: rgb("8B949E"))[← thematic indexes]\
  #text(fill: rgb("79C0FF"))[├── 01-Concepts/]          #h(2em) #text(fill: rgb("8B949E"))[← atomic glossary]\
  #text(fill: rgb("79C0FF"))[├── 02-Flows/]             #h(2em) #text(fill: rgb("8B949E"))[← processes and flows]\
  #text(fill: rgb("79C0FF"))[├── 03-Rules/]             #h(2em) #text(fill: rgb("8B949E"))[← rules and obligations]\
  #text(fill: rgb("79C0FF"))[├── 04-Technical/]         #h(2em) #text(fill: rgb("8B949E"))[← APIs, messages, specs]\
  #text(fill: rgb("79C0FF"))[├── 05-Errors/]            #h(2em) #text(fill: rgb("8B949E"))[← error catalog]\
  #text(fill: rgb("79C0FF"))[├── 06-Security/]          #h(2em) #text(fill: rgb("8B949E"))[← security guidelines]\
  #text(fill: rgb("79C0FF"))[├── 07-UX/]                #h(2em) #text(fill: rgb("8B949E"))[← user experience]\
  #text(fill: rgb("79C0FF"))[├── 08-MVPs/]              #h(2em) #text(fill: rgb("8B949E"))[← code specifications]\
  #text(fill: rgb("79C0FF"))[├── 09-Strategy/]          #h(2em) #text(fill: rgb("8B949E"))[← analysis and opportunities]\
  #text(fill: rgb("79C0FF"))[│]\
  #text(fill: rgb("79C0FF"))[├── \_templates/]           #h(2em) #text(fill: rgb("8B949E"))[← note templates]\
  #text(fill: rgb("79C0FF"))[└── Markdown/]             #h(2em) #text(fill: rgb("8B949E"))[← original sources (DO NOT MODIFY)]
]

#v(1em)

== Localization (language)

N1X Cortex is language-agnostic: the canonical reference is shown in English, but a team works in whatever language its project uses. The notes themselves are written in your language; you may also localize the folder names, tags, and frontmatter values. What matters is *consistency within a vault*, not which language you choose. Spanish equivalents, for example:

- *Folders:* `01-Concepts/`→`01-Conceptos/`, `02-Flows/`→`02-Flujos/`, `03-Rules/`→`03-Reglamentos/`, `04-Technical/`→`04-Tecnico/`, `05-Errors/`→`05-Errores/`, `06-Security/`→`06-Seguridad/`, `09-Strategy/`→`09-Estrategia/` (`00-MOC/`, `07-UX/`, `08-MVPs/` stay the same).
- *`type:` values:* concept / flow / rule / technical / error / security / ux / mvp / strategy → concepto / flujo / regla / tecnico / error / seguridad / ux / mvp / estrategia.
- *`status:` values:* draft / documented / verified → borrador / documentado / verificado.

The generated PDFs follow the same principle: choose the document language with `lang: "en"` or `lang: "es"` in the Typst template (see `templates/typst/`).

#v(1em)

== Standard frontmatter

Each note carries minimal YAML frontmatter:

#block(
  fill: rgb("0D1117"),
  inset: (x: 16pt, y: 14pt),
  width: 100%,
  radius: 6pt,
)[
  #set text(font: ("Courier New", "Monaco", "Menlo"), size: 9.5pt, fill: rgb("E6EDF3"))
  #text(fill: rgb("8B949E"))[---]\
  #text(fill: rgb("79C0FF"))[type:] #text(fill: rgb("A5D6FF"))[flow]        #h(2em) #text(fill: rgb("8B949E"))[\# concept | flow | rule | technical | strategy]\
  #text(fill: rgb("79C0FF"))[id:] #text(fill: rgb("A5D6FF"))[FLOW-EXAMPLE-01]\
  #text(fill: rgb("79C0FF"))[tags:] #text(fill: rgb("A5D6FF"))[#[flow, process, example]]\
  #text(fill: rgb("79C0FF"))[source:] #text(fill: rgb("A5D6FF"))["[[source-document-name]]"]\
  #text(fill: rgb("79C0FF"))[status:] #text(fill: rgb("A5D6FF"))[documented]  #h(2em) #text(fill: rgb("8B949E"))[\# draft | documented | verified]\
  #text(fill: rgb("8B949E"))[---]
]

// ═════════════════════════════════════════════════════════════════════════════
// 05 — WHAT IT PRODUCES
// ═════════════════════════════════════════════════════════════════════════════
= 05 — What it produces

A well-built N1X Cortex vault produces four types of outputs:

#v(0.5em)

#grid(columns: (1fr, 1fr), gutter: 14pt)[
  #block(fill: sd-light, stroke: (top: 3pt + sd-coral), inset: (x: 12pt, y: 12pt), radius: 4pt, height: auto)[
    #text(fill: sd-coral, weight: "bold", size: 10pt)[01 — Cited answers]
    #v(6pt)
    #text(size: 9.5pt)[Any question about the domain is answered with citations to the source notes. The AI enters through the topic's MOC, navigates the links, answers with the exact fact, and cites the note as the source.]
  ]
][
  #block(fill: sd-light, stroke: (top: 3pt + sd-coral), inset: (x: 12pt, y: 12pt), radius: 4pt, height: auto)[
    #text(fill: sd-coral, weight: "bold", size: 10pt)[02 — Compliance verification]
    #v(6pt)
    #text(size: 9.5pt)[For any flow or process, the AI navigates from the note to its linked rules and produces a verification list: compliant / non-compliant / pending.]
  ]
]

#v(10pt)

#grid(columns: (1fr, 1fr), gutter: 14pt)[
  #block(fill: sd-light, stroke: (top: 3pt + sd-navy), inset: (x: 12pt, y: 12pt), radius: 4pt, height: auto)[
    #text(fill: sd-navy, weight: "bold", size: 10pt)[03 — Compliant code]
    #v(6pt)
    #text(size: 9.5pt)[The "Implementation implications" section in each flow note lists the technical requirements. The AI uses that section + the links to messages, rules, and errors to generate code that already meets the domain's specifications.]
  ]
][
  #block(fill: sd-light, stroke: (top: 3pt + sd-navy), inset: (x: 12pt, y: 12pt), radius: 4pt, height: auto)[
    #text(fill: sd-navy, weight: "bold", size: 10pt)[04 — Structured documents]
    #v(6pt)
    #text(size: 9.5pt)[Strategic and analysis notes are consolidated into PDF documents through the generation pipeline described in Section 06 — with professional design, charts, and full attribution.]
  ]
]

// ═════════════════════════════════════════════════════════════════════════════
// 06 — DOCUMENT GENERATION PIPELINE
// ═════════════════════════════════════════════════════════════════════════════
= 06 — Document generation pipeline

N1X Cortex includes a pipeline to convert accumulated knowledge into deliverable PDF documents — with consistent visual identity, authorship attribution, and traceability to the source notes. It is a reproducible method, not an ad-hoc design per document.

#callout[
  *Guiding principle:* the markdown is the source of truth; the PDF is a derived output. The PDF is never written by hand: it is compiled from a `.typ` file that reflects the markdown. If the content changes, change the markdown first and then regenerate.
]

== Stack

#table(
  columns: (auto, 1fr, auto),
  table.header([Tool], [What for], [When]),
  [*Typst* (0.14+)], [Typesetting engine → PDF. 10× faster than LaTeX, CSS-like syntax], [By default],
  [*Python 3 + matplotlib*], [PNG charts to embed (≥180 DPI, brand palette)], [If there are charts],
  [*HTML + headless Chrome*], [Alternative for highly visual designs (`--print-to-pdf`)], [Optional],
)

#v(0.8em)

== Generation flow

#v(0.3em)

#block(fill: sd-light, inset: (x: 14pt, y: 12pt), width: 100%, radius: 4pt)[
  #grid(columns: (2.5em, 1fr), gutter: 8pt)[
    #align(center)[#block(fill: sd-coral, inset: (x: 5pt, y: 4pt), radius: 3pt)[#text(fill: white, weight: "bold", size: 9pt)[1]]]
  ][
    *Consolidate* — The atomic notes from the thematic folder are gathered into structured markdown, preserving the source citations
  ]
  #v(4pt)
  #grid(columns: (2.5em, 1fr), gutter: 8pt)[
    #align(center)[#block(fill: sd-coral, inset: (x: 5pt, y: 4pt), radius: 3pt)[#text(fill: white, weight: "bold", size: 9pt)[2]]]
  ][
    *Chart* (optional) — Generate the charts with Python/matplotlib (brand palette, ≥180 DPI, relative paths)
  ]
  #v(4pt)
  #grid(columns: (2.5em, 1fr), gutter: 8pt)[
    #align(center)[#block(fill: sd-coral, inset: (x: 5pt, y: 4pt), radius: 3pt)[#text(fill: white, weight: "bold", size: 9pt)[3]]]
  ][
    *Lay out* — Write the `.typ`: color tokens, reusable components, cover, table of contents, sections, header and footer
  ]
  #v(4pt)
  #grid(columns: (2.5em, 1fr), gutter: 8pt)[
    #align(center)[#block(fill: sd-coral, inset: (x: 5pt, y: 4pt), radius: 3pt)[#text(fill: white, weight: "bold", size: 9pt)[4]]]
  ][
    *Compile and verify* — `typst compile doc.typ doc.pdf` and review visually in Preview before publishing
  ]
  #v(4pt)
  #grid(columns: (2.5em, 1fr), gutter: 8pt)[
    #align(center)[#block(fill: sd-navy, inset: (x: 5pt, y: 4pt), radius: 3pt)[#text(fill: white, weight: "bold", size: 9pt)[5]]]
  ][
    *Publish and version* — Copy the `.typ` and `.pdf` to the destination; keep the previous versions (`-v1`, `-v2`…), never overwrite
  ]
]

#v(0.8em)

== Anatomy, tokens, and components

Every deliverable follows the same structure: *cover* (title, version, date, "PREPARED BY") → *table of contents* → *numbered sections* with consistent H1/H2/H3 headings → *footer* with automatic numbering → *final authorship footer*.

The palette is declared as tokens at the start of the `.typ`. *Brand separation rule:* a deliverable of the N1X Cortex methodology uses its own palette (navy/coral); a deliverable of a client project uses that client's palette. They are never mixed. The reusable components (`callout`, `coral-callout`, `hero-box`, `pillar-box`, heading styles, and header/footer) are copied unmodified between documents of the same series.

#v(0.8em)

== Attribution

All generated documents carry author attribution in three places:

#table(
  columns: (auto, 1fr),
  table.header([Place], [Content]),
  [*Cover*], ["PREPARED BY" field with the author's full name],
  [*Footer of each page*], [Name · © · year],
  [*Final footer*], [Full authorship note with © and distribution restrictions],
)

// ═════════════════════════════════════════════════════════════════════════════
// 07 — DESIGN PRINCIPLES
// ═════════════════════════════════════════════════════════════════════════════
= 07 — Design principles

#v(0.3em)

#table(
  columns: (auto, 1fr),
  table.header([Principle], [Description]),
  [*Fidelity*], [Never invent data, rules, or steps. If the source does not say it, it is not asserted. Whatever requires verification is marked `status: draft`.],
  [*Atomicity*], [One idea per note. If a note grows until it covers two concepts that could change independently, it is split into two.],
  [*Mandatory citation*], [Every note cites its source at the foot: origin file and page number. Without a source, the note is not finished.],
  [*Liberal linking*], [Linking is done even if the destination note does not yet exist. An orphan link is a valid future-work marker, not an error.],
  [*Source immutability*], [The files in `Markdown/` are sacred — they are never modified. They are the immutable source of truth.],
  [*Living cycle*], [The brain is not built only once. Every new learning returns to the brain as a new note or update.],
  [*Incremental scale*], [It is not necessary to atomize the entire corpus before using the system. It expands on-demand, when needed.],
)

// ═════════════════════════════════════════════════════════════════════════════
// 08 — APPLICATION CASE
// ═════════════════════════════════════════════════════════════════════════════
= 08 — Application case (illustrative)

As a *hypothetical* example — it does not correspond to any real client or project — consider the application of N1X Cortex to an integration project in a regulated sector with high documentary density.

== The corpus

#table(
  columns: (auto, auto, 1fr),
  table.header([Type], [Volume], [Content]),
  [Regulatory/technical], [Tens of thousands of lines], [API specifications, regulations, UX and cybersecurity guidelines, error catalogs],
  [Functional workshops], [A series], [Documented process flows],
  [Strategic], [1 document], [Research & Discovery: market, competitors, identified opportunities],
)

#v(0.8em)

== The result

#callout[
  *Several hundred atomic notes* organized into thematic folders, with a graph of thousands of connections. It would allow answering complex questions about regulatory compliance, generating code that already meets the technical specifications, and producing structured strategic documents.
]

#v(0.5em)

A case like this validates the methodology at its most demanding scale: a multidimensional corpus (technical + regulatory + strategic), multiple document versions, and the need for full traceability between each line of code and the rule that justifies it.

#coral-callout[
  *Note:* The methodology is applicable to any project with similar characteristics — it is not specific to any sector or country.
]

// ═════════════════════════════════════════════════════════════════════════════
// 09 — AUTHORSHIP AND IP
// ═════════════════════════════════════════════════════════════════════════════
= 09 — Authorship and IP

#hero-box[
  *N1X Cortex* is an original methodology developed by *N1X Technologies*.

  The name, the four-pillar structure, the document generation pipeline, the atomization patterns, and the design components are the intellectual property of N1X Technologies.
]

#v(1em)

The *applications of the methodology* are instances of use — the generated vault belongs to the context of each project, but the methodology itself belongs to its creator.

#v(1.5em)

#line(length: 100%, stroke: 0.5pt + sd-divider)

#v(0.8em)

#align(center)[
  #text(size: 9.5pt, fill: sd-mid)[
    Prepared by *N1X Technologies* · N1X Cortex v2.1 · June 2026 \
    © 2026 N1X Technologies — All rights reserved
  ]
]
