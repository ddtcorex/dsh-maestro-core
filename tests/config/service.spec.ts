import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
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

  it('unset deletes one key and reports whether anything was deleted', async () => {
    const svc = createMaestroConfigService({ dshHome: homeA })
    await svc.set('guardBlacklist', { patterns: ['a'], placeholders: { a: 'b' } })
    expect(await svc.unset('guardBlacklist', 'placeholders')).toBe(true)
    expect(await svc.get('guardBlacklist')).toEqual({ patterns: ['a'] })
    expect(await svc.unset('guardBlacklist', 'placeholders')).toBe(false)
  })

  it('services bound to different homes do not cross-talk', async () => {
    const a = createMaestroConfigService({ dshHome: homeA })
    const b = createMaestroConfigService({ dshHome: homeB })
    await a.set('only-a', { v: 1 })
    expect(await b.get('only-a')).toBeUndefined()
    expect(await a.get('only-a')).toEqual({ v: 1 })
  })

  /**
   * Regression pin for the 2026-09-14 "Settings fields are empty" report.
   *
   * The service delegates the store location to
   * `@ddtcorex/dsh-maestro-config-lib`, whose path moved from the retired
   * `~/.dsh/maestro/settings.json` to `~/.dsh/dsh-maestro-config/settings.json`
   * in config-lib 0.2.0. This package declared `^0.1.2`, so it kept resolving a
   * config-lib from the 0.1.x line and read the RETIRED file — every Guard /
   * Blacklist / Supervisor / Notifier field came back empty while every sibling
   * package (which links the workspace copy) read the right one.
   *
   * Both files are pre-seeded with DIFFERENT content and neither is written
   * through the lib, so this asserts the store location itself rather than a
   * self-consistent set/get round-trip (which cannot catch a wrong path).
   */
  it('reads the shared store, never the retired ~/.dsh/maestro/settings.json', async () => {
    await mkdir(join(homeA, 'dsh-maestro-config'), { recursive: true })
    await writeFile(
      join(homeA, 'dsh-maestro-config', 'settings.json'),
      JSON.stringify({ version: 1, domains: { guard: { cwdContainment: false }, gitlab: { baseUrl: 'https://real.example.com' } } }),
      { mode: 0o600 },
    )
    await mkdir(join(homeA, 'maestro'), { recursive: true })
    await writeFile(
      join(homeA, 'maestro', 'settings.json'),
      JSON.stringify({ version: 1, domains: { supervisor: { autoResumeEnabled: true } } }),
      { mode: 0o600 },
    )

    const svc = createMaestroConfigService({ dshHome: homeA })
    // A field present in the shared store must surface…
    expect(await svc.get('guard')).toEqual({ cwdContainment: false })
    expect(await svc.get('gitlab')).toEqual({ baseUrl: 'https://real.example.com' })
    // …and the retired path must not be read at all.
    expect(await svc.get('supervisor')).toBeUndefined()
  })
})
