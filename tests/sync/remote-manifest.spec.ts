// tests/remote-manifest.spec.ts
import { describe, it, expect } from 'vitest';
import { buildRemoteManifestScript, parseRemoteManifest } from '../../src/host/sync/remote-manifest.js';

describe('remote manifest', () => {
  it('parses NUL-framed sha<TAB>size<TAB>mtime<TAB>rel entries', () => {
    const frame = (rel: string, sha: string, size: number, mtime: number) =>
      Buffer.from(`${sha}\t${size}\t${mtime}\t${rel}\0`, 'utf-8');
    const buf = Buffer.concat([
      frame('maestro-memory/daily/2026-09-01.md', 'a'.repeat(64), 12, 1700000000),
      frame('maestro-memory/notes/inner-file.md', 'b'.repeat(64), 3, 1700000001),
      frame('sessions/abc/def/session.jsonl.zstd', 'c'.repeat(64), 99, 1700000002),
    ]);
    const out = parseRemoteManifest(buf);
    expect(out.map((e) => e.path)).toEqual([
      'maestro-memory/daily/2026-09-01.md',
      'maestro-memory/notes/inner-file.md',
      'sessions/abc/def/session.jsonl.zstd',
    ]);
    expect(out[0]!.sha256).toBe('a'.repeat(64));
    expect(out[0]!.size).toBe(12);
  });

  it('rejects ineligible and unsafe paths (settings, traversal, spaces, newlines in name)', () => {
    const buf = Buffer.concat([
      Buffer.from(`${'0'.repeat(64)}\t1\t1\tsettings.json\0`, 'utf-8'),
      Buffer.from(`${'0'.repeat(64)}\t1\t1\t../../etc/passwd\0`, 'utf-8'),
      Buffer.from(`${'0'.repeat(64)}\t1\t1\tmaestro-memory/notes/space name.md\0`, 'utf-8'), // eligibility forbids whitespace
      Buffer.from(`${'0'.repeat(64)}\t1\t1\tmaestro-memory/notes/bad\nname.md\0`, 'utf-8'), // control char
      Buffer.from(`${'0'.repeat(64)}\t1\t1\tmaestro-memory/ok.md\0`, 'utf-8'),
    ]);
    const out = parseRemoteManifest(buf);
    expect(out.map((e) => e.path)).toEqual(['maestro-memory/ok.md']);
  });

  it('throws a named error when the peer still holds the pre-4.0 root', () => {
    const buf = Buffer.from(`STORE_NOT_MIGRATED\t0\t0\t/home/user/.dsh/maestro-memory\0`, 'utf-8');
    expect(() => parseRemoteManifest(buf)).toThrow(/remote store not migrated/);
  });

  it('preflights the migration marker in the remote script', () => {
    const s = buildRemoteManifestScript('/home/user/.dsh');
    expect(s).toContain('/home/user/.dsh/maestro-memory/.maestro-memory/migrated-v4');
    expect(s).toContain('STORE_NOT_MIGRATED');
  });

  it('buildRemoteManifestScript embeds only the validated absolute root', () => {
    const s = buildRemoteManifestScript('/home/user/.dsh');
    expect(s).toContain('/home/user/.dsh/maestro-memory');
    expect(s).toContain('sha256sum');
    expect(s).toContain('printf');
  });
});