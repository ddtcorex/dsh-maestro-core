import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let home: string
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'cfgguard-')); vi.resetModules() })
afterEach(async () => { await rm(home, { recursive: true, force: true }) })

describe('guard settings written through the config module', () => {
  it('are validated without the guard module being loaded', async () => {
    // Only the config module is imported here, never guard/index.js.
    const cfg = await import('../../src/host/config/index.js')
    const store = await import('../../src/host/store/index.js')
    store.resetForTests()
    expect(cfg.name).toBe('maestro-config')
    const { createMaestroConfigService } = await import('../../src/host/config/service.js')
    const svc = createMaestroConfigService({ dshHome: home })
    await expect(svc.set('guard', { publishBlocked: 'nope' })).rejects.toThrow(/validation failed for 'guard'/)
    await expect(svc.set('guardBlacklist', { patterns: 'x' })).rejects.toThrow(/validation failed for 'guardBlacklist'/)
    await svc.set('guard', { publishBlocked: true })
    expect(await svc.get('guard')).toEqual({ publishBlocked: true })
  })
})
