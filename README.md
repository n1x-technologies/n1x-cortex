# N1X Cortex — Metodología de Gestión del Conocimiento Asistida por IA

Metodología para convertir grandes corpus de documentación en **grafos de conocimiento atómico consultables por IA**, capaces de generar respuestas citadas, verificar cumplimiento y producir código o documentos estructurados.

**N1X Cortex · by N1X Technologies · © 2026** — Todos los derechos reservados.

> La metodología se llamaba antes **BRAIN** (v1). Desde la v2.0 su nombre es **N1X Cortex**. Los archivos `BRAIN-Metodologia-v1.*` se conservan como histórico de evolución.

## Contenido

| Archivo | Qué es |
|---|---|
| [`N1X-Cortex-v2.md`](N1X-Cortex-v2.md) | El documento de la metodología (fuente de verdad vigente). **Empieza aquí.** |
| [`N1X-Cortex-v2.pdf`](N1X-Cortex-v2.pdf) | El documento compilado vigente (entregable). |
| `N1X-Cortex-v2.typ` | Fuente Typst del PDF vigente. |
| `BRAIN-Metodologia-v1.md` / `.typ` / `.pdf` | Versión 1 histórica (nombre anterior: BRAIN). No se modifica. |
| [`PROCESO-Actualizacion-N1X-Cortex.md`](PROCESO-Actualizacion-N1X-Cortex.md) | Cómo versionar y regenerar el PDF. |
| [`CLAUDE.md`](CLAUDE.md) | Orientación para Claude Code al abrir el repo. |

## La metodología en una línea

**4 pilares:** Atomizar (una idea por nota) · Conectar (wikilinks) · Curar (MOCs, glosario, ciclo vivo) · Capa IA (consulta, cumplimiento, generación de código y documentos).

## Regenerar el PDF

```bash
typst compile N1X-Cortex-v2.typ N1X-Cortex-v2.pdf
```

Detalle completo en [`PROCESO-Actualizacion-N1X-Cortex.md`](PROCESO-Actualizacion-N1X-Cortex.md).

---

> Esta es una metodología **genérica**, independiente de cualquier proyecto donde se aplique. No contiene datos de clientes.
