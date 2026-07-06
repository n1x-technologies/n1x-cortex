// toolkit/src/atomize/bootstrap/chunk.ts
//
// Split an oversized code file into line-boundary chunks that each fit the
// model budget. No parsing — purely size-based, order-preserving, lossless.

export function chunkCode(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const lines = text.split('\n');
  const chunks: string[] = [];
  let current: string[] = [];
  let len = 0;
  for (const line of lines) {
    const add = line.length + (current.length ? 1 : 0); // +1 for the rejoining '\n'
    if (current.length && len + add > maxChars) {
      chunks.push(current.join('\n'));
      current = [];
      len = 0;
    }
    current.push(line);
    len += current.length === 1 ? line.length : add;
  }
  if (current.length) chunks.push(current.join('\n'));
  return chunks;
}
