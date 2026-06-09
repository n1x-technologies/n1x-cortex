---
title: "Proceso de Actualización — BRAIN Metodología"
descripcion: "Cómo mantener, versionar y generar el PDF del documento de metodología BRAIN"
fecha: "2026-06-03"
autor: "Sebastian Dominguez"
herramientas: [typst]
---

# Proceso de Actualización — BRAIN Metodología

Este documento explica cómo mantener y versionar el documento de metodología BRAIN (`BRAIN-Metodologia-v*.md` y su PDF correspondiente). Para cualquier instancia de Claude Code o para uso futuro.

---

## Qué es este documento y dónde vive

El documento de metodología BRAIN describe la metodología de gestión del conocimiento asistida por IA desarrollada por Sebastian Dominguez. Es un artefacto independiente de cualquier proyecto donde se aplique BRAIN.

```
~/Documents/0. WSDC Tech/BRAIN-Metodologia/
├── BRAIN-Metodologia-v1.md    ← fuente de verdad (markdown)
├── BRAIN-Metodologia-v1.typ   ← fuente Typst del PDF
├── BRAIN-Metodologia-v1.pdf   ← PDF generado
└── PROCESO-Actualizacion-BRAIN-Metodologia.md   ← este archivo
```

---

## Stack de generación

| Herramienta | Versión | Para qué |
|:---|:---:|:---|
| **Typst** | 0.14.2+ | Motor de tipografía → PDF |

No se necesita Python/matplotlib para este documento — no tiene gráficos externos, todo el diseño es Typst puro.

---

## Paleta de colores BRAIN (propia, independiente de proyectos)

Esta paleta identifica la metodología BRAIN como producto de Sebastian Dominguez. **No mezclar con la paleta de ningún proyecto cliente.**

```typst
#let sd-navy    = rgb("1A1A2E")   // Navy principal
#let sd-coral   = rgb("E94560")   // Coral acento
#let sd-mid     = rgb("4A4A6A")   // Gris-azul neutro
#let sd-light   = rgb("F5F5F5")   // Fondo claro
#let sd-divider = rgb("D0D0E0")   // Separadores
#let bg-insight = rgb("EEF0FF")   // Fondo callout azul
#let bg-warn    = rgb("FFF0F0")   // Fondo callout coral
#let row-alt    = rgb("F0F0F8")   // Filas alternas
```

---

## Estructura del documento (9 secciones)

| # | Sección | Qué contiene |
|:---:|:---|:---|
| 01 | Qué es BRAIN | Definición, el problema que resuelve |
| 02 | Para quién aplica | Tabla de dominios y casos de uso |
| 03 | Los 4 pilares | Atomizar · Conectar · Curar · Capa IA |
| 04 | Estructura del vault | Carpetas genéricas, frontmatter, wikilinks |
| 05 | Lo que produce | 4 tipos de salida |
| 06 | Pipeline de documentos | Typst + matplotlib, flujo de generación |
| 07 | Principios de diseño | 7 principios explicados |
| 08 | Caso de aplicación | Ejemplo ilustrativo hipotético (sin clientes reales) |
| 09 | Autoría e IP | © Sebastian Dominguez |

---

## Cuándo actualizar

Actualizar el documento cuando:

- [ ] Se agrega un nuevo pilar o principio a la metodología
- [ ] Cambia la estructura estándar del vault
- [ ] Se incorpora una nueva herramienta al stack (ej. nuevo motor de PDF)
- [ ] Hay un nuevo caso de aplicación que vale la pena mencionar
- [ ] Cambio en la información de contacto o atribución

**No actualizar** por:
- Cambios específicos de un proyecto cliente (esos van en el vault del proyecto)
- Detalles técnicos de implementación de un MVP particular
- Datos de mercado o estrategia de un cliente

---

## Flujo para crear una nueva versión (vN → vN+1)

### 1. Actualizar el markdown fuente

```bash
# El markdown es la fuente de verdad — editar primero
nano "~/Documents/0. WSDC Tech/BRAIN-Metodologia/BRAIN-Metodologia-v1.md"
```

Actualizar el campo `version:` en el frontmatter y la fecha.

### 2. Actualizar el archivo Typst

El `.typ` refleja el `.md` pero con markup Typst. Actualizar en paralelo:
- La versión en el header: `Sebastian Dominguez · Junio 2026` → nueva fecha
- La versión en portada: `#text(size: 10.5pt, fill: sd-navy)[1.0 · Junio 2026]`
- El pie final: `BRAIN v1.0 · Junio 2026` → nueva versión
- El contenido que haya cambiado

### 3. Compilar

