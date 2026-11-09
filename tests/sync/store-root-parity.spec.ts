// tests/sync/store-root-parity.spec.ts — core must resolve the store root exactly as
// the plugin does. Core cannot import the plugin, so the shared fixture is the contract
// and each side asserts its own implementation against its own copy.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveStoreRoot } from '../../src/host/sync/store-root.js';

type Row = { name: string; opts: any; expected: { root: string; mode: string } };
const table = JSON.parse(readFileSync(join(__dirname, '..', 'fixtures', 'store-root-cases.json'), 'utf8')) as Row[];

describe('store root resolution', () => {
  for (const row of table) {
    it(row.name, () => {
      expect(resolveStoreRoot(row.opts)).toEqual(row.expected);
    });
  }

  it('treats a symlinked home as production, not isolated', () => {
    const { mkdtempSync, symlinkSync } = require('node:fs');
    const { tmpdir } = require('node:os');
    const real = mkdtempSync(join(tmpdir(), 'core-root-'));
    const link = `${real}-link`;
    symlinkSync(real, link);
    expect(resolveStoreRoot({ env: { DSH_HOME: join(real, '.dsh') }, home: link })).toEqual({
      root: join(real, '.maestro-memory'),
      mode: 'default',
    });
  });
});
