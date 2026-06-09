// ─────────────────────────────────────────────────────────────────────────────
// BRAIN — Metodología de Gestión del Conocimiento Asistida por IA
// © 2026 Sebastian Dominguez
// Paleta independiente: navy + coral (NO Intercorp)
// ─────────────────────────────────────────────────────────────────────────────

// ── Paleta de colores propia ──────────────────────────────────────────────────
#let sd-navy    = rgb("1A1A2E")   // Navy principal
#let sd-coral   = rgb("E94560")   // Coral acento
#let sd-mid     = rgb("4A4A6A")   // Gris-azul neutro
#let sd-light   = rgb("F5F5F5")   // Fondo claro
#let sd-white   = rgb("FFFFFF")
#let sd-divider = rgb("D0D0E0")
#let ok-green   = rgb("1B7A3E")
#let row-alt    = rgb("F0F0F8")
#let bg-insight = rgb("EEF0FF")
#let bg-warn    = rgb("FFF0F0")

// ── Componentes reutilizables ─────────────────────────────────────────────────
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

// ── Estilos de tablas ─────────────────────────────────────────────────────────
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

// ── Estilos de headings ───────────────────────────────────────────────────────
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

// ── Configuración de página ───────────────────────────────────────────────────
#set text(font: ("Helvetica Neue", "Arial", "Liberation Sans"), size: 10.5pt, fill: sd-navy)
#set par(leading: 0.72em, justify: true)

#set page(
  paper: "a4",
  margin: (top: 3cm, bottom: 3cm, left: 2.8cm, right: 2.8cm),
  header: [
    #set text(size: 8.5pt)
    #grid(columns: (1fr, auto))[
      #text(fill: sd-navy, weight: "bold")[BRAIN — Metodología de Gestión del Conocimiento]
    ][
      #text(fill: sd-mid)[Sebastian Dominguez · Junio 2026]
    ]
    #v(-4pt)
    #line(length: 100%, stroke: 1.2pt + sd-navy)
  ],
  footer: [
    #line(length: 100%, stroke: 0.5pt + sd-divider)
    #v(-4pt)
    #grid(columns: (1fr, auto))[
      #text(size: 8pt, fill: sd-mid)[Sebastian Dominguez · © 2026 · Todos los derechos reservados]
    ][
      #context text(size: 8pt, fill: sd-mid)[Página #counter(page).display()]
    ]
  ],
  numbering: "1",
)

// ═════════════════════════════════════════════════════════════════════════════
// PORTADA
// ═════════════════════════════════════════════════════════════════════════════
#page(margin: 0pt, header: none, footer: none, numbering: none)[
  // Bloque navy superior
  #block(fill: sd-navy, width: 100%, height: 11.5cm,
    inset: (x: 3cm, top: 3.5cm, bottom: 1.5cm),
  )[
    #align(bottom + left)[
      #text(fill: sd-coral, size: 9.5pt, weight: "bold", tracking: 3.5pt)[
        METODOLOGÍA DE GESTIÓN DEL CONOCIMIENTO
      ]
      #v(0.9em)
      #text(fill: white, size: 52pt, weight: "black")[
        BRAIN
      ]
      #v(0.5em)
      #text(fill: sd-divider, size: 13pt, weight: "light")[
        Metodología de Gestión del Conocimiento\
        Asistida por Inteligencia Artificial
      ]
    ]
  ]
  // Franja coral
  #block(fill: sd-coral, width: 100%, height: 7pt)
  // Cuerpo blanco
  #block(fill: white, width: 100%, inset: (x: 3cm, top: 2.5cm, bottom: 2cm))[
    #text(fill: sd-mid, size: 11pt)[
      Convierte grandes corpus de documentación técnica, normativa o estratégica\
      en grafos de conocimiento atómico consultables por IA — con trazabilidad\
      completa, cumplimiento verificable y generación de código conforme.
    ]
    #v(2cm)
    #grid(columns: (1fr, 1fr, 1fr), gutter: 20pt)[
      #text(size: 8pt, fill: sd-mid, weight: "bold")[ELABORADO POR]\
      #text(size: 10.5pt, fill: sd-navy)[Sebastian Dominguez]
    ][
      #text(size: 8pt, fill: sd-mid, weight: "bold")[VERSIÓN]\
      #text(size: 10.5pt, fill: sd-navy)[1.0 · Junio 2026]
    ][
      #text(size: 8pt, fill: sd-mid, weight: "bold")[ESTADO]\
      #text(size: 10.5pt, fill: ok-green, weight: "bold")[Publicado]
    ]
    #v(1.5cm)
    #line(length: 100%, stroke: 0.5pt + sd-divider)
    #v(0.5cm)
    #text(size: 8pt, fill: sd-mid)[© 2026 Sebastian Dominguez — Todos los derechos reservados · dcsebastianc\@gmail.com]
  ]
]

