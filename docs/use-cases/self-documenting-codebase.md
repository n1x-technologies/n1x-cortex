# A codebase that documents itself

*A use case for N1X Cortex.*

Documentation drifts the moment code moves. Cortex keeps a **living, cited graph** of your codebase that stays current on its own, and turns it into readable docs on demand.

## Bootstrap once, then let it keep up
```bash
cortex bootstrap . --model anthropic:claude-3-5-sonnet --write   # first pass: whole codebase -> cited notes
# then, in .cortex.json:  "autonomy": "auto-draft"
```
With `autonomy: auto-draft`, the Claude Code lifecycle hooks re-index and distill what you change **in the background**: the graph never falls behind. (That ambient mechanism is [Symbiont](symbiont.md).)

## Turn the graph into docs
```bash
cortex moc <topic>          # a Map-of-Content note that indexes a topic
cortex doc <topic> --pdf    # consolidate a topic into a branded PDF
```
Regenerate these anytime, they're **derived from the current graph**, so they can't silently go stale.

## Why it stays true
- Docs are **derived** from the code's cited graph, not hand-written on the side.
- Ambient capture keeps the graph fresh as the code moves.
- Every claim is **cited** back to a source file.
- Fully local; every write reversible.

**Next:** the always-on mechanism behind the freshness → [Symbiont](symbiont.md).