```bash
# Compilar (el .typ puede estar en /tmp/ o en la carpeta final)
typst compile /tmp/BRAIN-Metodologia.typ /tmp/BRAIN-Metodologia-v2.pdf

# Verificar en Preview
open /tmp/BRAIN-Metodologia-v2.pdf

# Copiar al directorio final
cp /tmp/BRAIN-Metodologia.typ \
  "~/Documents/0. WSDC Tech/BRAIN-Metodologia/BRAIN-Metodologia-v2.typ"
cp /tmp/BRAIN-Metodologia-v2.pdf \
  "~/Documents/0. WSDC Tech/BRAIN-Metodologia/BRAIN-Metodologia-v2.pdf"
```

### 4. Mantener las versiones anteriores

No borrar las versiones anteriores — son evidencia de evolución. La carpeta acumula versiones:

```
BRAIN-Metodologia/
├── BRAIN-Metodologia-v1.md
├── BRAIN-Metodologia-v1.typ
├── BRAIN-Metodologia-v1.pdf
├── BRAIN-Metodologia-v2.md    ← nueva versión
├── BRAIN-Metodologia-v2.typ
├── BRAIN-Metodologia-v2.pdf
└── PROCESO-Actualizacion-BRAIN-Metodologia.md
```

---

## Atribución — Regla fija en todas las versiones

El documento BRAIN siempre lleva atribución de Sebastian Dominguez en tres lugares:

### 1. Portada — campo ELABORADO POR
```typst
#text(size: 8pt, fill: sd-mid, weight: "bold")[ELABORADO POR]\
#text(size: 10.5pt, fill: sd-navy)[Sebastian Dominguez]
```

### 2. Footer de cada página
```typst
#text(size: 8pt, fill: sd-mid)[Sebastian Dominguez · © 2026 · Todos los derechos reservados]
```

### 3. Pie final del documento
```typst
Elaborado por *Sebastian Dominguez* · BRAIN v1.0 · Junio 2026 \
© 2026 Sebastian Dominguez — Todos los derechos reservados \
Contacto: dcsebastianc\@gmail.com
```

**Reglas:**
- Siempre nombre completo **Sebastian Dominguez** — nunca "S. Dominguez"
- BRAIN es la metodología de Sebastian — no de ningún proyecto ni cliente
- El © va en todas las versiones, actualizando el año si corresponde

---

## Componentes Typst reutilizables

Copiar estos en cualquier versión nueva sin modificar:

```typst
// Caja de insight (borde navy izquierdo)
#let callout(body) = block(
  fill: bg-insight,
  stroke: (left: 4pt + sd-navy),
  inset: (x: 14pt, y: 11pt),
  width: 100%,
  radius: (top-right: 4pt, bottom-right: 4pt),
)[#body]

// Caja de advertencia (borde coral izquierdo)
#let coral-callout(body) = block(
  fill: bg-warn,
  stroke: (left: 4pt + sd-coral),
  inset: (x: 14pt, y: 11pt),
  width: 100%,
  radius: (top-right: 4pt, bottom-right: 4pt),
)[#body]

// Caja hero (fondo navy, texto blanco)
#let hero-box(body) = block(
  fill: sd-navy,
  inset: (x: 16pt, y: 14pt),
  width: 100%,
  radius: 4pt,
)[#text(fill: white)[#body]]

// Caja pilar (borde coral superior, fondo gris claro)
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

## Checklist antes de publicar una versión nueva

- [ ] Frontmatter del .md tiene versión y fecha actualizadas
- [ ] El .typ refleja todos los cambios del .md
- [ ] Versión y fecha correctas en portada, header y pie final del .typ
- [ ] Atribución: "Sebastian Dominguez" en los 3 lugares (portada, footer, pie)
- [ ] PDF compilado sin errores (warnings de font son aceptables)
- [ ] PDF revisado visualmente en Preview: portada, paginación, tablas, bloques de código
- [ ] Versión anterior conservada en la carpeta (no reemplazar, agregar)
- [ ] Sección 08 (Caso de aplicación) no revela información confidencial de clientes

---

## Errores comunes en Typst y cómo resolverlos

| Error | Causa | Solución |
|:---|:---|:---|
| `unclosed delimiter` en `_templates` | `_` activa modo énfasis en markup | Escapar: `\_templates` |
| `expected expression` con `#` en comentario | `#` inicia código en markup | Escapar: `\#` |
| Rutas de imagen dobles (`/tmp/tmp/...`) | Typst antepone el directorio del `.typ` | Usar rutas relativas, no absolutas |
| `counter(page)` sin contexto | Requiere bloque `#context` | `#context text(...)[#counter(page).display()]` |
| Font "liberation sans" no encontrada | Font de Linux, no disponible en macOS | Warning benigno — usar fallback "Arial" |

---

*Documento creado el 3 de junio de 2026. Actualizar con cada versión nueva de la metodología BRAIN.*
