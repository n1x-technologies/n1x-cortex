---
title: "Proceso de Actualización — N1X Cortex"
descripcion: "Cómo mantener, versionar y generar el PDF del documento de metodología N1X Cortex"
fecha: "2026-06-23"
autor: "N1X Technologies"
herramientas: [typst]
---

# Proceso de Actualización — N1X Cortex

Este documento explica cómo mantener y versionar el documento de metodología N1X Cortex (`N1X-Cortex-v*.md` y su PDF correspondiente). Para cualquier instancia de Claude Code o para uso futuro.

> **Nota de marca:** la versión 1 se publicó bajo el nombre anterior **BRAIN** (`BRAIN-Metodologia-v1.*`). Desde la v2.0 la metodología se llama **N1X Cortex** y la atribución es **N1X Technologies**. Los archivos v1 se conservan intactos como histórico de evolución.

---

## Qué es este documento y dónde vive

El documento de metodología N1X Cortex describe la metodología de gestión del conocimiento asistida por IA, propiedad de N1X Technologies. Es un artefacto independiente de cualquier proyecto donde se aplique N1X Cortex.

```
~/Documents/0. WSDC Tech/BRAIN-Metodologia/
├── N1X-Cortex-v2.md             ← fuente de verdad vigente (markdown)
├── N1X-Cortex-v2.typ            ← fuente Typst del PDF vigente
├── N1X-Cortex-v2.pdf            ← PDF generado vigente
├── BRAIN-Metodologia-v1.md      ← histórico (nombre anterior: BRAIN)
├── BRAIN-Metodologia-v1.typ     ← histórico
├── BRAIN-Metodologia-v1.pdf     ← histórico
└── PROCESO-Actualizacion-N1X-Cortex.md   ← este archivo
```

---

## Stack de generación

| Herramienta | Versión | Para qué |
|:---|:---:|:---|
| **Typst** | 0.14.2+ | Motor de tipografía → PDF |

No se necesita Python/matplotlib para este documento — no tiene gráficos externos, todo el diseño es Typst puro.

---

## Paleta de colores N1X Cortex (propia, independiente de proyectos)

Esta paleta identifica la metodología N1X Cortex como producto de N1X Technologies. **No mezclar con la paleta de ningún proyecto cliente.**

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

> Los nombres de variable `sd-*` son internos del `.typ` (no visibles en el PDF) y se conservan por compatibilidad entre versiones.

---

## Estructura del documento (9 secciones)

| # | Sección | Qué contiene |
|:---:|:---|:---|
| 01 | Qué es N1X Cortex | Definición, el problema que resuelve |
| 02 | Para quién aplica | Tabla de dominios y casos de uso |
| 03 | Los 4 pilares | Atomizar · Conectar · Curar · Capa IA |
| 04 | Estructura del vault | Carpetas genéricas, frontmatter, wikilinks |
| 05 | Lo que produce | 4 tipos de salida |
| 06 | Pipeline de documentos | Typst + matplotlib, flujo de generación |
| 07 | Principios de diseño | 7 principios explicados |
| 08 | Caso de aplicación | Ejemplo ilustrativo hipotético (sin clientes reales) |
| 09 | Autoría e IP | © N1X Technologies |

---

## Cuándo actualizar

Actualizar el documento cuando:

- [ ] Se agrega un nuevo pilar o principio a la metodología
- [ ] Cambia la estructura estándar del vault
- [ ] Se incorpora una nueva herramienta al stack (ej. nuevo motor de PDF)
- [ ] Hay un nuevo caso de aplicación que vale la pena mencionar
- [ ] Cambio en la atribución

**No actualizar** por:
- Cambios específicos de un proyecto cliente (esos van en el vault del proyecto)
- Detalles técnicos de implementación de un MVP particular
- Datos de mercado o estrategia de un cliente

---

## Flujo para crear una nueva versión (vN → vN+1)

### 1. Actualizar el markdown fuente

```bash
# El markdown es la fuente de verdad — editar primero
nano "~/Documents/0. WSDC Tech/BRAIN-Metodologia/N1X-Cortex-v2.md"
```

Actualizar el campo `version:` en el frontmatter y la fecha.

### 2. Actualizar el archivo Typst

El `.typ` refleja el `.md` pero con markup Typst. Actualizar en paralelo:
- La versión en el header: `N1X Technologies · v2.0 · Junio 2026` → nueva versión/fecha
- La versión en portada: `#text(size: 10.5pt, fill: sd-navy)[2.0 · Junio 2026]`
- El pie final: `N1X Cortex v2.0 · Junio 2026` → nueva versión
- El contenido que haya cambiado

### 3. Compilar

```bash
# Compilar (el .typ puede estar en /tmp/ o en la carpeta final)
typst compile /tmp/N1X-Cortex.typ /tmp/N1X-Cortex-v3.pdf

# Verificar en Preview
open /tmp/N1X-Cortex-v3.pdf

# Copiar al directorio final
cp /tmp/N1X-Cortex.typ \
  "~/Documents/0. WSDC Tech/BRAIN-Metodologia/N1X-Cortex-v3.typ"
cp /tmp/N1X-Cortex-v3.pdf \
  "~/Documents/0. WSDC Tech/BRAIN-Metodologia/N1X-Cortex-v3.pdf"
```

### 4. Mantener las versiones anteriores

No borrar las versiones anteriores — son evidencia de evolución, incluidas las v1 publicadas bajo el nombre histórico BRAIN. La carpeta acumula versiones:

```
BRAIN-Metodologia/
├── BRAIN-Metodologia-v1.md     ← histórico (nombre anterior: BRAIN)
├── BRAIN-Metodologia-v1.typ
├── BRAIN-Metodologia-v1.pdf
├── N1X-Cortex-v2.md            ← versión vigente
├── N1X-Cortex-v2.typ
├── N1X-Cortex-v2.pdf
├── N1X-Cortex-v3.md            ← nueva versión
├── N1X-Cortex-v3.typ
├── N1X-Cortex-v3.pdf
└── PROCESO-Actualizacion-N1X-Cortex.md
```

---

## Atribución — Regla fija en todas las versiones

El documento N1X Cortex siempre lleva atribución de N1X Technologies en tres lugares:

### 1. Portada — campo ELABORADO POR
```typst
#text(size: 8pt, fill: sd-mid, weight: "bold")[ELABORADO POR]\
#text(size: 10.5pt, fill: sd-navy)[N1X Technologies]
```

### 2. Footer de cada página
```typst
#text(size: 8pt, fill: sd-mid)[N1X Cortex · by N1X Technologies · © 2026]
```

### 3. Pie final del documento
```typst
Elaborado por *N1X Technologies* · N1X Cortex v2.0 · Junio 2026 \
© 2026 N1X Technologies — Todos los derechos reservados
```

**Reglas:**
- La atribución va siempre a **N1X Technologies** — sin nombres personales.
- **Sin email de contacto** en el documento.
- N1X Cortex es propiedad de N1X Technologies — no de ningún proyecto ni cliente.
- El © va en todas las versiones, actualizando el año si corresponde.

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
- [ ] Atribución: "N1X Technologies" en los 3 lugares (portada, footer, pie); sin nombre personal ni email
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

*Documento creado el 3 de junio de 2026 (bajo el nombre anterior BRAIN). Rebrandeado a N1X Cortex el 23 de junio de 2026. Actualizar con cada versión nueva de la metodología.*
