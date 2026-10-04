import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineDomain, set, get, load, resetForTests } from '../src/index.ts'

let home: string
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'cfgschema-')); resetForTests() })
afterEach(async () => { await rm(home, { recursive: true, force: true }) })

const storePath = () => join(home, 'dsh-maestro-config', 'settings.json')

/** Minimal validator factory: checks known keys' types, tolerates extra keys. */
function typeValidator(rules: Record<string, string>) {
  return {
    parse(value: unknown) {
      if (typeof value !== 'object' || value === null) return { ok: false, error: 'not an object' }
      const errs: string[] = []
      for (const [k, t] of Object.entries(rules)) {
        if (k in (value as object) && typeof (value as Record<string, unknown>)[k] !== t) {
          errs.push(`${k} must be ${t}`)
        }
      }
      return errs.length ? { ok: false, error: errs.join('; ') } : { ok: true }
    },
  }
}

describe('domain schemas', () => {
  it('rejects invalid writes for registered domains and leaves the file untouched', async () => {
    defineDomain('tunnel', typeValidator({ hostname: 'string', mode: 'string' }))
    await expect(set('tunnel', { hostname: 42 }, { dshHome: home })).rejects.toThrow(/validation failed for 'tunnel'.*hostname must be string/)
    // nothing was written
    let raw = ''
    try { raw = await readFile(storePath(), 'utf8') } catch { /* absent */ }
    expect(raw).toBe('')
  })

  it('valid writes pass; extra unknown keys inside a known domain survive round-trips', async () => {
    defineDomain('review', typeValidator({ model: 'string' }))
    await set('review', { model: 'gpt-x', futureKey: { nested: true } }, { dshHome: home })
    const doc = await load({ dshHome: home })
    expect((doc.domains.review as any).futureKey).toEqual({ nested: true })
  })

  it('unregistered domains remain unvalidated (forward compatibility)', async () => {
    await set('brandNewDomain', { anything: [1, 2] }, { dshHome: home })
    expect(await get('brandNewDomain', { dshHome: home })).toEqual({ anything: [1, 2] })
  })

  it('_legacy bucket is preserved when other domains are written later', async () => {
    defineDomain('tunnel', typeValidator({ hostname: 'string' }))
    await set('_legacy' as string, { someOldKey: 'v' }, { dshHome: home })
    await set('tunnel', { hostname: 'h' }, { dshHome: home })
    const doc = await load({ dshHome: home })
    expect(doc.domains._legacy).toEqual({ someOldKey: 'v' })
    expect(doc.domains.tunnel).toEqual({ hostname: 'h' })
  })
})

import { definedDomains } from '../src/index.ts'
describe('definedDomains()', () => {
  it('lists registered domain names without affecting the store', () => {
    resetForTests()
    defineDomain('alpha', typeValidator({}))
    defineDomain('beta', typeValidator({}))
    // Registry is process-global and intentionally survives resets, so other
    // suites' domains may be present — assert membership, not exact contents.
    const names = definedDomains()
    expect(names).toContain('alpha')
    expect(names).toContain('beta')
  })
})

describe('notifier domain schema', () => {
  it('accepts partial telegram patches and policy.reviewNotifications as boolean', async () => {
    await set('notifier', { telegram: { botToken: 'b' } }, { dshHome: home })
    await set('notifier', { policy: { reviewNotifications: true } }, { dshHome: home })
    const doc = await load({ dshHome: home })
    expect(doc.domains.notifier).toEqual({ telegram: { botToken: 'b' }, policy: { reviewNotifications: true } })
  })

  it('rejects a non-boolean reviewNotifications', async () => {
    await expect(
      set('notifier', { policy: { reviewNotifications: 'yes' } }, { dshHome: home }),
    ).rejects.toThrow(/validation failed for 'notifier'.*reviewNotifications boolean/)
  })
})

/**
 * Regression pin for the two-hop legacy flat-key alias
 * `telegramReviewNotifications` ↔ `notifier.policy.reviewNotifications`.
 * This alias bridges `dsh-maestro-config-lib`'s DOMAIN_KEY_MAP and
 * `dsh-maestro-review`'s flat config read/write; nothing type-checks the
 * connection across packages, so a rename on either side must break a test
 * instead of breaking silently.
 */
import { DOMAIN_KEY_MAP, splitLegacyPatch, readFlat, writeLegacyPatch } from '../src/index.ts'
describe('telegramReviewNotifications alias (regression pin)', () => {
  it('DOMAIN_KEY_MAP pins the flat-key alias', () => {
    expect(DOMAIN_KEY_MAP.telegramReviewNotifications).toBe('notifier.policy.reviewNotifications')
  })
  it('splitLegacyPatch routes the flat key into the notifier domain', () => {
    const writes = splitLegacyPatch({ telegramReviewNotifications: true } as any)
    expect(writes).toEqual([{ domain: 'notifier', patch: { policy: { reviewNotifications: true } } }])
  })
  it('readFlat exposes the domain value back under the flat key', async () => {
    await set('notifier', { policy: { reviewNotifications: true } } as any, { dshHome: home })
    const flat = await readFlat({ dshHome: home })
    expect(flat.telegramReviewNotifications).toBe(true)
  })
  it('writeLegacyPatch round-trips through the alias via the store', async () => {
    await writeLegacyPatch({ telegramReviewNotifications: false } as any, { dshHome: home })
    const flat = await readFlat({ dshHome: home })
    expect(flat.telegramReviewNotifications).toBe(false)
    const doc = await load({ dshHome: home })
    expect((doc.domains.notifier as any).policy.reviewNotifications).toBe(false)
  })
})
