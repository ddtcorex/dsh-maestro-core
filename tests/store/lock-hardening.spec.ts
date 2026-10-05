/**
 * Lock stealing, lock ownership and file permissions. Every case runs against a scratch DSH_HOME.
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

describe('lock stealing and ownership', () => {
  const lock = () => file() + '.lock'
  const age = (seconds: number) => {
    const t = new Date(Date.now() - seconds * 1000)
    utimesSync(lock(), t, t)
  }

  it('does not steal a lock younger than the stale threshold (which exceeds the acquire timeout)', async () => {
    mkdirSync(dir(), { recursive: true })
    writeFileSync(lock(), 'someone-else')
    age(8) // older than the 5s acquire timeout, younger than the stale threshold
    await expect(store.set('d', { v: 1 })).rejects.toThrow(/lock timeout/)
    expect(readFileSync(lock(), 'utf8')).toBe('someone-else')
  }, 15_000)

  it('steals a genuinely stale lock and leaves no debris', async () => {
    mkdirSync(dir(), { recursive: true })
    writeFileSync(lock(), 'crashed-writer')
    age(120)
    await store.set('d', { v: 1 })
    expect(await store.get('d')).toEqual({ v: 1 })
    expect(existsSync(lock())).toBe(false)
    expect(readdirSync(dir()).filter((n) => n.includes('stale'))).toEqual([])
  })

  it('release never deletes a lock that now belongs to someone else', async () => {
    store.defineDomain('owned', {
      parse: (v) => {
        // Simulates the lock having been stolen and re-acquired mid-write.
        writeFileSync(lock(), 'new-owner')
        return { ok: true, value: v }
      },
    })
    await store.set('owned', { v: 1 })
    expect(existsSync(lock())).toBe(true)
    expect(readFileSync(lock(), 'utf8')).toBe('new-owner')
  })
})

describe('permissions at creation', () => {
  it('creates the settings dir 0700 and the lock 0600', async () => {
    let lockMode = 0
    store.defineDomain('probe', {
      parse: (v) => {
        lockMode = statSync(file() + '.lock').mode & 0o777
        return { ok: true, value: v }
      },
    })
    await store.set('probe', { v: 1 })
    expect(statSync(dir()).mode & 0o777).toBe(0o700)
    expect(lockMode).toBe(0o600)
    expect(statSync(file()).mode & 0o777).toBe(0o600)
  })

  it('leaves an existing directory mode alone', async () => {
    mkdirSync(dir(), { recursive: true })
    chmodSync(dir(), 0o755)
    await store.set('d', { v: 1 })
    expect(statSync(dir()).mode & 0o777).toBe(0o755)
  })
})
