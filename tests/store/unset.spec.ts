import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { get, set, unset, onChange, defineDomain, resetForTests } from '../src/index.ts'

let home: string
const storePath = () => join(home, 'dsh-maestro-config', 'settings.json')

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'cfgunset-'))
  resetForTests()
  defineDomain('guardBlacklist', {
    parse(v: any) {
      if (v == null) return { ok: true }
      if (typeof v !== 'object') return { ok: false, error: 'object' }
      if (v.patterns && !Array.isArray(v.patterns)) return { ok: false, error: 'patterns array' }
      if (v.placeholders !== undefined && typeof v.placeholders !== 'object') return { ok: false, error: 'placeholders object' }
      return { ok: true }
    },
  })
})
afterEach(async () => { await rm(home, { recursive: true, force: true }) })

async function seedStore(domains: Record<string, unknown>): Promise<void> {
  await mkdir(join(home, 'dsh-maestro-config'), { recursive: true })
  await writeFile(storePath(), JSON.stringify({ version: 1, domains }), 'utf8')
}

describe('unset()', () => {
  it('deletes an existing key, returns true, fires change callbacks', async () => {
    await set('guardBlacklist', { patterns: ['a'], placeholders: { a: 'b' } }, { dshHome: home })
    const seen: string[] = []
    onChange((d) => seen.push(d))
    expect(await unset('guardBlacklist', 'placeholders', { dshHome: home })).toBe(true)
    expect(await get('guardBlacklist', { dshHome: home })).toEqual({ patterns: ['a'] })
    expect(seen).toEqual(['guardBlacklist'])
    const raw = JSON.parse(await readFile(storePath(), 'utf8'))
    expect('placeholders' in raw.domains.guardBlacklist).toBe(false)
  })

  it('is a no-op false when the domain, bucket or key is absent (no write, no callbacks)', async () => {
    const seen: string[] = []
    onChange((d) => seen.push(d))
    expect(await unset('nope', 'k', { dshHome: home })).toBe(false)
    await set('guardBlacklist', { patterns: [] }, { dshHome: home })
    seen.length = 0
    expect(await unset('guardBlacklist', 'placeholders', { dshHome: home })).toBe(false)
    expect(seen).toEqual([])
  })

  it('rejects dotted and empty keys without touching the file', async () => {
    await set('guardBlacklist', { patterns: [] }, { dshHome: home })
    await expect(unset('guardBlacklist', 'a.b', { dshHome: home })).rejects.toThrow()
    await expect(unset('guardBlacklist', '', { dshHome: home })).rejects.toThrow()
    expect(await get('guardBlacklist', { dshHome: home })).toEqual({ patterns: [] })
  })
})
