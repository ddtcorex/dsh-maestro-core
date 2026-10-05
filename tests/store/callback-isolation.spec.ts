/**
 * A throwing onChange callback never breaks a write or other listeners. Every case runs against a scratch DSH_HOME.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, renameSync, utimesSync, statSync, existsSync, readdirSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as store from '../../src/host/store/index.js'

let home: string
let prev: string | undefined
const file = () => join(home, 'dsh-maestro-config', 'settings.json')
const dir = () => join(home, 'dsh-maestro-config')

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'storehard-'))
  prev = process.env.DSH_HOME
  process.env.DSH_HOME = home
  store.resetForTests()
})
afterEach(() => {
  store.resetForTests()
  if (prev === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = prev
  rmSync(home, { recursive: true, force: true })
})

const until = async (cond: () => boolean, ms = 4000) => {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 25))
  }
}

describe('onChange callbacks are isolated', () => {
  it('set() resolves and later callbacks still run when one throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const seen: string[] = []
    store.onChange(() => { throw new Error('boom') })
    store.onChange((d) => { seen.push(d) })
    await expect(store.set('d', { v: 1 })).resolves.toBeUndefined()
    expect(seen).toEqual(['d'])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('unset() resolves when a callback throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await store.set('d', { v: 1, w: 2 })
    store.onChange(() => { throw new Error('boom') })
    await expect(store.unset('d', 'w')).resolves.toBe(true)
    warn.mockRestore()
  })

  it('an external change still reaches later callbacks when the first throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const seen: string[] = []
    mkdirSync(dir(), { recursive: true })
    writeFileSync(file(), JSON.stringify({ version: 1, domains: {} }))
    store.onChange(() => { throw new Error('boom') })
    store.onChange((d) => { seen.push(d) })
    writeFileSync(file(), JSON.stringify({ version: 1, domains: { ext: { a: 1 } } }))
    await until(() => seen.includes('ext'))
    warn.mockRestore()
  })
})

