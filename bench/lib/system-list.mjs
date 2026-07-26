// Which system module names run through Stage A vs Stage B by default.
//
// grep-agent and closed-book are deliberately excluded from Stage A's
// default list: grep-agent's retrieval is itself LLM-driven (Stage A's ctx
// carries no llm, so it would error on every question) and closed-book
// retrieves nothing (it would show 0 recall on everything) — neither has a
// meaningful offline retrieval metric, and running them through Stage A
// anyway produces rows that LOOK like real measurements (an error count, a
// recall number) but aren't. Matching the exclusion rationale while still
// appearing in Stage A's output IS the defect this file exists to prevent.
export const STAGE_A_DEFAULT_SYSTEMS = ['cortex', 'cortex-lexical', 'cortex-semantic', 'naive-rag', 'full-context'];
export const STAGE_B_ONLY_SYSTEMS = ['grep-agent', 'closed-book'];

/**
 * Selects the system module names for Stage A and Stage B.
 *
 * An explicit `requested` list (the CLI's --systems flag) is honored
 * verbatim for BOTH stages: the caller named exactly the systems they want,
 * so we never silently filter one back out. Only the DEFAULT (no --systems)
 * lists are split — Stage A always gets the base five; Stage B additionally
 * gets grep-agent/closed-book, but only when the stage being run is "ab".
 *
 * @param {{ stage: 'a'|'ab', requested?: string[] }} p
 * @returns {{ stageA: string[], stageB: string[] }}
 */
export function selectSystemNames({ stage, requested }) {
  if (requested) return { stageA: requested, stageB: requested };

  const stageB = stage === 'ab'
    ? [...STAGE_A_DEFAULT_SYSTEMS, ...STAGE_B_ONLY_SYSTEMS]
    : STAGE_A_DEFAULT_SYSTEMS;

  return { stageA: STAGE_A_DEFAULT_SYSTEMS, stageB };
}
