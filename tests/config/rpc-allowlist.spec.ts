import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Handler = (endpoint: string, payload: unknown) => Promise<any>

let home: string
let prevHome: string | undefined
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'cfgrpc-'))
  prevHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  vi.resetModules()
})
afterEach(async () => {
  if (prevHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = prevHome
  const store = await import('../../src/host/store/index.js')
  store.resetForTests()
  await rm(home, { recursive: true, force: true })
})

async function boot(): Promise<{ handler: Handler; store: typeof import('../../src/host/store/index.js') }> {
  const store = await import('../../src/host/store/index.js')
  store.resetForTests()
  const mod = await import('../../src/host/config/index.js')
  let handler!: Handler
  const ctx: any = {
    provide: () => {},
    effect: (fn: () => unknown) => fn(),
    connection: { rpc: { handle: (_ch: string, h: Handler) => { handler = h; return () => {} } } },
  }
  mod.apply(ctx)
  return { handler, store }
}

const FOREIGN = ['gitlab', 'notifier', 'tunnel', 'review', 'sync', 'somethingElse']

describe('/dsh-maestro-config domain allowlist', () => {
  it('refuses get/set/unset for every foreign domain and never reads or writes them', async () => {
    const { handler, store } = await boot()
    for (const d of FOREIGN) await store.set(d, { token: 'SECRET-' + d })
    for (const d of FOREIGN) {
      const g = await handler('get', { domain: d })
      expect(g.ok).toBe(false)
      expect(JSON.stringify(g)).not.toContain('SECRET-')
      const s = await handler('set', { domain: d, patch: { token: 'pwned' } })
      expect(s.ok).toBe(false)
      const u = await handler('unset', { domain: d, key: 'token' })
      expect(u.ok).toBe(false)
      expect(await store.get(d)).toEqual({ token: 'SECRET-' + d })
    }
  })

  it('list never reveals foreign domain names', async () => {
    const { handler, store } = await boot()
    await store.set('gitlab', { token: 'x' })
    await store.set('guard', { publishBlocked: true })
    const res = await handler('list', {})
    expect(res.ok).toBe(true)
    expect(res.value.domains).toContain('guard')
    expect(res.value.domains).not.toContain('gitlab')
  })

  it('owned domains still work', async () => {
    const { handler } = await boot()
    for (const d of ['guard', 'guardBlacklist', 'supervisor']) {
      const patch = d === 'guardBlacklist' ? { patterns: ['a'] } : d === 'guard' ? { publishBlocked: true } : { autoResumeEnabled: false }
      expect((await handler('set', { domain: d, patch })).ok).toBe(true)
      expect((await handler('get', { domain: d })).value).toEqual(patch)
    }
    expect((await handler('unset', { domain: 'supervisor', key: 'autoResumeEnabled' })).value).toEqual({ deleted: true })
  })

  it('guard writes through the RPC are still validated', async () => {
    const { handler } = await boot()
    await expect(handler('set', { domain: 'guard', patch: { publishBlocked: 'nope' } })).rejects.toThrow(/validation failed/)
  })

  it('rejects prototype-style domain names', async () => {
    const { handler } = await boot()
    for (const d of ['__proto__', 'constructor', 'toString']) {
      expect((await handler('get', { domain: d })).ok).toBe(false)
    }
  })
})
