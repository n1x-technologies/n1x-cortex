---
title: "BRAIN — Metodología de Gestión del Conocimiento Asistida por IA"
autor: "Sebastian Dominguez"
version: "1.0"
fecha: "2026-06-03"
tipo: metodologia
estado: publicado
---

# BRAIN
## Metodología de Gestión del Conocimiento Asistida por IA

**Autor:** Sebastian Dominguez  
**Versión:** 1.0 · Junio 2026  
**© 2026 Sebastian Dominguez — Todos los derechos reservados**

---

## 1. Qué es BRAIN

BRAIN es una metodología para convertir grandes corpus de documentación — técnica, normativa, estratégica, legal u operativa — en **grafos de conocimiento atómico consultables por IA**, capaces de generar respuestas precisas, verificar cumplimiento y producir código o documentos estructurados.

El problema central que resuelve: **los documentos monolíticos no escalan**. Un corpus de 50,000+ líneas distribuido en decenas de archivos no puede ser consultado por ningún sistema de IA de manera efectiva. La información se fragmenta, se pierde el contexto, y los sistemas de código generativo producen salidas que ignoran las restricciones reales del dominio.

BRAIN convierte esa masa documental en una **red de nodos atómicos** — una nota por concepto, una nota por regla, una nota por flujo — todos interconectados con enlaces semánticos y etiquetados con frontmatter estructurado. El resultado es un "segundo cerebro" que:

- Responde preguntas complejas citando la fuente exacta
- Verifica si una decisión cumple las reglas del dominio
- Sirve como contexto preciso para que una IA genere código conforme

---

## 2. Para quién aplica

BRAIN es aplicable a cualquier dominio con **alta densidad documental y requisitos de consistencia**:

| Dominio | Tipo de corpus | Lo que produce |
|:---|:---|:---|
| **Regulatorio / fintech** | Reglamentos, circulares, especificaciones técnicas | Cumplimiento verificable, código conforme a norma |
| **Legal / compliance** | Contratos, políticas, marcos regulatorios | Consultas rápidas, identificación de obligaciones |
| **Estratégico / producto** | Research, análisis de mercado, roadmaps | Decisiones informadas, documentos de producto |
| **Técnico / ingeniería** | APIs, specs, arquitecturas, runbooks | Código generado con contexto correcto |
| **Operativo** | Procesos, procedimientos, manuales | Consulta rápida, automatización de flujos |

La metodología es especialmente valiosa cuando:
- El corpus supera las 10,000 líneas y no cabe en un solo contexto de IA
- Las reglas y los datos evolucionan con frecuencia
- Se necesita trazabilidad: toda respuesta debe citar su fuente
- Múltiples personas o sistemas consultan el mismo conocimiento

---

## 3. Los 4 pilares

### Pilar 1 — Atomizar

Partir cada documento fuente en **unidades mínimas de conocimiento**. Una nota atómica contiene exactamente una idea: un concepto, una regla, un flujo, un mensaje, un código de error.

Criterio de atomicidad: *si la nota trata dos cosas que podrían cambiar de forma independiente, debe partirse en dos.*

Cada nota lleva:
- **Frontmatter YAML** con tipo, ID, etiquetas, estado y fuente
- **Cuerpo** con la información en lenguaje natural estructurado
- **Sección de implicaciones para implementación** (en notas de flujo/proceso)
- **Cita de fuente** al pie: archivo + página de origen

### Pilar 2 — Conectar

Enlazar cada nota con todas las notas relacionadas usando **wikilinks** (`[[nombre-de-nota]]`). Los enlaces son el tejido conectivo del grafo:

- Una regla enlaza a los flujos que la aplican
- Un flujo enlaza a los mensajes que usa, las reglas que cumple y los errores que puede generar
- Un concepto enlaza a todos los contextos donde aparece

Un enlace a una nota que aún no existe es válido — marca trabajo futuro sin romper el grafo. Esto permite construir el sistema incrementalmente.

### Pilar 3 — Curar

Mantener la calidad del grafo a lo largo del tiempo:

