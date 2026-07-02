const STOP = new Set([
  'the','a','an','of','to','in','and','or','is','are','be','for','on','with','that','this','it','as','at','by','from',
  'de','la','el','los','las','un','una','y','o','en','para','del','al','que','con','por','se','su','lo','es','son',
]);

const COMBINING_ACUTE_AND_DIAERESIS = /[́̈]/g;

// Fold acute accents and diaeresis (á/é/í/ó/ú/ü -> a/e/i/o/u) so accented and
// unaccented spellings match as the same token. Deliberately leaves the
// combining tilde (̃) untouched so "ñ" is not merged into "n" (anõ != ano).
function foldAccents(text: string): string {
  return text.normalize('NFD').replace(COMBINING_ACUTE_AND_DIAERESIS, '').normalize('NFC');
}

export function tokenize(text: string): string[] {
  const raw = foldAccents(text.toLowerCase()).match(/[\p{L}\p{N}]+/gu) ?? [];
  return raw.filter(t => {
    // Keep numbers even if 1 char; drop 1-char letters and stopwords
    if (/^\d+$/.test(t)) return true;
    return t.length > 1 && !STOP.has(t);
  });
}