// ═════════════════════════════════════════════════════════════════════════════
// ÍNDICE
// ═════════════════════════════════════════════════════════════════════════════
#page[
  #v(0.5em)
  #block(fill: sd-navy, width: 100%, inset: (x: 12pt, y: 10pt), radius: 4pt)[
    #set text(fill: white, weight: "bold", size: 15pt)
    Índice
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

  #toc-item("01", "Qué es BRAIN", "Definición, el problema que resuelve")
  #toc-item("02", "Para quién aplica", "Dominios: regulatorio, técnico, estratégico, legal, operativo")
  #toc-item("03", "Los 4 pilares", "Atomizar · Conectar · Curar · Capa IA")
  #toc-item("04", "Estructura del vault", "Carpetas, frontmatter, wikilinks, MOCs")
  #toc-item("05", "Lo que produce", "Respuestas, cumplimiento, código conforme, documentos PDF")
  #toc-item("06", "Pipeline de generación de documentos", "matplotlib + Typst + atribución")
  #toc-item("07", "Principios de diseño", "Fidelidad, atomicidad, citación, enlace liberal")
  #toc-item("08", "Caso de aplicación", "Ejemplo ilustrativo hipotético")
  #toc-item("09", "Autoría e IP", "© 2026 Sebastian Dominguez")
]

// ═════════════════════════════════════════════════════════════════════════════
// 01 — QUÉ ES BRAIN
// ═════════════════════════════════════════════════════════════════════════════
= 01 — Qué es BRAIN

#hero-box[
  *BRAIN* es una metodología para convertir grandes corpus de documentación — técnica, normativa, estratégica, legal u operativa — en *grafos de conocimiento atómico consultables por IA*, capaces de generar respuestas precisas, verificar cumplimiento y producir código o documentos estructurados.
]

#v(1em)

== El problema

Los documentos monolíticos no escalan para trabajo asistido por IA.

Un corpus de 50,000+ líneas distribuido en decenas de archivos presenta tres problemas fundamentales:

#table(
  columns: (auto, 1fr),
  table.header([Problema], [Consecuencia]),
  [*Contexto excede ventana de IA*], [El sistema no puede leer todo el corpus a la vez; genera respuestas sin contexto completo],
  [*Sin estructura semántica*], [La IA no puede razonar sobre relaciones entre reglas, flujos y errores],
  [*Sin trazabilidad*], [No hay forma de verificar de dónde viene cada afirmación o decisión],
)

#v(0.8em)

== La solución

#callout[
  BRAIN convierte esa masa documental en una *red de nodos atómicos*: una nota por concepto, una nota por regla, una nota por flujo. Todos interconectados con enlaces semánticos y etiquetados con frontmatter estructurado.
]

El resultado es un "segundo cerebro" que:

- Responde preguntas complejas *citando la fuente exacta*
- Verifica si una decisión *cumple las reglas del dominio*
- Sirve como contexto preciso para que una IA *genere código conforme*
- Produce *documentos estructurados* consolidando el conocimiento acumulado

// ═════════════════════════════════════════════════════════════════════════════
// 02 — PARA QUIÉN APLICA
// ═════════════════════════════════════════════════════════════════════════════
= 02 — Para quién aplica

