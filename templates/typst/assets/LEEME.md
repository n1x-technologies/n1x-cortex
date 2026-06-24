# assets/

Pon aquí los **logos de tu marca** y referencia los archivos desde `marca.typ`.

Recomendado (PNG con fondo transparente, recortados sin margen):

- `logo-blanco.png` — versión clara, para la **portada** (fondo oscuro) → `logo-light` en `marca.typ`.
- `logo-negro.png` — versión oscura, para el **footer** (fondo claro) → `logo-dark` en `marca.typ`.

Recortar el margen sobrante de un logo (requiere ImageMagick):

```bash
magick logo.png -trim +repage logo-recortado.png
```

Si no pones logos, la plantilla usa el **wordmark** tipográfico (texto `wordmark` de `marca.typ`). Funciona perfectamente sin imágenes.

> Este repo es genérico/abierto: **no incluye logos de ninguna marca**. Cada quien agrega los suyos.
