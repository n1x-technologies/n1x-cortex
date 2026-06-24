# Guía del README — estándar N1X Cortex

Cómo se ve un buen README en N1X. La plantilla rellenable está en [`PLANTILLA-README.md`](PLANTILLA-README.md).

## Principios

1. **Se entiende en 30 segundos.** Header centrado + tagline + badges → un humano sabe qué es y en qué estado está sin leer todo.
2. **Mostrar, no contar.** Tablas "antes/después", diagramas mermaid (GitHub los renderiza nativo), tablas de navegación. Un diagrama vale más que tres párrafos.
3. **Navegable.** Tabla de contenido + una tabla "Si quieres… → empieza por" que enruta al lector al archivo correcto.
4. **Honesto sobre el estado.** Un bloque de estado con lo hecho (✅) y lo pendiente. No vender humo.
5. **Cierre con marca.** Footer centrado con © y atribución.

## Anatomía (secciones en orden)

| Sección | Para qué | ¿Obligatoria? |
|---|---|---|
| Header centrado + badges | Qué es + estado de un vistazo | ✅ |
| `> [!IMPORTANT]` | Aclarar qué ES / qué NO es el repo | ✅ |
| Tabla de contenido | Navegación | Si el README es largo |
| ¿Qué es? (+ tabla antes/después) | El valor | ✅ |
| Estado | Avance verificable | ✅ |
| Estructura del repositorio | Árbol comentado | ✅ |
| Arquitectura (mermaid + tabla) | Decisiones técnicas | Si aplica |
| Cómo empezar / navegar | Enrutar al lector | ✅ |
| Próximos pasos | Qué sigue | Recomendada |
| Licencia | Términos | ✅ |
| Footer centrado | Marca + © | ✅ |

## Badges (shields.io)

Formato: `![Etiqueta](https://img.shields.io/badge/etiqueta-valor-COLOR)`. Espacios → `_`, guiones → `--`. Colores de marca N1X: navy `1A1A2E`, coral `E94560`, o el primario del proyecto.

## Reglas

- **Emojis en el README: OK.** GitHub los renderiza y ayudan a escanear. (Ojo: en los **PDFs/documentos** la regla es la opuesta — cero emojis. Ver `templates/typst/`.)
- **Diagramas en mermaid**, no imágenes (se versiona, se edita, GitHub lo pinta).
- **README al día en cada push** (convención N1X Cortex): si el push cambia estructura, archivos o decisiones, el README se actualiza en el mismo push. Un README desactualizado es un bug.

## Referencias vivas (ejemplos de este estándar)

- `n1x-cortex/README.md` — repo de metodología (open source).
- `n1x-transport/README.md` — proyecto/producto (privado).
