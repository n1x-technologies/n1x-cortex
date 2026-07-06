# Give your AI agent real memory

*A use case for N1X Cortex.*

AI coding agents forget everything between sessions — and when they do "remember," they often make it up. Cortex gives any agent a **local, cited, reversible long-term memory** over MCP.

## Wire it to your agent
```bash
cortex mcp install --write        # register the MCP server (read + reversible capture)
```
Now any MCP agent — Claude Code, Copilot (agent mode), Cursor, Cline — can:
- **read** it: `cortex_query` (cited answers) · `cortex_get_note` (full note)
- **write back**: `cortex_atomize_apply` (capture new knowledge as drafts) · `cortex_undo`

## Why it's memory you can trust
- **Grounded** — answers come from cited notes, so the agent stops fabricating (measured: confidently-wrong **25–63% → 0–13%**, see [the numbers](../../bench/)).
- **Provenance** — every answer names its source.
- **Reversible** — every write is backed up; `cortex_undo` reverses it; `Markdown/` sources are never modified.
- **Opt-in & local** — you grant write access at launch, nothing leaves the machine, and there's an audit log (`.cortex/mcp-writes.log`).

**Next:** let it capture knowledge on its own, in the background → [Symbiont](symbiont.md).
