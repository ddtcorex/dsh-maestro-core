// tests/hashing.spec.ts
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { hashFiles } from '../../src/host/sync/hashing.js';

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

describe('hashFiles', () => {
  it('hashes all paths, sorted, with correct sha+size', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hash-'));
    try {
      fs.mkdirSync(path.join(root, 'maestro-memory', 'daily'), { recursive: true });
      const f1 = path.join(root, 'maestro-memory', 'b.md');
      fs.writeFileSync(f1, 'bbb');
      const f2 = path.join(root, 'maestro-memory', 'a.md');
      fs.writeFileSync(f2, 'aaa');
      const out = await hashFiles(fs, root, ['maestro-memory/b.md', 'maestro-memory/a.md']);
      expect(out.map((h) => h.path)).toEqual(['maestro-memory/a.md', 'maestro-memory/b.md']);
      expect(out[0]!.sha256).toBe(sha(Buffer.from('aaa')));
      expect(out[1]!.size).toBe(3);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports progress per file and hashes a large file correctly', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hash2-'));
    try {
      fs.mkdirSync(path.join(root, 'maestro-memory'));
      const big = path.join(root, 'maestro-memory', 'big.md');
      fs.writeFileSync(big, Buffer.alloc(2 * 1024 * 1024, 0x61));
      const ticks: string[] = [];
      const out = await hashFiles(fs, root, ['maestro-memory/big.md'], { onFile: (h) => ticks.push(h.path) });
      expect(ticks).toEqual(['maestro-memory/big.md']);
      expect(out[0]!.size).toBe(2 * 1024 * 1024);
      expect(sha(fs.readFileSync(big))).toBe(out[0]!.sha256);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});