- **MOC (Maps of Content):** índices temáticos que agrupan notas por dominio, generados como tablas automáticas con Dataview (Obsidian)
- **Glosario:** una nota por término del dominio, con definición canónica y aliases para términos equivalentes
- **Fusión de duplicados:** cuando dos notas representan el mismo concepto, se fusionan y se agregan aliases
- **Ciclo de retroalimentación:** todo aprendizaje nuevo (de reuniones, implementaciones, cambios normativos) vuelve al cerebro como nota actualizada

### Pilar 4 — Capa IA

El grafo curado se convierte en el **contexto preciso** para sistemas de IA:

- Consultas en lenguaje natural: la IA entra por el MOC del tema, navega los enlaces, y responde citando las notas
- Verificación de cumplimiento: la IA sigue el árbol de enlaces desde un flujo hasta sus reglas y verifica cada una
- Generación de código: la sección "Implicaciones para implementación" de cada nota de flujo es el checklist de requisitos que la IA usa para generar código que ya cumple las restricciones del dominio
- Generación de documentos: las notas estratégicas se consolidan en PDFs estructurados (ver Sección 6)

---

## 4. Estructura del vault

Un vault BRAIN tiene la siguiente estructura genérica, adaptable a cualquier dominio:

```
BRAIN/
├── README.md              ← plan maestro y estado del proyecto
├── CLAUDE.md              ← instrucciones para Claude Code (convenciones)
├── HOME.md                ← dashboard / punto de entrada
│
├── 00-MOC/                ← Mapas de Contenido (índices por tema)
├── 01-Conceptos/          ← glosario atómico: un concepto por nota
├── 02-Flujos/             ← procesos y flujos: uno por nota
├── 03-Reglamentos/        ← reglas y obligaciones: una por nota
├── 04-Tecnico/            ← APIs, mensajes, especificaciones
├── 05-Errores/            ← catálogo de códigos de error
├── 06-Seguridad/          ← lineamientos de seguridad
├── 07-UX/                 ← experiencia de usuario
├── 08-MVPs/               ← especificaciones de implementación
├── 09-Estrategia/         ← análisis de mercado, oportunidades, ventajas competitivas
│
├── _templates/            ← plantillas de nota (copiar al crear una nueva)
└── Markdown/              ← fuentes originales (NO MODIFICAR — solo referencia)
```

Las carpetas numeradas son orientativas. Se agregan o eliminan según el dominio. Lo invariante es la separación entre **fuentes** (`Markdown/`) y **conocimiento atomizado** (el resto).

### Frontmatter estándar

Cada nota lleva frontmatter YAML mínimo:

```yaml
---
tipo: flujo            # concepto | flujo | regla | tecnico | error | seguridad | ux | mvp | estrategia
id: FLUJO-EJEMPLO-01
tags: [flujo, proceso, ejemplo]
fuente: "[[nombre-del-documento-fuente]]"
estado: documentado    # borrador | documentado | verificado
---
```

El campo `fuente` apunta a la nota de la fuente en `Markdown/`. El campo `estado` permite rastrear qué notas están completas y cuáles son borradores.

### Wikilinks y navegación

Los enlaces `[[nombre-nota]]` son la API del grafo. En Obsidian se renderizan como un grafo visual de conexiones. En consultas de IA se usan como instrucciones de navegación: "sigue este enlace para obtener más contexto".

---

## 5. Lo que produce

Un vault BRAIN bien construido produce cuatro tipos de salidas:

### Respuestas citadas

Cualquier pregunta sobre el dominio se responde con citas a las notas fuente:

> *"¿Cuál es el límite aplicable a una operación de tipo X?"*  
> → La IA entra por `00-MOC/MOC-Reglamentos.md`, localiza la regla aplicable, lee la nota, responde con el valor exacto y cita `[[REG-NNN-Limite-de-operacion]]` como fuente.

### Verificación de cumplimiento

Para cualquier flujo o proceso, la IA puede verificar si cumple todas las reglas que aplican:

> *"¿Este diseño de pantalla de autenticación cumple los lineamientos?"*  
> → La IA navega desde `07-UX/` hasta `03-Reglamentos/` siguiendo los enlaces, y produce una lista de verificación con cada regla y su estado (cumple / no cumple / pendiente).

### Código conforme

