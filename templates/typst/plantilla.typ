// ═══════════════════════════════════════════════════════════════════
// plantilla.typ — Motor de documentos (Typst)
// ───────────────────────────────────────────────────────────────────
// Template de documentos profesionales parametrizable por marca.
// NO edites este archivo para re-marcar: edita `marca.typ`.
//
// USO:
//   #import "plantilla.typ": *
//   #show: doc.with(
//     title: "Título", subtitle: "Subtítulo",
//     doc-label: "Propuesta", client: "Cliente", date: "Junio 2026",
//   )
//   = Encabezado
//   Contenido...
//
// COMPONENTES: callout[..], dark-callout[..], metric(valor, label),
//   chk (checkbox), yes / no, horizontalrule.
//
// FILOSOFÍA (evita el look "auto-generado"): cero emojis; jerarquía por
//   tipografía, peso y espacio (no por color); tablas diseñadas; portada de marca.
// ═══════════════════════════════════════════════════════════════════

#import "marca.typ": *

// ── Grises neutros (funcionan con cualquier `primary`) ──────────────
#let muted      = rgb("6E6E6E")    // texto apagado / labels
#let line-soft  = rgb("D4D4D4")    // divisores
#let fill-zebra = rgb("F5F5F5")    // filas alternas / fondos suaves

// ── Componentes ────────────────────────────────────────────────────
#let yes = text(fill: primary, weight: "bold")[Sí]
#let no  = text(fill: muted)[No]

#let chk = box(width: 8pt, height: 8pt, stroke: 0.9pt + muted, radius: 1.5pt, baseline: 1pt)

#let horizontalrule = { v(0.3em); line(length: 100%, stroke: 0.5pt + line-soft); v(0.3em) }

#let callout(body) = block(
  fill: fill-zebra, stroke: (left: 3pt + primary),
  inset: (x: 14pt, y: 11pt), width: 100%,
  radius: (top-right: 3pt, bottom-right: 3pt),
)[#body]

#let dark-callout(body) = block(
  fill: primary, inset: (x: 16pt, y: 13pt), width: 100%, radius: 3pt,
)[#text(fill: white)[#body]]

#let metric(value, label) = block(
  fill: white, stroke: (top: 3pt + accent),
  inset: (x: 10pt, y: 9pt), width: 100%,
)[#align(center)[
  #text(fill: primary, weight: "bold", size: 17pt, hyphenate: false)[#value]
  #v(2pt)
  #text(fill: muted, size: 8pt)[#label]
]]

