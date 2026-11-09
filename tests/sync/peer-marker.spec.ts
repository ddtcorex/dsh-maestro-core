// tests/sync/peer-marker.spec.ts — a peer that has not moved its store must be refused,
// not published into. The wire paths are unchanged, so the marker is the only signal.
import { describe, it, expect } from 'vitest';
import { isEligiblePath } from '../../src/host/sync/validation.js';
import { SyncService } from '../../src/host/sync/sync-service.js';

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
