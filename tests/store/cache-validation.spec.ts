/**
 * Store cache validation (mtime, inode and size). Every case runs against a scratch DSH_HOME.
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

describe('load cache validates more than mtime', () => {
  const doc = (v: string) => JSON.stringify({ version: 1, domains: { d: { v } } }, null, 2) + '\n'

  // A whole-second mtime survives the Date round trip exactly (no sub-ms drift).
  const T = new Date(1_700_000_000_000)

  it('notices a rewrite that kept the mtime but changed the size', async () => {
    await store.set('d', { v: 'a' })
    utimesSync(file(), T, T)
    expect(await store.get('d')).toEqual({ v: 'a' }) // caches mtime T
    writeFileSync(file(), doc('a-much-longer-value'))
    utimesSync(file(), T, T)
    expect(await store.get('d')).toEqual({ v: 'a-much-longer-value' })
  })

  it('notices a replacement file with the same size and mtime but a new inode', async () => {
    await store.set('d', { v: 'a' })
    utimesSync(file(), T, T)
    expect(await store.get('d')).toEqual({ v: 'a' })
    const size = statSync(file()).size
    const tmp = file() + '.swap'
    writeFileSync(tmp, doc('a').replace('"a"', '"b"'))
    utimesSync(tmp, T, T)
    renameSync(tmp, file())
    expect(statSync(file()).size).toBe(size)
    expect(await store.get('d')).toEqual({ v: 'b' })
  })
})

