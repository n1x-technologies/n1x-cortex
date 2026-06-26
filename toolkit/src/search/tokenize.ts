const STOP = new Set([
  'the','a','an','of','to','in','and','or','is','are','be','for','on','with','that','this','it','as','at','by','from',
  'de','la','el','los','las','un','una','y','o','en','para','del','al','que','con','por','se','su','lo','es','son',
]);

export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return raw.filter(t => {
    // Keep numbers even if 1 char; drop 1-char letters and stopwords
    if (/^\d+$/.test(t)) return true;
    return t.length > 1 && !STOP.has(t);
  });
}
