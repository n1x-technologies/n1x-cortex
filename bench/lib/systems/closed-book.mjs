// Contamination control, not a baseline anyone would ship. Any question the
// answering model gets right with NO context was already known from
// pretraining; those questions are excluded from the headline metrics because
// they compress the difference between every system.
export const name = 'closed-book';

export async function run() {
  return { promptPayload: '', citedPaths: [], latencyMs: 0, retrievalTokens: 0 };
}
