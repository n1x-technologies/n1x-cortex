# assets/

Put your **brand logos** here and reference the files from `brand.typ`.

Recommended (PNG with a transparent background, cropped without margins):

- `logo-white.png` — light version, for the **cover** (dark background) → `logo-light` in `brand.typ`.
- `logo-black.png` — dark version, for the **footer** (light background) → `logo-dark` in `brand.typ`.

Trim the leftover margin around a logo (requires ImageMagick):

```bash
magick logo.png -trim +repage logo-cropped.png
```

If you don't add logos, the template falls back to the typographic **wordmark** (the `wordmark` text from `brand.typ`). It works perfectly without images.

> This repo is generic and open: **it ships no logos for any brand**. Everyone adds their own.
