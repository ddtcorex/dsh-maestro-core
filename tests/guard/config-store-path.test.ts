import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadGuardConfig } from '../../src/host/guard/config.js'

/**
 * Store-LOCATION pin (2026-09-14).
 *
 * `config.test.ts` drives the loader through a mocked store — deliberately, so
 * the on-disk layout stays the lib's private detail. The gap that left: nothing
 * asserted WHICH file the guard's real dependency reads, so the package could
 * (and did) resolve a store module whose path is the
 * retired `~/.dsh/maestro/settings.json` while every sibling package linked the
 * workspace copy. The guard then read `domains.guard` as `undefined` and ran on
 * `DEFAULT_CONFIG`, silently ignoring the operator's persisted settings.
 *
 * This suite uses the REAL lib (no `vi.mock`) and pre-seeds both files with
 * different content, so it fails on the store location itself rather than on a
 * self-consistent round-trip.
 */
const homes: string[] = []
afterEach(async () => {
  await Promise.all(homes.splice(0).map((h) => rm(h, { recursive: true, force: true })))
})

async function home(seed: { shared?: unknown; legacy?: unknown }): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'guard-store-'))
  homes.push(dir)
  if (seed.shared !== undefined) {
    await mkdir(join(dir, 'dsh-maestro-config'), { recursive: true })
    await writeFile(join(dir, 'dsh-maestro-config', 'settings.json'), JSON.stringify({ version: 1, domains: { guard: seed.shared } }), { mode: 0o600 })
  }
  if (seed.legacy !== undefined) {
    await mkdir(join(dir, 'maestro'), { recursive: true })
    await writeFile(join(dir, 'maestro', 'settings.json'), JSON.stringify({ version: 1, domains: { guard: seed.legacy } }), { mode: 0o600 })
  }
  return dir
}

describe('guard config store location', () => {
  it('reads domains.guard from the shared store, never the retired maestro path', async () => {
    const dir = await home({
      shared: { rules: { 'fs.write.outside': 'journal' } },
      // A different document: if it were read, pkg.publish would be demoted.
      legacy: { rules: { 'pkg.publish': 'journal' } },
    })
    const config = await loadGuardConfig(dir)
    expect(config.rules['fs.write.outside']).toBe('journal')
    expect(config.rules['pkg.publish']).toBe('ask')
  })

  it('sees a shared-store guard document that carries v2 keys', async () => {
    const dir = await home({ shared: { protectedBranches: ['trunk'], workingDirContainment: { enabled: false, spillReads: true } }, legacy: { protectedBranches: ['other'] } })
    const config = await loadGuardConfig(dir)
    expect(config.protectedBranches).toEqual(['trunk'])
    expect(config.workingDirContainment).toEqual({ enabled: false, spillReads: true })
  })
})
