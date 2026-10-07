import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  DEFAULT_CONFIG,
  loadGuardConfig,
  mergeGuardConfig,
} from '../../src/host/guard/config.js'

/**
 * The store lib's on-disk layout is its own private detail — it moved between
 * config-lib 0.1.x and 0.2.0, and `set()` refuses a legacy v1 `guard` document
 * because the v2 validator rejects it. Neither belongs in the guard's suite, so
 * the loader is driven through a mocked store: the contract under test is that
 * `domains.guard` is read, migrated and reported.
 */
const store = vi.hoisted(() => ({ doc: undefined as unknown, calls: [] as unknown[] }))

vi.mock('../../src/host/store/index.js', () => ({
  load: async (opts?: unknown) => {
    store.calls.push(opts)
    return store.doc
  },
  get: async (_domain: string, opts?: unknown) => {
    store.calls.push(opts)
    return (store.doc as { domains?: Record<string, unknown> } | undefined)?.domains?.guard
  },
}))

/** Point the mocked store at a persisted `domains.guard` document. */
function withGuardDoc(guard: Record<string, unknown> | undefined): void {
  store.doc = guard === undefined ? { version: 1, domains: {} } : { version: 1, domains: { guard } }
}

beforeEach(() => {
  store.calls = []
  store.doc = { version: 1, domains: {} }
})

describe('mergeGuardConfig', () => {
  it('returns the defaults, untouched, for an empty document', () => {
    const config = mergeGuardConfig({})
    expect(config).toEqual(DEFAULT_CONFIG)
    expect(config).not.toBe(DEFAULT_CONFIG)
    expect(config.rules).not.toBe(DEFAULT_CONFIG.rules)
  })

  it('never mutates the exported defaults', () => {
    const before = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
    mergeGuardConfig({ rules: { 'pkg.publish': 'deny' }, protectedBranches: ['trunk'], protectedPaths: ['/x'] })
    expect(DEFAULT_CONFIG).toEqual(before)
  })

  it('ignores the retired v1 keys', () => {
    const config = mergeGuardConfig({
      gitProtection: { enabled: false, branches: ['trunk'] },
      publishBlocked: false,
      cwdContainment: false,
      credentialPaths: ['/legacy'],
    })
    expect(config).toEqual(DEFAULT_CONFIG)
  })
})

describe('loadGuardConfig', () => {
  it('reads domains.guard and merges it onto the defaults', async () => {
    withGuardDoc({ rules: { 'secret.access': 'journal' }, protectedBranches: ['release'] })
    const config = await loadGuardConfig()
    expect(config.rules['secret.access']).toBe('journal')
    expect(config.protectedBranches).toEqual(['release'])
  })

  it('falls back to the defaults when the store is missing', async () => {
    withGuardDoc(undefined)
    expect(await loadGuardConfig()).toEqual(DEFAULT_CONFIG)
  })

  it('passes the DSH home through to the store read', async () => {
    withGuardDoc(undefined)
    await loadGuardConfig('/home/x/.dsh-test')
    expect(store.calls).toEqual([{ dshHome: '/home/x/.dsh-test' }])
  })
})

/**
 * IMPORTANT minor — `domains.guard.journal.retainFiles`/`retainDays` were spread
 * into the merged block unvalidated, so a non-numeric value silently disabled a
 * retention window: `retainDays` made `rotate()`'s day cutoff `NaN` and
 * `retainFiles` made its file window compare false, which together prune EVERY
 * archive. An invalid window now falls back to the built-in default (fail safe).
 */
describe('journal retention windows are validated', () => {
  it('falls back to the built-in windows for a non-numeric value', () => {
    for (const bad of ['30', NaN, 0, -1, Infinity, null, {}, true] as unknown[]) {
      const config = mergeGuardConfig({ journal: { retainDays: bad, retainFiles: bad } })
      expect(config.journal.retainDays, `retainDays=${String(bad)}`).toBe(DEFAULT_CONFIG.journal.retainDays)
      expect(config.journal.retainFiles, `retainFiles=${String(bad)}`).toBe(DEFAULT_CONFIG.journal.retainFiles)
    }
  })

  it('keeps a valid window and the journal booleans', () => {
    const config = mergeGuardConfig({ journal: { enabled: false, allowCounters: false, retainDays: 7, retainFiles: 3 } })
    expect(config.journal).toEqual({ enabled: false, allowCounters: false, retainDays: 7, retainFiles: 3 })
  })

  it('replaces only the window that was supplied', () => {
    const config = mergeGuardConfig({ journal: { retainDays: 7 } })
    expect(config.journal.retainDays).toBe(7)
    expect(config.journal.retainFiles).toBe(DEFAULT_CONFIG.journal.retainFiles)
  })

  it('falls back for a non-boolean enabled/allowCounters', () => {
    const config = mergeGuardConfig({ journal: { enabled: 'no', allowCounters: 0 } })
    expect(config.journal.enabled).toBe(DEFAULT_CONFIG.journal.enabled)
    expect(config.journal.allowCounters).toBe(DEFAULT_CONFIG.journal.allowCounters)
  })

  it('rejects a fractional window instead of flooring it to zero', () => {
    // `0.5 > 0` passed the positivity check and `Math.floor` turned it into 0,
    // and a zero window prunes EVERY archive — the exact failure this validation
    // exists to prevent. A retention window counts days/files, so it is an
    // integer; a fractional value falls back like any other invalid one.
    for (const bad of [0.5, 1.5]) {
      const config = mergeGuardConfig({ journal: { retainDays: bad, retainFiles: bad } })
      expect(config.journal.retainDays, `retainDays=${bad}`).toBe(DEFAULT_CONFIG.journal.retainDays)
      expect(config.journal.retainFiles, `retainFiles=${bad}`).toBe(DEFAULT_CONFIG.journal.retainFiles)
    }
  })
})
