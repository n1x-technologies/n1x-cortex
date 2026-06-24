// ═══════════════════════════════════════════════════════════════════
// brand.typ — BRAND CONFIGURATION
// ───────────────────────────────────────────────────────────────────
// This is THE ONLY thing you edit to re-brand the template to your project
// or company. The engine (template.typ) is never touched.
//
// No logo? Leave logo-light / logo-dark as `none` and the typographic
// wordmark is used instead. Have a logo? Put your PNGs in assets/ and
// reference the path.
// ═══════════════════════════════════════════════════════════════════

// ── Identity ───────────────────────────────────────────────────────
#let brand-name = "Your Company"   // appears in the footer and in "PREPARED BY"
#let wordmark   = "YOUR BRAND"     // large text on the cover IF there is no logo
#let eyebrow    = none             // optional sub-label under the logo, e.g. "DIVISION X" — or none

// ── Logos (optional) ───────────────────────────────────────────────
// Put your files in assets/ and uncomment. Leave `none` to use the wordmark.
#let logo-light = none             // light logo for the COVER (dark background). E.g. "assets/logo-white.png"
#let logo-dark  = none             // dark logo for the FOOTER (light background).  E.g. "assets/logo-black.png"

// ── Colors ─────────────────────────────────────────────────────────
#let primary   = rgb("292929")     // dark primary: banners, table headers, cover
#let secondary = rgb("E5E5E5")     // light: details and accents on the cover
#let accent    = primary           // accent (top border of metrics). Defaults to primary.