La sección **"Implicaciones para implementación"** en cada nota de flujo lista los requisitos técnicos que el código debe cumplir. La IA usa esa sección + los enlaces a mensajes, reglas y errores para generar código que ya cumple las especificaciones del dominio.

### Documentos estructurados

Las notas estratégicas y de análisis se consolidan en documentos PDF mediante el pipeline de generación descrito en la Sección 6.

---

## 6. Pipeline de generación de documentos

BRAIN incluye un pipeline para convertir el conocimiento acumulado en **documentos PDF entregables** — con identidad visual consistente, atribución de autoría y trazabilidad a las notas fuente. Este es un método reproducible, no un diseño ad-hoc por documento.

### Principio rector

El **markdown es la fuente de verdad**; el PDF es una salida derivada. Nunca se escribe el PDF a mano: se compila desde un archivo de tipografía (`.typ`) que refleja el markdown. Si el contenido cambia, cambia el markdown primero, luego se regenera. Esto preserva el mismo principio de inmutabilidad y trazabilidad que rige el vault.

### Stack

| Herramienta | Para qué | Cuándo |
|:---|:---|:---|
| **Typst** (0.14+) | Motor de tipografía → PDF (10× más rápido que LaTeX, sintaxis tipo CSS) | Pipeline **por defecto** |
| **Python 3 + matplotlib** | Gráficos PNG para incrustar (paleta de marca, ≥180 DPI) | Solo si el documento lleva gráficos |
| **HTML + Chrome headless** | Alternativa para documentos muy visuales / portadas con degradados | Cuando se prefiere maquetar con CSS |

> El motor por defecto es **Typst** por velocidad y reproducibilidad. La vía HTML→PDF (`--headless --print-to-pdf`) es una alternativa válida cuando el diseño se apoya en CSS; produce el mismo tipo de entregable con otra herramienta.

### Flujo de 5 pasos

1. **Consolidar** — las notas atómicas de la carpeta temática (`09-Estrategia/`, `02-Flujos/`, etc.) se reúnen en un markdown estructurado, **conservando las citas de fuente**.
2. **Graficar** (opcional) — se generan los PNG con Python/matplotlib en la paleta de marca, exportados a `/tmp/` con rutas **relativas** (Typst antepone el directorio del `.typ`).
3. **Maquetar** — se escribe el `.typ`: tokens de color, componentes reutilizables, portada, índice, secciones, header y footer.
4. **Compilar y verificar** — `typst compile doc.typ doc.pdf` y se **revisa visualmente en Preview** (portada, paginación, tablas, bloques de código) antes de publicar.
5. **Publicar y versionar** — se copian `.typ` y `.pdf` al directorio final; **las versiones anteriores se conservan** (`-v1`, `-v2`, …), nunca se sobrescriben.

```bash
# Compilar (Typst) y revisar
typst compile /tmp/doc.typ /tmp/doc-v2.pdf && open /tmp/doc-v2.pdf

# Alternativa HTML → PDF (Chrome headless)
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --no-pdf-header-footer \
  --print-to-pdf="doc.pdf" "file:///ruta/doc.html"
```

### Anatomía del documento

Todo entregable BRAIN sigue la misma estructura: **portada** (título, versión, fecha, "ELABORADO POR") → **índice** → **secciones numeradas** con headings H1/H2/H3 de estilo consistente → **footer** con numeración automática → **pie final** de autoría. La maqueta usa A4, márgenes generosos y `page-break` entre bloques mayores.

### Tokens e identidad visual

La paleta se declara como variables al inicio del `.typ`. **Regla de separación de marcas:** un entregable de la *metodología BRAIN* usa la paleta propia de BRAIN (navy/coral); un entregable de un *proyecto cliente* usa la paleta de ese cliente. **Nunca se mezclan.**

```typst
// Paleta BRAIN (metodología — Sebastian Dominguez)
#let sd-navy  = rgb("1A1A2E")   #let sd-coral = rgb("E94560")
#let sd-mid   = rgb("4A4A6A")   #let sd-light = rgb("F5F5F5")
```

### Componentes reutilizables

