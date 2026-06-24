// Example document. Uses the default brand from `brand.typ`
// (neutral monochrome, no logo → wordmark). Edit `brand.typ` to re-brand.
//
// Compile:    typst compile example.typ example.pdf
// View cover: typst compile --pages 1 --ppi 110 example.typ cover.png

#import "template.typ": *

#show: doc.with(
  title: "Document Title",
  subtitle: "Subtitle or context line",
  doc-label: "Example",
  client: "Client Name",
  date: "June 2026",
  version: "v1.0",
  header-title: "Example document",
  lang: "en",   // "en" (default) or "es" — localizes the cover/header/footer labels
)

= First heading (H1 — banner, starts a page)

Body text, justified. The template applies typography, margins, header
and footer automatically. All the brand color comes from `brand.typ`.

#callout[
  *Callout:* for notes. Gray background with a left border. (When converting
  Markdown with pandoc, a `> blockquote` becomes this automatically.)
]

== Metrics

#grid(columns: (1fr, 1fr, 1fr, 1fr), gutter: 9pt,
  metric([3 wks], [First delivery]),
  metric([\$24,000], [Total investment]),
  metric([112], [Items]),
  metric([Serverless], [In the cloud]),
)

== Tables

Header in the primary color, alternating rows, left-aligned text without hyphenation.

#table(
  columns: (1.4fr, 1fr, 1fr),
  table.header([Concept], [Option A], [Option B]),
  [Coverage], [#yes], [#no],
  [Cost], [\$150/mo], [\$450/mo],
)

== Key message

#dark-callout[
  *Dark callout:* for the message you want remembered first.
]

== Checklist

#table(
  columns: (1.5cm, 1fr, 0.9fr),
  align: (center + horizon, left, left),
  table.header([Status], [Item], [Criterion]),
  [#chk], [First item with its description], [Accepted when it passes the test],
  [#chk], [Second item], [Acceptance criterion],
)