BRAIN es aplicable a cualquier dominio con *alta densidad documental y requisitos de consistencia*:

#v(0.5em)

#table(
  columns: (auto, 1fr, 1fr),
  table.header([Dominio], [Tipo de corpus], [Lo que produce]),
  [*Regulatorio / fintech*], [Reglamentos, circulares, especificaciones técnicas], [Cumplimiento verificable, código conforme a norma],
  [*Legal / compliance*], [Contratos, políticas, marcos regulatorios], [Consultas rápidas, identificación de obligaciones],
  [*Estratégico / producto*], [Research, análisis de mercado, roadmaps], [Decisiones informadas, documentos de producto],
  [*Técnico / ingeniería*], [APIs, specs, arquitecturas, runbooks], [Código generado con contexto correcto],
  [*Operativo*], [Procesos, procedimientos, manuales], [Consulta rápida, automatización de flujos],
)

#v(1em)

== Cuándo es más valioso

La metodología es especialmente valiosa cuando se cumplen uno o más de estos criterios:

#coral-callout[
  - El corpus supera las *10,000 líneas* y no cabe en un solo contexto de IA
  - Las reglas y los datos *evolucionan con frecuencia* (versiones, actualizaciones normativas)
  - Se necesita *trazabilidad*: toda respuesta debe citar su fuente
  - *Múltiples personas o sistemas* consultan el mismo conocimiento
  - Se requiere generar *código o documentos* que reflejen las reglas del dominio
]

// ═════════════════════════════════════════════════════════════════════════════
// 03 — LOS 4 PILARES
// ═════════════════════════════════════════════════════════════════════════════
= 03 — Los 4 pilares

#v(0.3em)

#pillar-box("01", "Atomizar")[
  Partir cada documento fuente en *unidades mínimas de conocimiento*. Una nota atómica contiene exactamente una idea: un concepto, una regla, un flujo, un mensaje, un código de error.

  *Criterio de atomicidad:* si la nota trata dos cosas que podrían cambiar de forma independiente, debe partirse en dos.

  Cada nota lleva: frontmatter YAML con tipo, ID, etiquetas y estado · cuerpo estructurado en lenguaje natural · sección de implicaciones para implementación (en flujos y procesos) · cita de fuente al pie con archivo y página de origen.
]

#v(0.8em)

#pillar-box("02", "Conectar")[
  Enlazar cada nota con todas las notas relacionadas usando *wikilinks* (`[[nombre-nota]]`). Los enlaces son el tejido conectivo del grafo:

  - Una regla enlaza a los flujos que la aplican
  - Un flujo enlaza a los mensajes que usa, las reglas que cumple y los errores posibles
  - Un concepto enlaza a todos los contextos donde aparece

  Un enlace a una nota que aún no existe es *válido* — marca trabajo futuro sin romper el grafo. Esto permite construir el sistema incrementalmente.
]

#v(0.8em)

#pillar-box("03", "Curar")[
  Mantener la calidad del grafo a lo largo del tiempo:

  - *MOC (Maps of Content):* índices temáticos que agrupan notas por dominio
  - *Glosario:* una nota por término del dominio, con definición canónica y aliases para términos equivalentes
  - *Fusión de duplicados:* cuando dos notas representan el mismo concepto, se fusionan con aliases
  - *Ciclo de retroalimentación:* todo aprendizaje nuevo vuelve al cerebro como nota nueva o actualización
]

#v(0.8em)

#pillar-box("04", "Capa IA")[
  El grafo curado se convierte en el *contexto preciso* para sistemas de IA:

  - *Consultas en lenguaje natural:* la IA navega los enlaces y responde citando las notas
  - *Verificación de cumplimiento:* la IA sigue el árbol de enlaces desde un flujo hasta sus reglas
  - *Generación de código:* la sección "Implicaciones para implementación" de cada nota es el checklist de requisitos
  - *Generación de documentos:* las notas estratégicas se consolidan en PDFs estructurados
]