// ── Documento (wrapper) ────────────────────────────────────────────
#let doc(
  title: "",
  subtitle: "",
  doc-label: "Documento",
  client: "",
  date: "",
  classification: "Confidencial",
  version: "v1.0",
  header-title: "",
  body,
) = {
  let hl = if header-title != "" { header-title } else { brand-name }
  let header-right = if client != "" { "Para " + client + " · " + classification } else { classification }
  let para-field   = if client != "" { client } else { "—" }
  let date-field   = if date != "" { date } else { "—" }

  set text(font: ("Helvetica Neue", "Arial"), size: 10.5pt, lang: "es", fill: primary)
  set par(justify: true, leading: 0.78em)
  set list(marker: (text(fill: primary)[—], text(fill: muted)[·]))
  set heading(numbering: none)

  show heading.where(level: 1): it => {
    v(0.6em)
    block(fill: primary, width: 100%, inset: (x: 13pt, y: 11pt), radius: 3pt)[
      #set text(fill: white, weight: "bold", size: 14pt, tracking: 0.2pt)
      #it.body
    ]
    v(0.7em)
  }
  show heading.where(level: 2): it => {
    v(0.9em)
    grid(columns: (4pt, 1fr), gutter: 10pt,
      block(fill: primary, width: 4pt, height: 1.5em),
      align(horizon)[#text(fill: primary, weight: "bold", size: 12pt)[#it.body]],
    )
    v(0.3em)
  }
  show heading.where(level: 3): it => {
    v(0.6em); text(fill: primary.darken(10%), weight: "bold", size: 10.5pt)[#it.body]; v(0.15em)
  }

  set table(
    stroke: (col, row) => (
      top: if row == 0 { none } else { 0.5pt + line-soft },
      bottom: 0.5pt + line-soft, left: none, right: none,
    ),
    fill: (col, row) => (
      if row == 0 { primary } else if calc.odd(row) { fill-zebra } else { white }
    ),
    inset: (x: 9pt, y: 7pt),
  )
  show table.cell.where(y: 0): it => text(fill: white, weight: "bold", size: 9.5pt)[#it]
  // dentro de tablas: izquierda (no justificado) y SIN guionado (evita "pun-ta", etc.)
  show table: it => {
    set text(hyphenate: false)
    set par(justify: false, leading: 0.62em)
    it
  }

  // pandoc envuelve tablas en figure → sin numeración/caption
  set figure(numbering: none)
  show figure.where(kind: table): it => it.body
  // blockquotes del markdown → callout
  show quote.where(block: true): it => callout(it.body)

  set page(
    paper: "a4",
    margin: (top: 2.1cm, bottom: 2.2cm, left: 2.1cm, right: 2.1cm),
    header: context {
      if counter(page).get().first() > 1 [
        #set text(size: 8pt, fill: muted)
        #grid(columns: (1fr, auto),
          align(left)[#hl],
          align(right)[#header-right],
        )
        #line(length: 100%, stroke: 0.5pt + line-soft)
      ]
    },
    footer: context {
      if counter(page).get().first() > 1 [
        #line(length: 100%, stroke: 0.5pt + line-soft)
        #v(3pt)
        #set text(size: 8pt, fill: muted)
        #if logo-dark != none {
          grid(columns: (auto, 1fr, auto), column-gutter: 8pt,
            align(horizon)[#image(logo-dark, height: 9pt)],
            align(left + horizon)[#brand-name · #classification],
            align(right + horizon)[#counter(page).display("1 / 1", both: true)],
          )
        } else {
          grid(columns: (1fr, auto),
            align(left)[#brand-name · #classification],
            align(right)[#counter(page).display("1 / 1", both: true)],
          )
        }
      ]
    },
  )

  // ── PORTADA ──────────────────────────────────────────────────────
  page(margin: 0pt)[
    #block(fill: primary, width: 100%, height: 100%)[
      #set text(fill: white, hyphenate: false)
      #set par(justify: false)
      #pad(left: 3cm, right: 3cm, top: 3.5cm)[
        #if logo-light != none {
          image(logo-light, width: 5cm)
        } else {
          text(size: 30pt, weight: "bold", tracking: 1pt, fill: white)[#wordmark]
        }
        #if eyebrow != none {
          v(0.5em)
          text(fill: secondary, size: 10pt, weight: "bold", tracking: 4pt)[#eyebrow]
        }
        #v(1.3em)
        #text(size: 34pt, weight: "bold", tracking: -0.5pt)[#title]
        #v(0.3em)
        #text(size: 17pt, fill: secondary)[#subtitle]

        #v(3.5cm)
        #line(length: 100%, stroke: 1.5pt + secondary)
        #v(1.2em)
        #grid(columns: (1fr, 1fr, 1fr), gutter: 0pt,
          [#text(size: 8.5pt, fill: secondary.darken(35%))[PARA] #v(3pt) #text(size: 11pt, weight: "bold")[#para-field]],
          [#text(size: 8.5pt, fill: secondary.darken(35%))[DOCUMENTO] #v(3pt) #text(size: 11pt, weight: "bold")[#doc-label]],
          [#text(size: 8.5pt, fill: secondary.darken(35%))[FECHA] #v(3pt) #text(size: 11pt, weight: "bold")[#date-field]],
        )
        #v(0.6em)
        #line(length: 100%, stroke: 0.5pt + primary.lighten(25%))
        #v(0.8em)
        #grid(columns: (1fr, 1fr, 1fr), gutter: 0pt,
          [#text(size: 8.5pt, fill: secondary.darken(35%))[CLASIFICACIÓN] #v(3pt) #text(size: 11pt, weight: "bold")[#classification]],
          [#text(size: 8.5pt, fill: secondary.darken(35%))[PREPARADO POR] #v(3pt) #text(size: 11pt, weight: "bold")[#brand-name]],
          [#text(size: 8.5pt, fill: secondary.darken(35%))[VERSIÓN] #v(3pt) #text(size: 11pt, weight: "bold")[#version]],
        )
      ]
    ]
  ]

  body
}
