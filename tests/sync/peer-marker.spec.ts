// tests/sync/peer-marker.spec.ts — a peer that has not moved its store must be refused,
// not published into. The wire paths are unchanged, so the marker is the only signal.
import { describe, it, expect } from 'vitest';
import { isEligiblePath } from '../../src/host/sync/validation.js';
import { SyncService } from '../../src/host/sync/sync-service.js';
import { buildRemoteManifestScript, parseRemoteManifest } from '../../src/host/sync/remote-manifest.js';

describe('peer marker eligibility', () => {
  it('accepts the v5 marker on the wire', () => {
    expect(isEligiblePath('maestro-memory/.maestro-memory/migrated-v5.json')).toBe(true);
  });

  it('still rejects arbitrary files', () => {
    expect(isEligiblePath('maestro-memory/notes.txt')).toBe(false);
    expect(isEligiblePath('maestro-memory/.maestro-memory/migrated-v5.json.bak')).toBe(false);
  });
});

describe('peer refusal', () => {
  // A moved local store: the guard is inert until this machine has moved.
  const svc = new SyncService({ localDsh: '/tmp/peer-check', storeRoot: '/tmp/peer-store' } as any);

  it('refuses a peer that has memory files but no v5 marker', () => {
    let caught: any = null;
    try {
      (svc as any).assertPeerMoved(['maestro-memory/MEMORY.md']);
    } catch (e) {
      caught = e;
    }
    expect(caught?.code).toBe('PEER_NOT_MOVED');
  });

  it('accepts a moved peer, and an empty one', () => {
    expect(() =>
      (svc as any).assertPeerMoved(['maestro-memory/MEMORY.md', 'maestro-memory/.maestro-memory/migrated-v5.json']),
    ).not.toThrow();
    expect(() => (svc as any).assertPeerMoved([])).not.toThrow();
  });
});

describe('moved-peer sentinel (kept for old senders)', () => {
  it('parses a moved peer into a named refusal', () => {
    const buf = Buffer.from('PEER_STORE_MOVED\t0\t0\t/home/u/.maestro-memory\0');
    let caught: any = null;
    try {
      parseRemoteManifest(buf);
    } catch (e) {
      caught = e;
    }
    expect(caught?.code).toBe('PEER_STORE_MOVED');
    expect(String(caught?.message)).toContain('/home/u/.maestro-memory');
  });

  it('keeps the pre-4.0 sentinel working', () => {
    const buf = Buffer.from('STORE_NOT_MIGRATED\t0\t0\t/home/u/.dsh/dsh-maestro-memory\0');
    let caught: any = null;
    try {
      parseRemoteManifest(buf);
    } catch (e) {
      caught = e;
    }
    expect(caught?.code).toBe('STORE_NOT_MIGRATED');
  });
});

describe('remote manifest script', () => {
  it('inventories whichever store root the peer actually reads', () => {
    const script = buildRemoteManifestScript('/home/u/.dsh');
    expect(script).toContain('$HOME/.maestro-memory/.maestro-memory/migrated-v5.json');
    expect(script).toContain('find "$mem_root"');
    // The wire prefix is restored when files come from the moved root.
    expect(script).toContain('maestro-memory/');
  });
});
