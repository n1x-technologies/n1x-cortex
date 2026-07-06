// toolkit/src/curate/md2typ.ts
const B = '';   // bold placeholder
const I = '';   // italic placeholder

function inline(text: string): string {
  let t = text;
  // emphasis & wikilinks → placeholders (so escaping doesn't touch their markers)
  t = t.replace(/\*\*([^*]+)\*\*/g, (_m, c) => `${B}${c}${B}`);
  t = t.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, a, b) => `${B}${(b ?? a).trim()}${B}`);
  t = t.replace(/(?<![\\\w*])\*([^*]+)\*/g, (_m, c) => `${I}${c}${I}`);
  t = t.replace(/(?<![\\\w])_([^_]+)_/g, (_m, c) => `${I}${c}${I}`);
  // escape stray Typst specials in the remaining literal text
  t = t.replace(/([#$@])/g, '\\$1');
  // render placeholders as Typst markup
  t = t.replace(new RegExp(`${B}([^${B}]*)${B}`, 'g'), '*$1*');
  t = t.replace(new RegExp(`${I}([^${I}]*)${I}`, 'g'), '_$1_');
  return t;
}

export function mdToTyp(markdown: string, headingShift: number): string {
  return markdown.split('\n').map(line => {
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      const level = Math.min(h[1].length + headingShift, 6);
      return '='.repeat(level) + ' ' + inline(h[2]);
    }
    const b = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (b) return `${b[1]}- ${inline(b[2])}`;
    if (line.trim() === '') return '';
    return inline(line);
  }).join('\n');
}
