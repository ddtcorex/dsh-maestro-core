import { describe, expect, it, vi } from 'vitest'
import { apply } from '../src/host/plugin.js'

// Models the LIVE boot ordering on DSH 0.2.x: top-level `inject` is empty so
// the row activates before the `connection` fiber is ACTIVE, and `ctx.get` is
// strict (an inactive provider resolves to undefined). The row must therefore
// request a `['connection']` child fiber for its RPC registrations; inline
// registration at apply() time silently skips and the route stays
// unregistered (HTTP 405) forever.
function makeDeferredConnCtx() {
  const waiting: { names: string[]; body: (scoped: any) => void }[] = []
  const handle = vi.fn(() => () => {})
  const active = new Set<string>()
  const connService = { rpc: { handle } }
  const ctx: any = {
    logger: { info: () => {}, warn: () => {} },
    effect: (fn: any) => {
      try { fn() } catch {}
      return () => {}
    },
    get: (key: string) => (active.has(key) && key === 'connection' ? connService : undefined),
    inject: (names: string[], body: (scoped: any) => void) => {
      waiting.push({ names, body })
    },
  }
  return {
    ctx,
    handle,
    connectionFiber: () => waiting.find((w) => w.names.join('/') === 'connection'),
    arriveConnection: () => {
      active.add('connection')
      for (let i = waiting.length - 1; i >= 0; i--) {
        const w = waiting[i]!
        if (!w.names.every((n) => active.has(n))) continue
        waiting.splice(i, 1)
        const scoped: any = {
          ...ctx,
          get: (k: string) => (k === 'connection' && active.has(k) ? connService : undefined),
          connection: connService,
        }
        w.body(scoped)
      }
    },
  }
}

describe('supervisor RPC registration', () => {
  it('defers both supervisor channels until connection is active', () => {
    const h = makeDeferredConnCtx()
    apply(h.ctx, {})
    const fiber = h.connectionFiber()
    expect(fiber, 'a [connection] child fiber for the supervisor RPC channels').toBeDefined()

    h.arriveConnection()
    const channels = h.handle.mock.calls.map((c) => c[0])
    expect(channels).toContain('/dsh-maestro-supervisor-session-health')
    expect(channels).toContain('/dsh-maestro-supervisor-resume')
  })

  it('registers both channels immediately on hosts without the child-fiber primitive', () => {
    const handle = vi.fn(() => () => {})
    const ctx: any = {
      logger: { info: () => {}, warn: () => {} },
      connection: { rpc: { handle } },
      get: () => undefined,
      effect: (fn: any) => {
        try { fn() } catch {}
        return () => {}
      },
    }
    apply(ctx, {})
    const channels = handle.mock.calls.map((c: any[]) => c[0])
    expect(channels).toContain('/dsh-maestro-supervisor-session-health')
    expect(channels).toContain('/dsh-maestro-supervisor-resume')
    expect(channels.filter((c: string) => c === '/dsh-maestro-supervisor-resume')).toHaveLength(1)
  })
})