// ═════════════════════════════════════════════════════════════════════════════
// 04 — ESTRUCTURA DEL VAULT
// ═════════════════════════════════════════════════════════════════════════════
= 04 — Estructura del vault

Un vault BRAIN tiene la siguiente estructura genérica, adaptable a cualquier dominio:

#v(0.5em)

#block(
  fill: rgb("0D1117"),
  inset: (x: 16pt, y: 14pt),
  width: 100%,
  radius: 6pt,
)[
  #set text(font: ("Courier New", "Monaco", "Menlo"), size: 9pt, fill: rgb("E6EDF3"))
  #text(fill: sd-coral)[BRAIN/]\
  #text(fill: rgb("7EE787"))[├── README.md]            #h(2em) #text(fill: rgb("8B949E"))[← plan maestro y estado]\
  #text(fill: rgb("7EE787"))[├── CLAUDE.md]             #h(2em) #text(fill: rgb("8B949E"))[← convenciones para IA]\
  #text(fill: rgb("7EE787"))[├── HOME.md]               #h(2em) #text(fill: rgb("8B949E"))[← dashboard / punto de entrada]\
  #text(fill: rgb("79C0FF"))[│]\
  #text(fill: rgb("79C0FF"))[├── 00-MOC/]               #h(2em) #text(fill: rgb("8B949E"))[← índices temáticos]\
  #text(fill: rgb("79C0FF"))[├── 01-Conceptos/]         #h(2em) #text(fill: rgb("8B949E"))[← glosario atómico]\
  #text(fill: rgb("79C0FF"))[├── 02-Flujos/]            #h(2em) #text(fill: rgb("8B949E"))[← procesos y flujos]\
  #text(fill: rgb("79C0FF"))[├── 03-Reglamentos/]       #h(2em) #text(fill: rgb("8B949E"))[← reglas y obligaciones]\
  #text(fill: rgb("79C0FF"))[├── 04-Tecnico/]           #h(2em) #text(fill: rgb("8B949E"))[← APIs, mensajes, specs]\
  #text(fill: rgb("79C0FF"))[├── 05-Errores/]           #h(2em) #text(fill: rgb("8B949E"))[← catálogo de errores]\
  #text(fill: rgb("79C0FF"))[├── 06-Seguridad/]         #h(2em) #text(fill: rgb("8B949E"))[← lineamientos de seguridad]\
  #text(fill: rgb("79C0FF"))[├── 07-UX/]                #h(2em) #text(fill: rgb("8B949E"))[← experiencia de usuario]\
  #text(fill: rgb("79C0FF"))[├── 08-MVPs/]              #h(2em) #text(fill: rgb("8B949E"))[← especificaciones de código]\
  #text(fill: rgb("79C0FF"))[├── 09-Estrategia/]        #h(2em) #text(fill: rgb("8B949E"))[← análisis y oportunidades]\
  #text(fill: rgb("79C0FF"))[│]\
  #text(fill: rgb("79C0FF"))[├── \_templates/]           #h(2em) #text(fill: rgb("8B949E"))[← plantillas de nota]\
  #text(fill: rgb("79C0FF"))[└── Markdown/]             #h(2em) #text(fill: rgb("8B949E"))[← fuentes originales (NO MODIFICAR)]
]

#v(1em)

== Frontmatter estándar

Cada nota lleva frontmatter YAML mínimo:

#block(
  fill: rgb("0D1117"),
  inset: (x: 16pt, y: 14pt),
  width: 100%,
  radius: 6pt,
)[
  #set text(font: ("Courier New", "Monaco", "Menlo"), size: 9.5pt, fill: rgb("E6EDF3"))
  #text(fill: rgb("8B949E"))[---]\
  #text(fill: rgb("79C0FF"))[tipo:] #text(fill: rgb("A5D6FF"))[flujo]       #h(2em) #text(fill: rgb("8B949E"))[\# concepto | flujo | regla | tecnico | estrategia]\
  #text(fill: rgb("79C0FF"))[id:] #text(fill: rgb("A5D6FF"))[FLUJO-EJEMPLO-01]\
  #text(fill: rgb("79C0FF"))[tags:] #text(fill: rgb("A5D6FF"))[#[flujo, proceso, ejemplo]]\
  #text(fill: rgb("79C0FF"))[fuente:] #text(fill: rgb("A5D6FF"))["[[nombre-documento-fuente]]"]\
  #text(fill: rgb("79C0FF"))[estado:] #text(fill: rgb("A5D6FF"))[documentado]  #h(2em) #text(fill: rgb("8B949E"))[\# borrador | documentado | verificado]\
  #text(fill: rgb("8B949E"))[---]
]

