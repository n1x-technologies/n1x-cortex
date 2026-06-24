// Documento de ejemplo. Usa la marca por defecto de `marca.typ`
// (monocromo neutro, sin logo → wordmark). Edita `marca.typ` para re-marcar.
//
// Compilar:   typst compile ejemplo.typ ejemplo.pdf
// Ver portada: typst compile --pages 1 --ppi 110 ejemplo.typ portada.png

#import "plantilla.typ": *

#show: doc.with(
  title: "Título del Documento",
  subtitle: "Subtítulo o línea de contexto",
  doc-label: "Ejemplo",
  client: "Nombre del Cliente",
  date: "Junio 2026",
  version: "v1.0",
  header-title: "Documento de ejemplo",
)

= Primer encabezado (H1 — banner, arranca página)

Texto del cuerpo, justificado. La plantilla aplica tipografía, márgenes, header
y footer automáticamente. Todo el color de marca sale de `marca.typ`.

#callout[
  *Callout:* para notas. Fondo gris con borde a la izquierda. (Al convertir
  Markdown con pandoc, los `> blockquote` se vuelven esto automáticamente.)
]

== Métricas

#grid(columns: (1fr, 1fr, 1fr, 1fr), gutter: 9pt,
  metric([3 sem], [Primera entrega]),
  metric([\$24,000], [Inversión total]),
  metric([112], [Ítems]),
  metric([Sin servidor], [En la nube]),
)

== Tablas

Cabecera con el color primario, filas alternas, texto a la izquierda sin guionado.

#table(
  columns: (1.4fr, 1fr, 1fr),
  table.header([Concepto], [Opción A], [Opción B]),
  [Cobertura], [#yes], [#no],
  [Costo], [\$150/mes], [\$450/mes],
)

== Mensaje clave

#dark-callout[
  *Callout oscuro:* para el mensaje que quieres que se recuerde primero.
]

== Checklist

#table(
  columns: (1.5cm, 1fr, 0.9fr),
  align: (center + horizon, left, left),
  table.header([Estado], [Ítem], [Criterio]),
  [#chk], [Primer ítem con su descripción], [Se acepta cuando pasa la prueba],
  [#chk], [Segundo ítem], [Criterio de aceptación],
)
