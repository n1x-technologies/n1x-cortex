# Plantilla de documentos (Typst) — parametrizable por marca

Genera **PDFs de nivel consultora** (propuestas, comparativos, reportes) desde Typst o desde Markdown. **Genérico:** cualquiera lo re-marca con sus colores y su logo. No trae logos de ninguna marca.

> **Filosofía (evita el look "auto-generado"):** cero emojis · jerarquía por tipografía, peso y espacio (no por color) · tablas diseñadas · portada de marca.

## Archivos

| Archivo | Qué es |
|---|---|
| `marca.typ` | **Lo único que editas para re-marcar:** colores, logo, nombre, wordmark. |
| `plantilla.typ` | El motor (estilos, componentes, portada). No se edita para re-marcar. |
| `ejemplo.typ` | Documento de muestra con todos los componentes. |
| `convertir-md.py` | Convierte un Markdown existente a este look (vía pandoc). |
| `assets/` | Aquí pones tu logo (opcional). Ver `assets/LEEME.md`. |

## Requisitos

- **Typst** (`typst --version`) — render del PDF.
- **pandoc** — solo si conviertes desde Markdown.
- Fuentes: macOS trae Helvetica Neue. En Linux instala una alternativa métrica (p. ej. Liberation Sans).

## Empezar en 3 pasos

1. **Copia esta carpeta** a tu proyecto.
2. **Edita `marca.typ`** — pon tus colores, tu nombre y (opcional) tu logo en `assets/`.
3. **Escribe y compila:**

```bash
cp ejemplo.typ mi-doc.typ        # parte del ejemplo
typst compile mi-doc.typ mi-doc.pdf
```

Cabecera mínima de un documento:

```typst
#import "plantilla.typ": *
#show: doc.with(
  title: "Título", subtitle: "Subtítulo",
  doc-label: "Propuesta", client: "Cliente", date: "Junio 2026",
)
= Primer encabezado
Contenido...
```

## Componentes

`callout[..]` (nota) · `dark-callout[..]` (mensaje clave) · `metric(valor, label)` (en un `grid`) · `chk` (checkbox) · `yes` / `no`. Encabezados: `=` H1 (banner) · `==` H2 (barra) · `===` H3.

## Re-marcar (marca.typ)

```typst
#let brand-name = "Mi Empresa"
#let wordmark   = "MI MARCA"            // portada si no hay logo
#let logo-light = "assets/logo-blanco.png"   // o none
#let logo-dark  = "assets/logo-negro.png"    // o none
#let primary    = rgb("292929")         // tu color oscuro
#let secondary  = rgb("E5E5E5")         // tu claro
#let accent     = primary               // o un color de acento
```

Sin logo → usa el wordmark. Con logo → ponlo en `assets/` (ver `assets/LEEME.md`).

## Convertir un Markdown existente

Para docs largos ya escritos en `.md`, usa `convertir-md.py` (edita el `__main__`). Hace: quita el título (lo pone la portada) · `> blockquotes` → callouts · desenvuelve tablas para que **partan entre páginas** · limpia emojis (`⬜` → checkbox). Luego `typst compile`.

## Verificar sin abrir el PDF

```bash
typst compile --pages 1 --ppi 110 mi-doc.typ portada.png   # portada
typst compile --pages 5 --ppi 100 mi-doc.typ interior.png  # una página interior
```

## Trucos (no repetir errores)

- **Tablas que no parten / encabezado huérfano con página vacía:** pandoc envuelve tablas en `#figure` que no se parte; el script las desenvuelve. A mano, usa `#table` directo.
- **Guionado feo** (`pun-ta`, `conductor--vehículo`): la plantilla ya desactiva `hyphenate` y el justificado dentro de tablas y métricas.
- **Columna desproporcionada:** fuerza `columns:` explícitas en esa tabla.
