import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, stat, readFile, readdir, writeFile, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load, get, set, onChange, resetForTests } from '../src/index.ts'

let home: string

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'cfglib-'))
  resetForTests()
})
afterEach(async () => { await rm(home, { recursive: true, force: true }) })

describe('out-of-band freshness', () => {
  it('sees a store edit made behind its back (direct fs write, not set())', async () => {
    await set('tunnel', { hostname: 'a.example.com' }, { dshHome: home })
    expect(await get('tunnel', { dshHome: home })).toEqual({ hostname: 'a.example.com' })
    // Another process edits the file: rewrite it directly, bypassing set().
    const raw = JSON.parse(await readFile(storePath(), 'utf8'))
    raw.domains.tunnel.hostname = 'b.example.com'
    await writeFile(storePath(), JSON.stringify(raw))
    // mtime granularity: filesystems vary — force a distinct mtime when equal.
    const after = await stat(storePath())
    await utimes(storePath(), after.atime, new Date(after.mtimeMs + 2000))
    expect(await get('tunnel', { dshHome: home })).toEqual({ hostname: 'b.example.com' })
  })

  it('serves the memoized doc when the store file vanishes mid-run', async () => {
    await set('tunnel', { hostname: 'x.example.com' }, { dshHome: home })
    await rm(storePath(), { force: true })
    expect(await get('tunnel', { dshHome: home })).toEqual({ hostname: 'x.example.com' })
  })
})

const storePath = () => join(home, 'dsh-maestro-config', 'settings.json')

describe('config-lib store basics', () => {
  it('load on empty dir returns an empty v1 doc and creates nothing on disk', async () => {
    const doc = await load({ dshHome: home })
    expect(doc).toEqual({ version: 1, domains: {} })
    await expect(readdir(join(home, 'dsh-maestro-config'))).rejects.toThrow()
  })

  it('set() writes atomically with mode 600 and no temp leftovers', async () => {
    await set('tunnel', { hostname: 'x.example.com' }, { dshHome: home })
    const raw = JSON.parse(await readFile(storePath(), 'utf8'))
    expect(raw.version).toBe(1)
    expect(raw.domains.tunnel).toEqual({ hostname: 'x.example.com' })
    const st = await stat(storePath())
    expect(st.mode & 0o777).toBe(0o600)
    const dirFiles = await readdir(join(home, 'dsh-maestro-config'))
    expect(dirFiles.filter((f) => f !== 'settings.json')).toEqual([])
  })

  it('get(domain) returns the stored domain; unknown domain returns undefined', async () => {
    await set('tunnel', { hostname: 'a' }, { dshHome: home })
    expect(await get('tunnel', { dshHome: home })).toEqual({ hostname: 'a' })
    expect(await get('nope', { dshHome: home })).toBeUndefined()
  })

  it('second set() deep-merges the patch without clobbering sibling keys', async () => {
    await set('tunnel', { hostname: 'a', credentialsFile: '/c' }, { dshHome: home })
    await set('tunnel', { mode: 'quick' }, { dshHome: home })
    expect(await get('tunnel', { dshHome: home })).toEqual({
      hostname: 'a', credentialsFile: '/c', mode: 'quick',
    })
  })

  it('concurrent sets to different domains all persist (lock serializes writers)', async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => set(`dom${i}`, { i }, { dshHome: home })),
    )
    for (let i = 0; i < 10; i++) {
      expect(await get(`dom${i}`, { dshHome: home })).toEqual({ i })
    }
  })

  it('onChange fires per set() with the written domain name', async () => {
    const seen: string[] = []
    const off = onChange((d) => seen.push(d))
    await set('review', { model: 'm1' }, { dshHome: home })
    await set('gitlab', { baseUrl: 'u' }, { dshHome: home })
    off()
    await set('tunnel', { hostname: 'z' }, { dshHome: home })
    expect(seen).toEqual(['review', 'gitlab'])
  })

  it('explicit dshHome wins over DSH_HOME env over real home', async () => {
    process.env.DSH_HOME = join(home, 'env-home')
    try {
      await set('memory', { k: 1 }) // no explicit dshHome → env-home
      const raw = JSON.parse(await readFile(join(home, 'env-home', 'dsh-maestro-config', 'settings.json'), 'utf8'))
      expect(raw.domains.memory).toEqual({ k: 1 })
    } finally {
      delete process.env.DSH_HOME
    }
  })
})
