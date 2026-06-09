# CLAUDE.md — Repositorio de la metodología BRAIN

Este archivo lo lee Claude Code automáticamente al abrir el repo. Te orienta para que **entiendas qué es este repositorio y cómo trabajar con él** sin necesidad de explicación adicional.

## Qué es este repositorio

Es el **documento de la metodología BRAIN** — una metodología de gestión del conocimiento asistida por IA, creada por **Sebastian Dominguez**. NO es un proyecto de software ni el vault de un cliente: es el **artefacto de IP** que describe la metodología en sí, de forma genérica y reutilizable en cualquier dominio.

Para entender la metodología completa, **lee primero el documento fuente** (la versión más alta):
- `BRAIN-Metodologia-v1.md` ← **empieza por aquí.** Fuente de verdad en markdown.

## Inventario de archivos

| Archivo | Qué es |
|---|---|
| `BRAIN-Metodologia-v{N}.md` | **Fuente de verdad.** El contenido de la metodología en markdown. La versión más alta es la vigente. |
| `BRAIN-Metodologia-v{N}.typ` | Fuente Typst del PDF — refleja el `.md` con maquetación. |
| `BRAIN-Metodologia-v{N}.pdf` | PDF compilado (el entregable final). |
| `PROCESO-Actualizacion-BRAIN-Metodologia.md` | **Procedimiento operativo:** cómo versionar, editar y regenerar el PDF. Léelo antes de modificar nada. |
| `CLAUDE.md` | Este archivo. |
| `README.md` | Entrada para humanos. |

## Qué se hizo aquí (resumen)

Se destiló una metodología (los **4 pilares**: Atomizar · Conectar · Curar · Capa IA) en un documento estructurado de 9 secciones, y se construyó un **pipeline de generación de PDF** con Typst (ver Sección 6 del documento y el `PROCESO`). El documento es independiente de cualquier proyecto donde se aplique la metodología.

## Reglas para trabajar en este repo

1. **El markdown es la fuente de verdad.** El PDF es salida derivada — nunca se escribe a mano. Si cambia el contenido: edita el `.md` primero, luego refleja en el `.typ`, luego recompila.
2. **Regenerar el PDF:** `typst compile BRAIN-Metodologia-v{N}.typ BRAIN-Metodologia-v{N}.pdf`. El procedimiento completo (versionado vN→vN+1, checklist, errores comunes de Typst) está en `PROCESO-Actualizacion-BRAIN-Metodologia.md`.
3. **Versionado:** no sobrescribas versiones publicadas; sube de versión (`-v2`, `-v3`…) y conserva las anteriores. (Excepción: un fix de confidencialidad sí limpia la versión vigente en lugar de dejarla circular.)
4. **Atribución fija:** todo entregable lleva el nombre completo *Sebastian Dominguez* en portada, footer y pie final, con © del año en curso. Nunca abreviar.
5. **🔒 Confidencialidad — regla dura:** este documento es **genérico y público**. **NUNCA** incluyas datos de ningún cliente o proyecto real: nombres de empresa, métricas reales (conteos de notas, líneas, talleres), IDs de notas reales, nombres de flujos/productos propietarios, países o entidades específicas. La Sección 8 ("Caso de aplicación") debe permanecer **hipotética e ilustrativa**. Si te piden incorporar un caso real, anonimízalo por completo o recházalo.
6. **Paleta de marca propia:** los entregables BRAIN usan su paleta propia (navy `1A1A2E` / coral `E94560`). No mezclar con la paleta de ningún proyecto cliente.

## Si te piden aplicar la metodología a un proyecto nuevo

Este repo **describe** la metodología pero no es un vault operativo. Para construir un vault BRAIN en un proyecto nuevo, sigue la estructura genérica de la **Sección 4** del documento (carpetas `00-MOC/` … `09-Estrategia/`, frontmatter estándar, wikilinks) y los principios de la **Sección 7**. El vault del proyecto vive en el repo de ese proyecto, **nunca aquí**.
