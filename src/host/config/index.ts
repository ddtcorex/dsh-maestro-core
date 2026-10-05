import type { Context } from '@deepseek-ai/cordis'

type RpcResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; message: string; details: object } }
type RpcErrorDetailsMap = { 'bad-request': { issues: object[] } }
import { createMaestroConfigService, type MaestroConfigService } from './service.js'

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

/**
 * Domains this channel may touch: exactly the ones the core Settings card reads
 * and writes (Guard and Supervisor tabs). The store is shared with every other
 * plugin (gitlab token, webhook secret, Telegram bot token, tunnel credentials
 * path), and this channel is reachable from any logged-in browser session, so
 * the allowlist is applied to ALL four endpoints, `list` included. Foreign
 * domains are owned and validated by their own plugins.
 */
export const RPC_DOMAINS: readonly string[] = ['guard', 'guardBlacklist', 'supervisor']

function isAllowed(domain: string): boolean {
  return RPC_DOMAINS.includes(domain)
}

function refuse(domain: string): RpcResult<never> {
  return fail(`domain '${domain}' is not available through this channel`)
}

/**
 * Publish maestroConfig over the shared store + loopback RPC for clients.
 * The RPC serves only RPC_DOMAINS; in-process consumers of `ctx.maestroConfig`
 * keep the full service. Validation is delegated to the store's domain validators.
 */
export function apply(ctx: Context): void {
  const svc = createMaestroConfigService()
  ctx.provide('maestroConfig', svc)
  ctx.effect(() =>
    ctx.connection.rpc.handle(RPC_CHANNEL, async (endpoint: string, payload: unknown): Promise<RpcResult<unknown>> => {
      const body = (payload ?? {}) as { domain?: string; patch?: object; key?: unknown }
      if (endpoint === 'list') {
        return ok({ domains: (await svc.listDomains()).filter(isAllowed) })
      }
      if (endpoint === 'get') {
        if (typeof body.domain !== 'string') return fail('domain (string) is required')
        if (!isAllowed(body.domain)) return refuse(body.domain)
        return ok(await svc.get(body.domain))
      }
      if (endpoint === 'set') {
        if (typeof body.domain !== 'string' || typeof body.patch !== 'object' || body.patch === null) {
          return fail('domain (string) and patch (object) are required')
        }
        if (!isAllowed(body.domain)) return refuse(body.domain)
        await svc.set(body.domain, body.patch)
        return ok(null)
      }
      if (endpoint === 'unset') {
        if (typeof body.domain !== 'string' || typeof body.key !== 'string') {
          return fail('domain (string) and key (string) are required')
        }
        if (!isAllowed(body.domain)) return refuse(body.domain)
        try {
          return ok({ deleted: await svc.unset(body.domain, body.key) })
        } catch (e: any) {
          return fail(e?.message ?? String(e))
        }
      }
      return fail(`unknown endpoint: ${String(endpoint)}`)
    })
  )
}
