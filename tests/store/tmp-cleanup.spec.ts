import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let home: string
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'storetmp-'))
  vi.resetModules()
})
afterEach(() => {
  vi.doUnmock('node:fs/promises')
  rmSync(home, { recursive: true, force: true })
})

describe('failed writes', () => {
  it('leave no settings.json.tmp-* behind', async () => {
    vi.doMock('node:fs/promises', async () => ({
      ...(await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')),
      rename: vi.fn().mockRejectedValue(new Error('disk says no')),
    }))
    const store = await import('../../src/host/store/index.js')
    store.resetForTests()
    await expect(store.set('d', { v: 1 }, { dshHome: home })).rejects.toThrow('disk says no')
    const names = readdirSync(join(home, 'dsh-maestro-config'))
    expect(names.filter((n) => n.includes('.tmp-'))).toEqual([])
  })
})