// ═════════════════════════════════════════════════════════════════════════════
// 05 — LO QUE PRODUCE
// ═════════════════════════════════════════════════════════════════════════════
= 05 — Lo que produce

Un vault BRAIN bien construido produce cuatro tipos de salidas:

#v(0.5em)

#grid(columns: (1fr, 1fr), gutter: 14pt)[
  #block(fill: sd-light, stroke: (top: 3pt + sd-coral), inset: (x: 12pt, y: 12pt), radius: 4pt, height: auto)[
    #text(fill: sd-coral, weight: "bold", size: 10pt)[01 — Respuestas citadas]
    #v(6pt)
    #text(size: 9.5pt)[Cualquier pregunta sobre el dominio se responde con citas a las notas fuente. La IA entra por el MOC del tema, navega los enlaces, responde con el dato exacto y cita la nota como fuente.]
  ]
][
  #block(fill: sd-light, stroke: (top: 3pt + sd-coral), inset: (x: 12pt, y: 12pt), radius: 4pt, height: auto)[
    #text(fill: sd-coral, weight: "bold", size: 10pt)[02 — Verificación de cumplimiento]
    #v(6pt)
    #text(size: 9.5pt)[Para cualquier flujo o proceso, la IA navega desde la nota hasta sus reglas enlazadas y produce una lista de verificación: cumple / no cumple / pendiente.]
  ]
]

#v(10pt)

#grid(columns: (1fr, 1fr), gutter: 14pt)[
  #block(fill: sd-light, stroke: (top: 3pt + sd-navy), inset: (x: 12pt, y: 12pt), radius: 4pt, height: auto)[
    #text(fill: sd-navy, weight: "bold", size: 10pt)[03 — Código conforme]
    #v(6pt)
    #text(size: 9.5pt)[La sección "Implicaciones para implementación" en cada nota de flujo lista los requisitos técnicos. La IA usa esa sección + los enlaces a mensajes, reglas y errores para generar código que ya cumple las especificaciones del dominio.]
  ]
][
  #block(fill: sd-light, stroke: (top: 3pt + sd-navy), inset: (x: 12pt, y: 12pt), radius: 4pt, height: auto)[
    #text(fill: sd-navy, weight: "bold", size: 10pt)[04 — Documentos estructurados]
    #v(6pt)
    #text(size: 9.5pt)[Las notas estratégicas y de análisis se consolidan en documentos PDF mediante el pipeline de generación descrito en la Sección 06 — con diseño profesional, gráficos y atribución completa.]
  ]
]

// ═════════════════════════════════════════════════════════════════════════════
// 06 — PIPELINE DE GENERACIÓN DE DOCUMENTOS
// ═════════════════════════════════════════════════════════════════════════════
= 06 — Pipeline de generación de documentos

BRAIN incluye un pipeline para convertir el conocimiento acumulado en documentos PDF entregables — con identidad visual consistente, atribución de autoría y trazabilidad a las notas fuente. Es un método reproducible, no un diseño ad-hoc por documento.

#callout[
  *Principio rector:* el markdown es la fuente de verdad; el PDF es una salida derivada. El PDF nunca se escribe a mano: se compila desde un archivo `.typ` que refleja el markdown. Si el contenido cambia, cambia el markdown primero y luego se regenera.
]

== Stack

