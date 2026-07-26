// Question sets are .jsonl so records stay diffable and appendable. Validation
// is strict and fails the whole load: a stale gold path deflates recall for
// every system simultaneously, which reads as a quality regression instead of
// a broken dataset. A trap question — one the corpus does not answer — is
// declared with answerable: false and names the notes that make it a near
// miss in nearMissPaths; it must not carry a goldAnswer or goldPaths.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {Object} Question
 * @property {string} id
 * @property {string} question
 * @property {string[]} goldPaths   vault-relative paths that answer it (answerable only)
 * @property {string|null} goldAnswer   null for a trap question
 * @property {string|null} sourceUrl
 * @property {boolean} answerable   false marks a trap the corpus cannot answer
 * @property {string[]} nearMissPaths   vault-relative paths that make a trap a near miss
 */

/**
 * @param {string} jsonlPath
 * @param {string} vaultDir  corpus root; every goldPath must exist under it
 * @returns {Question[]}
 */
export function loadDataset(jsonlPath, vaultDir) {
  const lines = readFileSync(jsonlPath, 'utf8').split('\n');
  const out = [];
  const seen = new Set();

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let rec;
    try {
      rec = JSON.parse(trimmed);
    } catch (e) {
      throw new Error(`${jsonlPath} line ${i + 1}: malformed JSON — ${e.message}`);
    }

    const answerable = rec.answerable !== false;
    const where = `${jsonlPath} line ${i + 1} (${rec.id ?? 'no id'})`;

    for (const field of ['id', 'question']) {
      if (rec[field] === undefined || rec[field] === null || rec[field] === '') {
        throw new Error(`${jsonlPath} line ${i + 1}: missing required field "${field}"`);
      }
    }
    if (seen.has(rec.id)) {
      throw new Error(`${jsonlPath} line ${i + 1}: duplicate id "${rec.id}"`);
    }
    seen.add(rec.id);

    if (answerable) {
      if (rec.goldAnswer === undefined || rec.goldAnswer === null || rec.goldAnswer === '') {
        throw new Error(`${where}: missing required field "goldAnswer"`);
      }
      if (!Array.isArray(rec.goldPaths) || rec.goldPaths.length === 0) {
        throw new Error(`${where}: "goldPaths" must be a non-empty array`);
      }
      if (Array.isArray(rec.nearMissPaths) && rec.nearMissPaths.length) {
        throw new Error(
          `${where}: "nearMissPaths" belongs to a trap question (answerable: false), ` +
            'not to an answerable one',
        );
      }
      for (const p of rec.goldPaths) {
        if (!existsSync(join(vaultDir, p))) {
          throw new Error(`${where}: goldPath "${p}" does not exist in corpus ${vaultDir}`);
        }
      }
    } else {
      // A trap is a question the corpus does not answer. A leftover goldAnswer
      // or goldPaths from a half-edited copy would make the record read as a
      // trap while carrying an answer nothing consumes, and the next reader
      // cannot tell which field governs. Reject rather than ignore.
      if (rec.goldAnswer !== undefined && rec.goldAnswer !== null) {
        throw new Error(`${where}: a trap question must not carry a "goldAnswer"`);
      }
      if (Array.isArray(rec.goldPaths) && rec.goldPaths.length) {
        throw new Error(`${where}: a trap question must not carry "goldPaths"`);
      }
      if (!Array.isArray(rec.nearMissPaths) || rec.nearMissPaths.length === 0) {
        throw new Error(
          `${where}: a trap question requires a non-empty "nearMissPaths" naming the notes ` +
            'that make it a near miss',
        );
      }
      for (const p of rec.nearMissPaths) {
        if (!existsSync(join(vaultDir, p))) {
          throw new Error(`${where}: nearMissPath "${p}" does not exist in corpus ${vaultDir}`);
        }
      }
    }

    out.push({
      id: rec.id,
      question: rec.question,
      goldPaths: answerable ? rec.goldPaths : [],
      goldAnswer: answerable ? rec.goldAnswer : null,
      sourceUrl: rec.sourceUrl ?? null,
      answerable,
      nearMissPaths: answerable ? [] : rec.nearMissPaths,
    });
  });

  if (out.length === 0) throw new Error(`${jsonlPath}: no records`);
  return out;
}
