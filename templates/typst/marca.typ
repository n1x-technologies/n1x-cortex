// ═══════════════════════════════════════════════════════════════════
// marca.typ — CONFIGURACIÓN DE MARCA
// ───────────────────────────────────────────────────────────────────
// Esto es LO ÚNICO que editas para re-marcar el template a tu proyecto
// o empresa. El motor (plantilla.typ) no se toca.
//
// ¿Sin logo? Deja logo-light / logo-dark en `none` y se usa el wordmark
// tipográfico. ¿Con logo? Pon tus PNG en assets/ y referencia el path.
// ═══════════════════════════════════════════════════════════════════

// ── Identidad ──────────────────────────────────────────────────────
#let brand-name = "Tu Empresa"     // aparece en el footer y en "PREPARADO POR"
#let wordmark   = "TU MARCA"       // texto grande en la portada SI no hay logo
#let eyebrow    = none             // sub-etiqueta opcional bajo el logo, ej: "DIVISIÓN X" — o none

// ── Logos (opcionales) ─────────────────────────────────────────────
// Pon tus archivos en assets/ y descomenta. Deja `none` para usar el wordmark.
#let logo-light = none             // logo claro para la PORTADA (fondo oscuro). Ej: "assets/logo-blanco.png"
#let logo-dark  = none             // logo oscuro para el FOOTER (fondo claro).  Ej: "assets/logo-negro.png"

// ── Colores ────────────────────────────────────────────────────────
#let primary   = rgb("292929")     // primario oscuro: banners, cabeceras de tabla, portada
#let secondary = rgb("E5E5E5")     // claro: detalles y acentos en la portada
#let accent    = primary           // acento (borde superior de métricas). Por defecto = primary.
