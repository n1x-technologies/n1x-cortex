import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapPlanTool, bootstrapEmitTool } from '../src/mcp/tools-bootstrap.js';
import { DISTILL_METHODOLOGY_CODE } from '../src/atomize/methodology.js';

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cortex-mcpboot-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  return dir;
}

describe('bootstrap MCP tools', () => {
  it('bootstrap_plan returns the manifest', () => {
    const dir = repo();
    const plan = bootstrapPlanTool(dir);
    expect(plan.files.some(f => f.path === 'src/a.ts' && f.kind === 'code')).toBe(true);
  });
  it('bootstrap_emit returns the code worksheet for one file', () => {
    const dir = repo();
    const w = bootstrapEmitTool(dir, { path: 'src/a.ts', kind: 'code' });
    expect(w.source).toBe('src/a.ts');
    expect(w.instructions).toBe(DISTILL_METHODOLOGY_CODE);
  });
  it('bootstrap_emit rejects a vault-escape path', () => {
    const dir = repo();
    expect(() => bootstrapEmitTool(dir, { path: '../outside', kind: 'code' })).toThrow(/escape/i);
  });
  it('bootstrap_emit rejects a non-manifest / excluded file', () => {
    const dir = repo();
    writeFileSync(join(dir, '.env'), 'SECRET=1\n');
    expect(() => bootstrapEmitTool(dir, { path: '.env', kind: 'doc' })).toThrow(/not a bootstrap-eligible file/i);
  });
});
