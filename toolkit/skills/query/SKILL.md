---
name: query
description: Use when the user asks a question that should be answered from the Cortex knowledge graph — "what does the vault say about X", "find the rule for Y", or /query <question>. Runs cited retrieval over the vault and answers grounded in the returned notes, always citing sources.
---

# Answer from the Cortex knowledge graph (cited)

You are the **AI layer** over Cortex retrieval. The `cortex` toolkit does the deterministic, hybrid lexical+semantic retrieval; you synthesize a grounded, **cited** answer from what it returns. You never answer from memory when the graph has the answer.

## Procedure

1. **Resolve the CLI.** Build the path to `toolkit/dist/cli.js` (run `npm run build` in `toolkit/` first if `dist/` is missing). Run all commands from the vault directory.

2. **Retrieve.** Run `node <cli> query "<question>" --json` and parse the JSON:
   ```json
   {
     "question": "...",
     "anchors": ["..."],
     "hits": [
       { "path": "...", "id": "...", "title": "...", "type": "...", "score": 0.0, "excerpt": "...", "source": "...", "via": "anchor|link" }
     ],
     "sources": ["..."]
   }
   ```
   - `hits` are the relevant notes, best first. `via: "anchor"` means a direct match; `via: "link"` means it was reached through a wikilink (graph neighborhood).
   - `sources` are the original source documents behind the hits — the citation set.

3. **Read before answering when needed.** The `excerpt` is a snippet. If a hit is central to the answer, **read the note at its `path`** for the full content rather than relying on the excerpt alone.

4. **Synthesize a grounded answer.**
   - Answer **only** from the retrieved notes. If the hits don't cover the question, say so plainly and suggest atomizing the relevant source (or widening the question) — do not fill the gap from general knowledge.
   - **Cite every claim.** Reference the note title and/or its `source`. End with a short *Sources* list drawn from `sources` and the hit `path`s.
   - Prefer notes with higher `score` and `via: "anchor"`; use `via: "link"` hits as supporting context.

5. **If retrieval is empty.** Report that nothing in the graph matches, name the closest `anchors` tried, and offer next steps (`/atomize <source>` to add the missing knowledge, or rephrase).

## Notes

- **Read-only.** `query` never writes; this skill only reads the vault and the retrieval output.
- **Semantic search is optional.** If the embedding store is absent, retrieval degrades to lexical TF-IDF (the toolkit prints a one-line hint to run `cortex embed`). Answers are still valid; cross-language/paraphrase recall is just lower.
- **Citations are mandatory** — an answer without a source is a bug. The whole point of Cortex is that every answer traces back to the graph.
