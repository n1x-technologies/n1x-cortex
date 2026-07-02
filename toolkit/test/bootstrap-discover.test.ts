import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discover } from '../src/atomize/bootstrap/discover.js';
import { loadConfig } from '../src/config.js';

function gitRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-disc-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  writeFileSync(join(dir, '.gitignore'), 'ignored.txt\nsecret/\n');
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'foo.ts'), 'export const x = 1;\n');
  writeFileSync(join(dir, 'README.md'), '# Hi\n');
  writeFileSync(join(dir, 'ignored.txt'), 'nope\n');
  mkdirSync(join(dir, 'secret'));
  writeFileSync(join(dir, 'secret', 's.ts'), 'export const s = 1;\n');
  mkdirSync(join(dir, 'node_modules', 'p'), { recursive: true });
  writeFileSync(join(dir, 'node_modules', 'p', 'i.js'), 'module.exports=1;\n');
  writeFileSync(join(dir, 'package-lock.json'), '{}\n');
  writeFileSync(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x00, 0x01, 0x02])); // null byte → binary
  return dir;
}

describe('discover', () => {
  it('classifies code/doc and respects .gitignore + skip rules', () => {
    const dir = gitRepo();
    const { files, skipped } = discover(dir, loadConfig(dir, []));
    const paths = files.map(f => f.path).sort();
    expect(paths).toContain('src/foo.ts');
    expect(paths).toContain('README.md');
    expect(files.find(f => f.path === 'src/foo.ts')!.kind).toBe('code');
    expect(files.find(f => f.path === 'README.md')!.kind).toBe('doc');
    // gitignored, vendored, lockfile, binary all excluded from files
    for (const p of ['ignored.txt', 'secret/s.ts', 'node_modules/p/i.js', 'package-lock.json', 'logo.png']) {
      expect(paths).not.toContain(p);
    }
    // binary + lockfile appear in skipped with a reason
    expect(skipped.some(s => s.path === 'logo.png' && /binary/i.test(s.reason))).toBe(true);
  });
});
