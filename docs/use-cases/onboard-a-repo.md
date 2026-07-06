# Onboard a legacy or undocumented repo

*A use case for N1X Cortex.*

You just cloned a large codebase with no docs. Instead of grepping for hours, let Cortex read the whole thing into a **cited map** you can ask questions of.

## The 3-minute setup
```bash
cd the-repo
cortex init                                                      # adopt the repo as a vault
cortex bootstrap . --model anthropic:claude-3-5-sonnet --write   # read every file into cited notes
cortex viz                                                       # see the map
```
Run it without `--write` first to preview the file plan **for free** (it calls no model). One `cortex undo` reverses the whole from-zero run.

## Then just ask
```bash
cortex query "how does auth token refresh work?"
```
You get a **cited answer** — the exact notes (and source files) it came from — in ~1.3k tokens, not the whole repo. Ask instead of grep.

## Why it beats reading the code cold
- Every answer names its source file — verifiable, no guessing.
- **~159× less context** than dumping files into an AI (see [the numbers](../../bench/)).
- Any language; `discover` skips binaries, vendored dirs, and lockfiles.
- Nothing leaves your machine.

**Next:** keep the map fresh automatically as the code changes → [Symbiont](symbiont.md).
