/**
 * `onChange` must fire when ANOTHER copy of the store writes the file, not only
 * for writes made through the copy that owns the listener.
 *
 * Every plugin embeds its own copy of this module, so a Settings write made
 * through the config module has to reach a listener registered by, say, the
 * gateway module. The copies below are real separate module instances: the
 * import specifier differs per copy, so vite instantiates the module twice and
 * the two copies share nothing but the settings file on disk.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type StoreModule = typeof import('../../src/host/store/index.js')

/**
 * One entry per instance the specs below need. Vite instantiates a separate
 * module for every distinct specifier, and a template literal would hide the
 * specifier from its static analysis, so the map is spelled out.
 */
const COPIES: Record<string, Promise<StoreModule>> = {
  a1: import('../../src/host/store/index.js?copy=a1'),
  b1: import('../../src/host/store/index.js?copy=b1'),
  a2: import('../../src/host/store/index.js?copy=a2'),
  a3: import('../../src/host/store/index.js?copy=a3'),
  b3: import('../../src/host/store/index.js?copy=b3'),
}

/** A fresh, truly separate instance of the store module. */
async function copyOfStore(id: keyof typeof COPIES): Promise<StoreModule> {
  return COPIES[id]
}

const until = async (cond: () => boolean, ms = 4000): Promise<void> => {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('onChange across embedded copies', () => {
  it('fires in copy B when copy A writes a domain', async () => {
    const home = mkdtempSync(join(tmpdir(), 'cross-'))
    process.env.DSH_HOME = home
    const a = await copyOfStore('a1')
    const b = await copyOfStore('b1')
    expect(a).not.toBe(b)

    const seen: string[] = []
    const off = b.onChange((d: string) => seen.push(d))
    await a.set('gateway', { models: ['x'] })
    await until(() => seen.includes('gateway'))
    expect(seen.filter((d) => d === 'gateway')).toHaveLength(1)
    off()
  })

  it('does not double-fire for a write made through the same copy', async () => {
    const home = mkdtempSync(join(tmpdir(), 'cross-'))
    process.env.DSH_HOME = home
    const a = await copyOfStore('a2')
    const seen: string[] = []
    const off = a.onChange((d: string) => seen.push(d))
    await a.set('gateway', { n: 1 })
    await new Promise((r) => setTimeout(r, 400))
    expect(seen).toEqual(['gateway'])
    off()
  })

  it('stops watching when the last listener is removed', async () => {
    const home = mkdtempSync(join(tmpdir(), 'cross-'))
    process.env.DSH_HOME = home
    const a = await copyOfStore('a3')
    const b = await copyOfStore('b3')
    const seen: string[] = []
    const off = b.onChange((d: string) => seen.push(d))
    off()
    await a.set('gateway', { n: 2 })
    await new Promise((r) => setTimeout(r, 400))
    expect(seen).toEqual([])
  })
})