// Turns retrieved hits into the exact text a calling agent would place in its
// prompt. This is the unit of cost, so it must be the *realistic* payload: the
// full note body, as the query -> get_note path would fetch, not the excerpt.
//
// Deliberately NOT JSON. The old bench measured `JSON.stringify(r, null, 2)`,
// whose indentation inflated the count and understated Cortex.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {{path: string, title: string, excerpt: string}[]} hits
 * @param {string} vaultDir
 * @param {number} [maxChars] per-note truncation
 * @returns {string}
 */
export function renderPayload(hits, vaultDir, maxChars = 2000) {
  return hits.map(h => {
    let body = h.excerpt || '';
    try {
      body = readFileSync(join(vaultDir, h.path), 'utf8');
    } catch {
      // keep the excerpt when the file cannot be read
    }
    return `### ${h.title} (${h.path})\n${body.slice(0, maxChars)}`;
  }).join('\n\n');
}