#table(
  columns: (auto, 1fr, auto),
  table.header([Herramienta], [Para qué], [Cuándo]),
  [*Typst* (0.14+)], [Motor de tipografía → PDF. 10× más rápido que LaTeX, sintaxis tipo CSS], [Por defecto],
  [*Python 3 + matplotlib*], [Gráficos PNG para incrustar (≥180 DPI, paleta de marca)], [Si hay gráficos],
  [*HTML + Chrome headless*], [Alternativa para diseños muy visuales (`--print-to-pdf`)], [Opcional],
)

#v(0.8em)

== Flujo de generación

#v(0.3em)

#block(fill: sd-light, inset: (x: 14pt, y: 12pt), width: 100%, radius: 4pt)[
  #grid(columns: (2.5em, 1fr), gutter: 8pt)[
    #align(center)[#block(fill: sd-coral, inset: (x: 5pt, y: 4pt), radius: 3pt)[#text(fill: white, weight: "bold", size: 9pt)[1]]]
  ][
    *Consolidar* — Las notas atómicas de la carpeta temática se reúnen en un markdown estructurado, conservando las citas de fuente
  ]
  #v(4pt)
  #grid(columns: (2.5em, 1fr), gutter: 8pt)[
    #align(center)[#block(fill: sd-coral, inset: (x: 5pt, y: 4pt), radius: 3pt)[#text(fill: white, weight: "bold", size: 9pt)[2]]]
  ][
    *Graficar* (opcional) — Generar los gráficos con Python/matplotlib (paleta de marca, ≥180 DPI, rutas relativas)
  ]
  #v(4pt)
  #grid(columns: (2.5em, 1fr), gutter: 8pt)[
    #align(center)[#block(fill: sd-coral, inset: (x: 5pt, y: 4pt), radius: 3pt)[#text(fill: white, weight: "bold", size: 9pt)[3]]]
  ][
    *Maquetar* — Escribir el `.typ`: tokens de color, componentes reutilizables, portada, índice, secciones, header y footer
  ]
  #v(4pt)
  #grid(columns: (2.5em, 1fr), gutter: 8pt)[
    #align(center)[#block(fill: sd-coral, inset: (x: 5pt, y: 4pt), radius: 3pt)[#text(fill: white, weight: "bold", size: 9pt)[4]]]
  ][
    *Compilar y verificar* — `typst compile doc.typ doc.pdf` y revisar visualmente en Preview antes de publicar
  ]
  #v(4pt)
  #grid(columns: (2.5em, 1fr), gutter: 8pt)[
    #align(center)[#block(fill: sd-navy, inset: (x: 5pt, y: 4pt), radius: 3pt)[#text(fill: white, weight: "bold", size: 9pt)[5]]]
  ][
    *Publicar y versionar* — Copiar `.typ` y `.pdf` al destino; conservar las versiones anteriores (`-v1`, `-v2`…), nunca sobrescribir
  ]
]

#v(0.8em)

== Anatomía, tokens y componentes

Todo entregable sigue la misma estructura: *portada* (título, versión, fecha, "ELABORADO POR") → *índice* → *secciones numeradas* con headings H1/H2/H3 consistentes → *footer* con numeración automática → *pie final* de autoría.

La paleta se declara como tokens al inicio del `.typ`. *Regla de separación de marcas:* un entregable de la metodología BRAIN usa su paleta propia (navy/coral); un entregable de un proyecto cliente usa la paleta de ese cliente. Nunca se mezclan. Los componentes reutilizables (`callout`, `coral-callout`, `hero-box`, `pillar-box`, estilos de heading y header/footer) se copian sin modificar entre documentos de la misma serie.

#v(0.8em)

== Atribución

Todos los documentos generados llevan atribución del autor en tres lugares:

#table(
  columns: (auto, 1fr),
  table.header([Lugar], [Contenido]),
  [*Portada*], [Campo "ELABORADO POR" con nombre completo del autor],
  [*Footer de cada página*], [Nombre · © · año],
  [*Pie final*], [Nota de autoría completa con © y restricciones de distribución],
)

