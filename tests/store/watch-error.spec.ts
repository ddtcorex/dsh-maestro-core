import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let home: string
let prev: string | undefined
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'storewatch-'))
  prev = process.env.DSH_HOME
  process.env.DSH_HOME = home
  vi.resetModules()
})
afterEach(() => {
  vi.doUnmock('node:fs')
  if (prev === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = prev
  rmSync(home, { recursive: true, force: true })
})

describe('fs.watch failures', () => {
  it('an error event closes the watcher instead of throwing', async () => {
    const fake = Object.assign(new EventEmitter(), { close: vi.fn() })
    vi.doMock('node:fs', async () => ({ ...(await vi.importActual<typeof import('node:fs')>('node:fs')), watch: () => fake }))
    const store = await import('../../src/host/store/index.js')
    store.resetForTests()
    const off = store.onChange(() => {})
    expect(() => fake.emit('error', new Error('EMFILE'))).not.toThrow()
    expect(fake.close).toHaveBeenCalled()
    off()
    store.resetForTests()
  })
})