El pipeline define componentes Typst que se copian sin modificar entre documentos de la misma serie:
- `callout()` — caja de insight con borde izquierdo de color
- `coral-callout()` — caja de advertencia/nota importante
- `hero-box()` — caja de highlight principal (fondo sólido, texto blanco)
- `pillar-box()` — caja temática con borde superior de acento
- Estilos de headings H1/H2/H3 y header/footer con numeración automática

### Atribución — regla fija

Todo documento generado lleva atribución del autor en **tres lugares**:
1. **Portada** — campo "ELABORADO POR" con el nombre completo
2. **Footer de cada página** — nombre + © + año
3. **Pie final** — nota de autoría completa con © y restricciones de distribución

El nombre va siempre completo (nunca abreviado) y el © se actualiza al año en curso.

### Reproducibilidad

El procedimiento operativo detallado — comandos exactos, flujo de versionado vN→vN+1, checklist previo a publicar y errores comunes de Typst con su solución — se mantiene en un documento de proceso acompañante junto al vault o al documento (p. ej. `PROCESO-Actualizacion-*.md`). Ese documento es el que garantiza que cualquier instancia de IA pueda regenerar el entregable de forma idéntica.

---

## 7. Principios de diseño

**Fidelidad sobre completitud.** Nunca inventar datos, reglas o pasos. Si la fuente no lo dice, no se afirma. Se marca como `estado: borrador` lo que requiere verificación.

**Atomicidad.** Una idea por nota. Si una nota crece hasta cubrir dos conceptos que podrían cambiar independientemente, se parte en dos.

**Citación obligatoria.** Toda nota cita su fuente al pie: archivo de origen y número de página. Sin fuente, la nota no está terminada.

**Enlace liberal.** Se enlaza aunque la nota destino no exista aún. Un enlace huérfano es un marcador de trabajo futuro válido, no un error. El grafo crece incrementalmente.

**Inmutabilidad de las fuentes.** Los archivos en `Markdown/` son sagrados — no se modifican nunca. Son la fuente de verdad inmutable. Todo el trabajo de atomización y curaduría ocurre en las carpetas numeradas.

**Ciclo vivo.** El cerebro no se construye una sola vez. Cada vez que se aprende algo nuevo — en una reunión, al implementar código, al recibir una versión nueva de un documento — ese conocimiento vuelve al cerebro como nota nueva o actualización.

**Escala incremental.** No es necesario atomizar todo el corpus antes de usar el sistema. Se puede empezar con el flujo o dominio más crítico y expandir on-demand, cuando se necesita consultar algo que aún no está atomizado.

---

## 8. Caso de aplicación (ilustrativo)

A modo de ejemplo **hipotético** — no corresponde a ningún cliente ni proyecto real — considérese la aplicación de BRAIN a un proyecto de integración en un sector regulado de alta densidad documental, cuyo corpus incluye:

- Decenas de miles de líneas de documentación técnica y normativa (especificaciones de APIs, reglamentos, lineamientos de UX y ciberseguridad, catálogos de errores)
- Una serie de talleres funcionales documentando flujos de proceso
- Análisis estratégico de mercado con un conjunto de oportunidades identificadas

El vault resultante contendría **varios cientos de notas atómicas** organizadas en carpetas temáticas, con un grafo de miles de conexiones. Permitiría responder preguntas complejas sobre cumplimiento normativo, generar código que ya cumple las especificaciones técnicas, y producir documentos estratégicos estructurados.

Un caso así valida la metodología en su escala más exigente: corpus multidimensional (técnico + normativo + estratégico), múltiples versiones de documentos, y necesidad de trazabilidad completa entre cada línea de código y la regla que la justifica.

La metodología es aplicable a cualquier proyecto con características similares — no es específica de ningún sector ni país.

---

## 9. Autoría e IP

**BRAIN** es una metodología original desarrollada por **Sebastian Dominguez**.

El nombre, la estructura de cuatro pilares, el pipeline de generación de documentos, los patrones de atomización y los componentes de diseño son propiedad intelectual de Sebastian Dominguez.

**Aplicaciones de la metodología** son instancias de uso — el vault generado pertenece al contexto de cada proyecto, pero la metodología en sí pertenece a su creador.

---

*© 2026 Sebastian Dominguez — Todos los derechos reservados.*  
*Contacto: dcsebastianc@gmail.com*
