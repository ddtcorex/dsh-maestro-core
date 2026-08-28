import type { Context } from '@deepseek-ai/cordis'

type RpcResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string; details: object } }
type RpcErrorDetailsMap = { 'bad-request': { issues: object[] } }
import { createMaestroConfigService, type MaestroConfigService } from './service.ts'

export const name = 'maestro-config'
export const inject = ['connection']

const RPC_CHANNEL = '/dsh-maestro-config'

declare module '@deepseek-ai/cordis' {
  interface Context {
    maestroConfig: MaestroConfigService
    connection: { rpc: { handle: (channel: string, handler: (endpoint: string, payload: unknown) => Promise<RpcResult<unknown>>, opts?: unknown) => () => void } }
  }
}

function ok<T>(value: T): RpcResult<T> {
  return { ok: true, value }
}

function fail(message: string): RpcResult<never> {
  return {
    ok: false,
    error: {
      code: 'bad-request',
      message,
      // Synthetic details: app-level validation error shoehorned into DSH's
      // shared RPC error taxonomy (same approach across maestro packages).
      details: { issues: [{ message }] } as RpcErrorDetailsMap['bad-request'],
    },
  }
}

/** Publish maestroConfig over the shared store + loopback RPC for clients. */
export function apply(ctx: Context): void {
  const svc = createMaestroConfigService()
  ctx.provide('maestroConfig', svc)
  ctx.effect(() =>
    ctx.connection.rpc.handle(RPC_CHANNEL, async (endpoint: string, payload: unknown): Promise<RpcResult<unknown>> => {
      const body = (payload ?? {}) as { domain?: string; patch?: object }
      if (endpoint === 'list') {
        return ok({ domains: await svc.listDomains() })
      }
      if (endpoint === 'get') {
        if (typeof body.domain !== 'string') return fail('domain (string) is required')
        return ok(await svc.get(body.domain))
      }
      if (endpoint === 'set') {
        if (typeof body.domain !== 'string' || typeof body.patch !== 'object' || body.patch === null) {
          return fail('domain (string) and patch (object) are required')
        }
        await svc.set(body.domain, body.patch)
        return ok(null)
      }
      return fail(`unknown endpoint: ${String(endpoint)}`)
    }, { authority: 'loopback' })
  )
}