// ═════════════════════════════════════════════════════════════════════════════
// 07 — PRINCIPIOS DE DISEÑO
// ═════════════════════════════════════════════════════════════════════════════
= 07 — Principios de diseño

#v(0.3em)

#table(
  columns: (auto, 1fr),
  table.header([Principio], [Descripción]),
  [*Fidelidad*], [Nunca inventar datos, reglas o pasos. Si la fuente no lo dice, no se afirma. Se marca `estado: borrador` lo que requiere verificación.],
  [*Atomicidad*], [Una idea por nota. Si una nota crece hasta cubrir dos conceptos que podrían cambiar independientemente, se parte en dos.],
  [*Citación obligatoria*], [Toda nota cita su fuente al pie: archivo de origen y número de página. Sin fuente, la nota no está terminada.],
  [*Enlace liberal*], [Se enlaza aunque la nota destino no exista aún. Un enlace huérfano es un marcador de trabajo futuro válido, no un error.],
  [*Inmutabilidad de fuentes*], [Los archivos en `Markdown/` son sagrados — nunca se modifican. Son la fuente de verdad inmutable.],
  [*Ciclo vivo*], [El cerebro no se construye una sola vez. Todo aprendizaje nuevo vuelve al cerebro como nota nueva o actualización.],
  [*Escala incremental*], [No es necesario atomizar todo el corpus antes de usar el sistema. Se expande on-demand, cuando se necesita.],
)

// ═════════════════════════════════════════════════════════════════════════════
// 08 — CASO DE APLICACIÓN
// ═════════════════════════════════════════════════════════════════════════════
= 08 — Caso de aplicación (ilustrativo)

A modo de ejemplo *hipotético* — no corresponde a ningún cliente ni proyecto real — considérese la aplicación de BRAIN a un proyecto de integración en un sector regulado de alta densidad documental.

== El corpus

#table(
  columns: (auto, auto, 1fr),
  table.header([Tipo], [Volumen], [Contenido]),
  [Normativo/técnico], [Decenas de miles de líneas], [Especificaciones de APIs, reglamentos, lineamientos de UX y ciberseguridad, catálogos de errores],
  [Talleres funcionales], [Una serie], [Flujos de proceso documentados],
  [Estratégico], [1 documento], [Research & Discovery: mercado, competidores, oportunidades identificadas],
)

#v(0.8em)

== El resultado

#callout[
  *Varios cientos de notas atómicas* organizadas en carpetas temáticas, con un grafo de miles de conexiones. Permitiría responder preguntas complejas sobre cumplimiento normativo, generar código que ya cumple las especificaciones técnicas, y producir documentos estratégicos estructurados.
]

#v(0.5em)

Un caso así valida la metodología en su escala más exigente: corpus multidimensional (técnico + normativo + estratégico), múltiples versiones de documentos, y necesidad de trazabilidad completa entre cada línea de código y la regla que la justifica.

#coral-callout[
  *Nota:* La metodología es aplicable a cualquier proyecto con características similares — no es específica de ningún sector ni país.
]

// ═════════════════════════════════════════════════════════════════════════════
// 09 — AUTORÍA E IP
// ═════════════════════════════════════════════════════════════════════════════
= 09 — Autoría e IP

#hero-box[
  *BRAIN* es una metodología original desarrollada por *Sebastian Dominguez*.

  El nombre, la estructura de cuatro pilares, el pipeline de generación de documentos, los patrones de atomización y los componentes de diseño son propiedad intelectual de Sebastian Dominguez.
]

#v(1em)

Las *aplicaciones de la metodología* son instancias de uso — el vault generado pertenece al contexto de cada proyecto, pero la metodología en sí pertenece a su creador.

#v(1.5em)

#line(length: 100%, stroke: 0.5pt + sd-divider)

#v(0.8em)

#align(center)[
  #text(size: 9.5pt, fill: sd-mid)[
    Elaborado por *Sebastian Dominguez* · BRAIN v1.0 · Junio 2026 \
    © 2026 Sebastian Dominguez — Todos los derechos reservados \
    Contacto: dcsebastianc\@gmail.com
  ]
]
