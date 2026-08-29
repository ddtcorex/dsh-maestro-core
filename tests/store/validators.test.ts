import { describe, it, expect } from 'vitest'
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'
describe('guard validators', () => {
  it('guard domain accepts valid toggles', async () => {
    const { guardValidator } = await import('../src/index.js')
    const r = guardValidator.parse({ publishBlocked: true, gitProtection:{enabled:true, branches:['master','main']}, credentialPaths:['~/.example/credentials.yaml'] })
    expect(r.ok).toBe(true)
  })
  it('guardBlacklist accepts 19 patterns', async () => {
    const { guardBlacklistValidator } = await import('../src/index.js')
    const r = guardBlacklistValidator.parse({ patterns: ['example-project','example-project-large'], placeholders:{'example-project':'placeholder'} })
    expect(r.ok).toBe(true)
  })
})
