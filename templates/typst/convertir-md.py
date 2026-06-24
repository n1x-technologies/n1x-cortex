#!/usr/bin/env python3
"""
convertir-md.py — convierte un Markdown a un .typ con esta plantilla.

Pipeline: markdown -> (pandoc -t typst) -> post-proceso -> #import plantilla -> listo.
Maneja: quita el bloque de título (lo pone la portada), reemplaza diagramas mermaid,
desenvuelve tablas para que partan entre páginas, y limpia emojis.

Requisitos: pandoc (con salida typst) y typst en PATH. Correr desde esta carpeta.
Luego: typst compile salida.typ salida.pdf

Uso: editar la sección __main__ con tu documento, o importar build().
"""
import re, subprocess, tempfile, os

def build(md_path, out_typ, *, title, subtitle, doc_label="Documento",
          client="", date="", version="v1.0", header_title="",
          mermaid_repl=None):
    md = open(md_path, encoding="utf-8").read()

    # 1) quitar el bloque de título "# ..." y el "### ..." que le sigue (lo pone la portada)
    lines = md.split("\n")
    for idx, l in enumerate(lines):
        if l.startswith("# "):
            del lines[idx]
            if idx < len(lines) and lines[idx].startswith("### "):
                del lines[idx]
            break
    md = "\n".join(lines)

    # 2) reemplazar bloques mermaid (ej. un gantt -> tabla markdown); el resto se elimina
    if mermaid_repl:
        for pat, rep in mermaid_repl:
            md = re.sub(pat, rep, md, flags=re.DOTALL)
    md = re.sub(r"```mermaid.*?```", "", md, flags=re.DOTALL)

    # 3) pandoc md -> typst
    with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False, encoding="utf-8") as f:
        f.write(md); tmp = f.name
    body = subprocess.run(["pandoc", tmp, "-t", "typst"],
                          capture_output=True, text=True, check=True).stdout
    os.unlink(tmp)

    # 4) desenvolver tablas del wrapper #figure(align(center)[#table(...)]) -> #table(...)
    #    (si no, las tablas largas NO parten entre páginas y dejan encabezados huérfanos)
    body = body.replace("#figure(\n  align(center)[", "")
    body = body.replace("]\n  , kind: table\n  )", "")

    # 5) tablas tipo checklist (primera columna centrada, ej. un checkbox): columna angosta.
    #    pandoc suele repartir mal el ancho (le da ~45% a una columna de checkbox).
    body = re.sub(r"    columns: \([0-9.]+%, [0-9.]+%, [0-9.]+%\),\n    align: \(center,auto,auto,\),",
                  "    columns: (1.5cm, 1fr, 0.9fr),\n    align: (center + horizon, left, left),", body)
    #    (otras tablas con columnas mal repartidas: ajusta `columns:` a mano en el .typ)

    # 6) limpiar emojis. ⬜ -> checkbox dibujado; quitar ✅ 🏁 🔵 🔧 (regla anti-"auto-generado")
    body = body.replace("⬜", "#chk ")
    for e in ["✅ ", "✅", "🏁 ", "🏁", "🔵 ", "🔵", "🔧 ", "🔧"]:
        body = body.replace(e, "")

    # 7) anteponer import + show
    head = f'''#import "plantilla.typ": *

#show: doc.with(
  title: "{title}",
  subtitle: "{subtitle}",
  doc-label: "{doc_label}",
  client: "{client}",
  date: "{date}",
  version: "{version}",
  header-title: "{header_title}",
)

'''
    open(out_typ, "w", encoding="utf-8").write(head + body)
    print(f"WROTE {out_typ}  ->  typst compile {out_typ} {out_typ[:-4]}.pdf")


if __name__ == "__main__":
    # EJEMPLO — edita con tu documento:
    build("mi-documento.md", "mi-documento.typ",
          title="Título", subtitle="Subtítulo",
          doc_label="Propuesta", client="Cliente", date="Junio 2026",
          header_title="Mi documento")
