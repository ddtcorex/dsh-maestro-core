import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { guardValidator, guardBlacklistValidator } from '../../src/host/guard/validators.js'
import { definedDomains, resetForTests, set } from '../../src/host/store/index.js'

describe('guard validators', () => {
  it('guard domain accepts valid toggles', () => {
    const r = guardValidator.parse({ publishBlocked: true, gitProtection: { enabled: true, branches: ['master', 'main'] }, credentialPaths: ['~/.example/credentials.yaml'] })
    expect(r.ok).toBe(true)
  })
  it('guard domain rejects a non-boolean publishBlocked', () => {
    expect(guardValidator.parse({ publishBlocked: 'yes' }).ok).toBe(false)
  })
  it('guardBlacklist accepts patterns and placeholders', () => {
    const r = guardBlacklistValidator.parse({ patterns: ['example-project', 'example-project-large'], placeholders: { 'example-project': 'placeholder' } })
    expect(r.ok).toBe(true)
  })
  it('guardBlacklist rejects non-array patterns', () => {
    expect(guardBlacklistValidator.parse({ patterns: 'x' }).ok).toBe(false)
  })
})

describe('guard module registers its domains', () => {
  let home: string
  beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'guardreg-')) })
  afterEach(async () => { await rm(home, { recursive: true, force: true }) })

  it('importing the guard module defines guard and guardBlacklist', async () => {
    // The registry survives resetForTests by design; read it right after the import.
    await import('../../src/host/guard/index.js')
    resetForTests()
    expect(definedDomains()).toEqual(expect.arrayContaining(['guard', 'guardBlacklist']))
    await expect(set('guard', { publishBlocked: 'nope' }, { dshHome: home })).rejects.toThrow(/validation failed for 'guard'/)
  })
})
