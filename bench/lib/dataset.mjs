// Question sets are .jsonl so records stay diffable and appendable. Validation
// is strict and fails the whole load: a stale gold path deflates recall for
// every system simultaneously, which reads as a quality regression instead of
// a broken dataset.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @typedef {Object} Question
 * @property {string} id
 * @property {string} question
 * @property {string[]} goldPaths   vault-relative paths that answer it
 * @property {string} goldAnswer
 * @property {string|null} sourceUrl
 */

const REQUIRED = ['id', 'question', 'goldPaths', 'goldAnswer'];

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

    for (const field of REQUIRED) {
      if (rec[field] === undefined || rec[field] === null || rec[field] === '') {
        throw new Error(`${jsonlPath} line ${i + 1}: missing required field "${field}"`);
      }
    }
    if (!Array.isArray(rec.goldPaths) || rec.goldPaths.length === 0) {
      throw new Error(`${jsonlPath} line ${i + 1} (${rec.id}): "goldPaths" must be a non-empty array`);
    }
    if (seen.has(rec.id)) {
      throw new Error(`${jsonlPath} line ${i + 1}: duplicate id "${rec.id}"`);
    }
    seen.add(rec.id);

    for (const p of rec.goldPaths) {
      if (!existsSync(join(vaultDir, p))) {
        throw new Error(
          `${jsonlPath} line ${i + 1} (${rec.id}): goldPath "${p}" does not exist in corpus ${vaultDir}`,
        );
      }
    }

    out.push({
      id: rec.id,
      question: rec.question,
      goldPaths: rec.goldPaths,
      goldAnswer: rec.goldAnswer,
      sourceUrl: rec.sourceUrl ?? null,
    });
  });

  if (out.length === 0) throw new Error(`${jsonlPath}: no records`);
  return out;
}
