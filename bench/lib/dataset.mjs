// Question sets are .jsonl so records stay diffable and appendable. Validation
// is strict and fails the whole load: a stale gold path deflates recall for
// every system simultaneously, which reads as a quality regression instead of
// a broken dataset. A trap question — one the corpus does not answer — is
// declared with answerable: false and names the notes that make it a near
// miss in nearMissPaths; it must not carry a goldAnswer or goldPaths.
import { readFileSync, existsSync, statSync } from 'node:fs';
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

    const where = `${jsonlPath} line ${i + 1} (${rec.id ?? 'no id'})`;

    for (const field of ['id', 'question']) {
      if (rec[field] === undefined || rec[field] === null || rec[field] === '') {
        throw new Error(`${jsonlPath} line ${i + 1}: missing required field "${field}"`);
      }
      if (typeof rec[field] !== 'string') {
        // `id` doubles as a Map/Set key downstream (spot-check.mjs, the
        // contamination filter). A numeric 1 and a string "1" are distinct
        // members of the dedupe Set below but collide or diverge depending on
        // which side builds the key, so the type is pinned here.
        throw new Error(
          `${where}: "${field}" must be a string, got ${typeof rec[field]}`,
        );
      }
    }

    // Trap membership is declared, never inferred, so the declaration has to
    // survive a hand edit. `rec.answerable !== false` silently reads ANY
    // non-false value as answerable — including the string "false", which is
    // what a spreadsheet or CSV-to-JSONL export produces. The record then took
    // the answerable branch and failed with `missing required field
    // "goldAnswer"`, telling the author to invent a gold answer for a question
    // the corpus cannot answer. Worse, a half-edited record carrying a leftover
    // goldAnswer loaded clean and an explicitly-declared trap was scored as an
    // answerable question.
    if (rec.answerable !== undefined && typeof rec.answerable !== 'boolean') {
      throw new Error(
        `${where}: "answerable" must be a boolean, got ${typeof rec.answerable} ` +
          `(${JSON.stringify(rec.answerable)}). A trap question is declared with ` +
          'answerable: false, unquoted.',
      );
    }
    const answerable = rec.answerable !== false;

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
      // Presence, not shape: `"nearMissPaths": "notes/a.md"` written as a bare
      // string is the commonest hand-edit slip, and an Array.isArray guard
      // waves it through to be silently discarded at the bottom of this
      // function. Anything present that is not an empty array is a record
      // whose author meant something the loader is about to throw away.
      if (rec.nearMissPaths !== undefined && !isEmptyArray(rec.nearMissPaths)) {
        throw new Error(
          `${where}: "nearMissPaths" belongs to a trap question (answerable: false), ` +
            'not to an answerable one',
        );
      }
      checkPaths(rec.goldPaths, 'goldPath', where, vaultDir);
    } else {
      // A trap is a question the corpus does not answer. A leftover goldAnswer
      // or goldPaths from a half-edited copy would make the record read as a
      // trap while carrying an answer nothing consumes, and the next reader
      // cannot tell which field governs. Reject rather than ignore.
      if (rec.goldAnswer !== undefined && rec.goldAnswer !== null) {
        throw new Error(`${where}: a trap question must not carry a "goldAnswer"`);
      }
      // Same presence-not-shape rule as nearMissPaths above: a goldPaths
      // written as a bare string is exactly the half-edited state this guard
      // exists to reject, and Array.isArray would let it through.
      if (rec.goldPaths !== undefined && !isEmptyArray(rec.goldPaths)) {
        throw new Error(`${where}: a trap question must not carry "goldPaths"`);
      }
      if (!Array.isArray(rec.nearMissPaths) || rec.nearMissPaths.length === 0) {
        throw new Error(
          `${where}: a trap question requires a non-empty "nearMissPaths" naming the notes ` +
            'that make it a near miss',
        );
      }
      checkPaths(rec.nearMissPaths, 'nearMissPath', where, vaultDir);
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

const isEmptyArray = v => Array.isArray(v) && v.length === 0;

/**
 * Every path a question names must resolve to a real FILE in the corpus.
 *
 * Existence alone is not enough. `existsSync(join(vaultDir, ''))` tests the
 * vault root, which exists, so an empty string — what you get by fixing a
 * trailing comma with an empty element — passes as a path. It can then never
 * match a cited path, so it contributes a permanent 0 to whichever metric
 * consumes it and trips the gate as a retrieval regression the failure message
 * cannot explain. A directory name behaves the same way.
 *
 * The type check exists so a non-string element fails with the file, line and
 * question id every other error in this loader carries, instead of escaping as
 * a bare `path.join` TypeError.
 */
function checkPaths(paths, label, where, vaultDir) {
  for (const p of paths) {
    if (typeof p !== 'string') {
      throw new Error(`${where}: ${label} must be a string, got ${typeof p} (${JSON.stringify(p)})`);
    }
    if (p === '') {
      throw new Error(`${where}: ${label} is an empty string`);
    }
    const full = join(vaultDir, p);
    if (!existsSync(full)) {
      throw new Error(`${where}: ${label} "${p}" does not exist in corpus ${vaultDir}`);
    }
    if (!statSync(full).isFile()) {
      throw new Error(`${where}: ${label} "${p}" is not a file`);
    }
  }
}
