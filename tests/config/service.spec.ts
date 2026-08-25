import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMaestroConfigService } from '../src/host/service.ts'
import { defineDomain, resetForTests } from '@ddtcorex/dsh-maestro-config-lib'

let homeA: string
let homeB: string
beforeEach(async () => {
  homeA = await mkdtemp(join(tmpdir(), 'cfgsvc-a-'))
  homeB = await mkdtemp(join(tmpdir(), 'cfgsvc-b-'))
  resetForTests()
})
afterEach(async () => {
  await Promise.all([
    rm(homeA, { recursive: true, force: true }),
    rm(homeB, { recursive: true, force: true }),
  ])
})

describe('maestroConfig service', () => {
  it('set/get roundtrip persists through the shared store', async () => {
    const svc = createMaestroConfigService({ dshHome: homeA })
    await svc.set('tunnel', { hostname: 'x.example.com' })
    expect(await svc.get('tunnel')).toEqual({ hostname: 'x.example.com' })
  })

  it('set patches (deep merge) — sibling keys survive', async () => {
    const svc = createMaestroConfigService({ dshHome: homeA })
    await svc.set('gitlab', { baseUrl: 'https://g', token: 't' })
    await svc.set('gitlab', { baseUrl: 'https://g2' })
    expect(await svc.get('gitlab')).toEqual({ baseUrl: 'https://g2', token: 't' })
  })

  it('listDomains unions file domains with registered schema domains', async () => {
    defineDomain('review', { parse: () => ({ ok: true }) })
    const svc = createMaestroConfigService({ dshHome: homeA })
    await svc.set('tunnel', { hostname: 'h' })
    const names = await svc.listDomains()
    expect(names).toContain('tunnel') // present on disk
    expect(names).toContain('review') // schema owner declared it
  })

  it('onChange fires for writes made through the service', async () => {
    const svc = createMaestroConfigService({ dshHome: homeA })
    const seen: string[] = []
    const off = svc.onChange((d) => seen.push(d))
    await svc.set('notify', { telegram: { chatId: '1' } })
    off()
    await svc.set('review', { model: 'm' })
    expect(seen).toEqual(['notify'])
  })

  it('services bound to different homes do not cross-talk', async () => {
    const a = createMaestroConfigService({ dshHome: homeA })
    const b = createMaestroConfigService({ dshHome: homeB })
    await a.set('only-a', { v: 1 })
    expect(await b.get('only-a')).toBeUndefined()
    expect(await a.get('only-a')).toEqual({ v: 1 })
  })
})
