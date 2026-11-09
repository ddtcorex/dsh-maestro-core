// tests/sync/store-migration-preflight.spec.ts
//
// The 4.0 rename moved the store root. A machine left on the old root inventories
// zero memory files, which is indistinguishable from "nothing to sync", so the
// service refuses instead of proceeding.
import { describe, it, expect } from 'vitest';
import * as nodeFs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SyncService } from '../../src/host/sync/sync-service.js';

function service(localDsh: string, fs: any = nodeFs) {
  return new SyncService({ localDsh, fs, remote: 'user@example-host', remoteDsh: '/home/user/.dsh' });
}

function run(svc: SyncService) {
  return (svc as any).assertLocalStoreMigrated();
}

describe('sync store-migration preflight', () => {
  it('refuses when the machine still holds the pre-4.0 root', () => {
    const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'maestro-sync-preflight-'));
    nodeFs.mkdirSync(path.join(root, 'dsh-maestro-memory'), { recursive: true });
    try {
      expect(() => run(service(root))).toThrow(/still at/);
      try {
        run(service(root));
      } catch (error: any) {
        expect(error.code).toBe('STORE_NOT_MIGRATED');
      }
    } finally {
      nodeFs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts a machine that carries the migration marker', () => {
    const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'maestro-sync-preflight-'));
    const meta = path.join(root, 'maestro-memory', '.maestro-memory');
    nodeFs.mkdirSync(meta, { recursive: true });
    nodeFs.writeFileSync(path.join(meta, 'migrated-v4'), '{}');
    nodeFs.mkdirSync(path.join(root, 'dsh-maestro-memory'), { recursive: true });
    try {
      expect(() => run(service(root))).not.toThrow();
    } finally {
      nodeFs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts a fresh DSH_HOME that has neither root yet', () => {
    const root = nodeFs.mkdtempSync(path.join(os.tmpdir(), 'maestro-sync-preflight-'));
    try {
      expect(() => run(service(root))).not.toThrow();
    } finally {
      nodeFs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('stays out of the way for a fake fs without existsSync', () => {
    const fake = { readdirSync: () => [] } as any;
    expect(() => run(service('/tmp/unused-root', fake))).not.toThrow();
  });
});
