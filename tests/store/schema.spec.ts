import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineDomain, set, get, load, resetForTests } from '../src/index.ts'

let home: string
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'cfgschema-')); resetForTests() })
afterEach(async () => { await rm(home, { recursive: true, force: true }) })

const storePath = () => join(home, 'maestro', 'settings.json')

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
