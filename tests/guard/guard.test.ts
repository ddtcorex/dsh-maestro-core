import { describe, it, expect } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createGuardHandler } from '../../src/host/guard/index.js'
import { Journal } from '../../src/host/guard/journal.js'
import { PermissionPolicy } from '../../src/host/guard/permission-policy.js'
import { DEFAULT_CONFIG } from '../../src/host/guard/config.js'

describe('guard host module', () => {
  it('src/host/guard/index.ts hooks tools/pre-execute', () => {
    const src = readFileSync(resolve(import.meta.dirname, '../../src/host/guard/index.ts'), 'utf8')
    expect(src).toContain('tools/pre-execute')
  })
})

/**
 * The handler's behaviour is pinned by `tests/guard/guard-handler.test.ts` (tiers,
 * journal, native ask). These cases cover the two contracts this file has
 * always owned: a policy-denied tool never reaches the tool, and the executed
 * arguments are never rewritten.
 */
describe('guard handler via createGuardHandler', () => {
  async function handler(policy: PermissionPolicy) {
    const dir = await mkdtemp(join(tmpdir(), 'g-'))
    return createGuardHandler({
      journal: new Journal(dir),
      policy,
      readConfig: async () => DEFAULT_CONFIG,
      requestApproval: async () => 'granted',
    })
  }

  it('denies a policy-denied tool with a reason', async () => {
    const h = await handler(new PermissionPolicy({ deny: ['danger-tool'] }))
    const payload: any = { name: 'danger-tool', arguments: { token: '[REDACTED]' } }
    const res = await h(payload, async () => ({ kind: 'allow' as const }))
    expect(res.kind).toBe('deny')
    expect(String((res as any).reason)).toContain('denied by policy')
  })

  it('passes an allowed tool through without touching the executed arguments', async () => {
    const h = await handler(new PermissionPolicy({}))
    // Secret values are assembled at runtime: a raw token literal in this file
    // would be rewritten by the guard path under test before it could be read.
    const raw = 'glpat-' + 'abc123DEF4567890extra'
    const args = { token: raw }
    const payload: any = { name: 'safe-tool', arguments: args }
    let nextCalled = false
    const result = await h(payload, async () => {
      nextCalled = true
      return { kind: 'allow' as const }
    })
    expect(nextCalled).toBe(true)
    expect(result).toEqual({ kind: 'allow' })
    // Redaction belongs to the journal copy only: the executed call keeps the
    // exact object the caller passed (no in-place rewrite, no swap).
    expect(payload.arguments).toBe(args)
    expect(payload.arguments.token).toBe(raw)

    const argsShape = { secret: 'sk-' + '12345678901234567890' }
    const argsPayload: any = { name: 'safe-tool', args: argsShape }
    await h(argsPayload, async () => ({ kind: 'allow' as const }))
    expect(argsPayload.args).toBe(argsShape)
    expect(argsPayload.args.secret).toBe(argsShape.secret)
  })
});
