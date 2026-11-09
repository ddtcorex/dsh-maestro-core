// tests/sync/sync-store-root.spec.ts — the store lives outside the DSH home, but the
// wire paths do not change, so every read and write must map through the store root.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { localPathForWirePath } from '../../src/host/sync/store-root.js';
import { SyncService } from '../../src/host/sync/sync-service.js';
import { BackupService } from '../../src/host/sync/backup-service.js';

describe('sync store root', () => {
  it('maps the memory prefix onto the store root and leaves sessions under DSH', () => {
    const roots = { storeRoot: '/home/u/.maestro-memory', localDsh: '/home/u/.dsh' };
    expect(localPathForWirePath('maestro-memory/MEMORY.md', roots)).toBe('/home/u/.maestro-memory/MEMORY.md');
    expect(localPathForWirePath('sessions/x/y/session.jsonl.zstd', roots)).toBe('/home/u/.dsh/sessions/x/y/session.jsonl.zstd');
  });

  it('inventories a store outside the DSH home under the wire prefix', () => {
    const dsh = mkdtempSync(join(tmpdir(), 'sync-dsh-'));
    const store = mkdtempSync(join(tmpdir(), 'sync-store-'));
    writeFileSync(join(store, 'MEMORY.md'), 'x\n');
    const svc = new SyncService({ localDsh: dsh, storeRoot: store } as any);
    expect(svc.listLocalFiles()).toContain('maestro-memory/MEMORY.md');
  });

  it('refuses when the store is still at a legacy root', () => {
    const dsh = mkdtempSync(join(tmpdir(), 'sync-dsh2-'));
    mkdirSync(join(dsh, 'maestro-memory'), { recursive: true });
    const svc = new SyncService({ localDsh: dsh, storeRoot: join(dsh, '..', 'elsewhere-store') } as any);
    let caught: any = null;
    try {
      (svc as any).assertLocalStoreMigrated();
    } catch (e) {
      caught = e;
    }
    // The refusal carries a code, not a magic string in the sentence.
    expect(caught?.code).toBe('STORE_NOT_MIGRATED');
    expect(String(caught?.message)).toContain(join(dsh, 'maestro-memory'));
  });

  it('refuses a backup while the store is still at a legacy root', () => {
    const dsh = mkdtempSync(join(tmpdir(), 'sync-dsh5-'));
    mkdirSync(join(dsh, 'maestro-memory'), { recursive: true });
    writeFileSync(join(dsh, 'maestro-memory', 'MEMORY.md'), 'x\n');
    const svc = new BackupService({ localDsh: dsh, storeRoot: join(dsh, 'nowhere'), store: {} as any, target: {} as any, previewDir: dsh, cacheDir: dsh } as any);
    let caught: any = null;
    try {
      (svc as any).listEligibleFiles();
    } catch (e) {
      caught = e;
    }
    expect(caught?.code).toBe('STORE_NOT_MIGRATED');
  });

  it('hashes memory files from the store root, not the DSH home', async () => {
    const dsh = mkdtempSync(join(tmpdir(), 'sync-dsh4-'));
    const store = mkdtempSync(join(tmpdir(), 'sync-store4-'));
    writeFileSync(join(store, 'MEMORY.md'), 'x\n');
    const svc = new SyncService({ localDsh: dsh, storeRoot: store, cacheDir: join(dsh, 'cache') } as any);
    const hashed = await (svc as any).localSnapshotsWithHashes(['maestro-memory/MEMORY.md']);
    expect(hashed.get('maestro-memory/MEMORY.md')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('writes a pulled file into the resolved root, never the DSH home', async () => {
    const dsh = mkdtempSync(join(tmpdir(), 'sync-dsh3-'));
    const store = mkdtempSync(join(tmpdir(), 'sync-store3-'));
    const svc = new SyncService({ localDsh: dsh, storeRoot: store } as any);
    await (svc as any).atomicWriteWithBackup((svc as any).localPathForWirePath('maestro-memory/MEMORY.md'), Buffer.from('y\n'));
    expect(existsSync(join(store, 'MEMORY.md'))).toBe(true);
    expect(existsSync(join(dsh, 'maestro-memory'))).toBe(false);
  });
});
