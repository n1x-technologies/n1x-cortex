# A team's single source of truth

*A use case for N1X Cortex.*

Team knowledge is scattered across docs, wikis, and people's heads, and nobody fully trusts it, so agents can't use it either. Point Cortex at one shared markdown vault (a git repo) and it becomes a **verifiable knowledge base** that people *and* agents read from and write back to.

## The shape
- A git repo of markdown notes is the shared vault.
- Everyone, and every MCP agent, queries it with cited answers: `cortex query "..."`.
- New knowledge is captured back as drafts, reviewed like code (PRs), then promoted.

## Keep it healthy
```bash
cortex gaps          # thin / stale / uncited notes worth capturing
cortex dupes         # near-duplicate notes -> merge candidates
cortex verify --all  # incomplete notes across the whole vault
cortex merge  ...     # fold a duplicate pair into one (reversible)
cortex promote        # graduate reviewed drafts out of _inbox/
```

## Why a team trusts it
- **Cited**: every answer names its source note; provenance settles "says who?".
- **Curated**: diagnostics keep it from rotting.
- **Reviewable**: writes land as `draft`s in `_inbox/`; your normal PR review applies before they're promoted.
- **Agent-ready**: the same cited base is a tool for every agent on the team, over MCP.

**Related:** [give an agent memory](agent-memory.md) · [Symbiont](symbiont.md).
