#!/usr/bin/env python3
"""
convert-md.py — converts a Markdown file to a .typ using this template.

Pipeline: markdown -> (pandoc -t typst) -> post-processing -> #import template -> done.
Handles: removing the title block (the cover supplies it), replacing mermaid diagrams,
unwrapping tables so they break across pages, and cleaning out emojis.

Requirements: pandoc (with typst output) and typst in PATH. Run from this folder.
Then: typst compile output.typ output.pdf

Usage: edit the __main__ section with your document, or import build().
"""
import re, subprocess, tempfile, os

def build(md_path, out_typ, *, title, subtitle, doc_label="Document",
          client="", date="", version="v1.0", header_title="",
          mermaid_repl=None):
    md = open(md_path, encoding="utf-8").read()

    # 1) remove the title block "# ..." and the "### ..." that follows it (the cover supplies it)
    lines = md.split("\n")
    for idx, l in enumerate(lines):
        if l.startswith("# "):
            del lines[idx]
            if idx < len(lines) and lines[idx].startswith("### "):
                del lines[idx]
            break
    md = "\n".join(lines)

    # 2) replace mermaid blocks (e.g. a gantt -> markdown table); remove the rest
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

    # 4) unwrap tables from the wrapper #figure(align(center)[#table(...)]) -> #table(...)
    #    (otherwise long tables do NOT break across pages and leave orphan headers)
    body = body.replace("#figure(\n  align(center)[", "")
    body = body.replace("]\n  , kind: table\n  )", "")

    # 5) checklist-style tables (first column centered, e.g. a checkbox): narrow column.
    #    pandoc tends to distribute the width poorly (gives ~45% to a checkbox column).
    body = re.sub(r"    columns: \([0-9.]+%, [0-9.]+%, [0-9.]+%\),\n    align: \(center,auto,auto,\),",
                  "    columns: (1.5cm, 1fr, 0.9fr),\n    align: (center + horizon, left, left),", body)
    #    (other tables with poorly distributed columns: adjust `columns:` by hand in the .typ)

    # 6) clean out emojis. ⬜ -> drawn checkbox; remove ✅ 🏁 🔵 🔧 (anti-"auto-generated" rule)
    body = body.replace("⬜", "#chk ")
    for e in ["✅ ", "✅", "🏁 ", "🏁", "🔵 ", "🔵", "🔧 ", "🔧"]:
        body = body.replace(e, "")

    # 7) prepend import + show
    head = f'''#import "template.typ": *

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
    # EXAMPLE — edit with your document:
    build("my-document.md", "my-document.typ",
          title="Title", subtitle="Subtitle",
          doc_label="Proposal", client="Client", date="June 2026",
          header_title="My document")
