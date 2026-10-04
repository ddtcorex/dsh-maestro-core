import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('store without ambient validators', () => {
  it('registers no domain at import', async () => {
    process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'store-'))
    const store = await import('../../src/host/store/index.js')
    store.resetForTests()
    expect(store.definedDomains()).toEqual([])
  })

  it('accepts any shape for a domain nobody registered', async () => {
    process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'store-'))
    const store = await import('../../src/host/store/index.js')
    await expect(store.set('notifier', { telegram: { botToken: 1 } })).resolves.toBeUndefined()
  })
})
