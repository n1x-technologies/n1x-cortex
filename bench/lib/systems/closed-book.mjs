// Contamination control, not a baseline anyone would ship. Any question the
// answering model gets right with NO context was already known from
// pretraining; those questions are excluded from the headline metrics because
// they compress the difference between every system.
export const name = 'closed-book';

// The control must be identified by declaration, never inferred from an
// empty payload. answer.mjs used to select the closed-book system prompt
// whenever promptPayload was falsy — but a GROUNDED system (grep-agent,
// cortex on a zero-hit question, naive-rag on an empty chunk set) can also
// return '' when it has nothing to say, and that is a broken run, not a
// quietly different measurement. This flag is threaded through runStageB to
// answer() so the closed-book prompt is chosen explicitly.
export const closedBook = true;

// It retrieves nothing, so it ranks nothing. Without this, an explicit
// `--systems closed-book --stage a` published recall@5 0.000 and near-miss
// 0.000 for a system with no retriever — fabricated data points that read as
// "measured zero relevance" rather than "not applicable". The default Stage A
// system list excludes it, so only an explicit invocation ever hit this.
export const ranks = false;

export async function run() {
  return { promptPayload: '', citedPaths: [], latencyMs: 0, retrievalTokens: 0 };
}
