import { describe, it, expect, vi } from 'vitest'
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Journal, journalPath } from '../../src/host/guard/journal.js'

/**
 * Fault switch for the hardening chmod at the end of `append`: null drives
 * the real filesystem, any error object is thrown instead. The rest of
 * `node:fs/promises` stays live, so the suite keeps testing real I/O.
 */
const chmodFault = vi.hoisted(() => ({ error: null as (NodeJS.ErrnoException | null) }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    chmod: async (p: any, mode: any) => {
      if (chmodFault.error) throw chmodFault.error
      return actual.chmod(p, mode)
    },
  }
})

function enoent(): NodeJS.ErrnoException {
  const e = new Error(`ENOENT: no such file or directory, chmod 'x'`) as NodeJS.ErrnoException
  e.code = 'ENOENT'
  return e
}

describe('journal', () => {
  it('appends one JSON line per decision, mode 0600, redacted marker set', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'j-'))
    const j = new Journal(dir, () => 1_700_000_000_000)
    await j.append({ session: 's1', tool: 'bash', rule: 'git.push.protected', tier: 'ask',
      target: 'git push origin main', outcome: 'rejected', askMs: 1200 })
    const line = JSON.parse((await readFile(journalPath(dir), 'utf8')).trim())
    expect(line.rule).toBe('git.push.protected')
    expect(line.tier).toBe('ask')
    expect(line.redacted).toBe(true)
    expect(line.ts).toBe(new Date(1_700_000_000_000).toISOString())
    expect((await stat(journalPath(dir))).mode & 0o777).toBe(0o600)
  })

  it('redacts every string field of the stored line, not just the reason', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'j-'))
    // Assembled from fragments on purpose: no raw secret literal is ever
    // written into this test file.
    const registryToken = ['gl', 'pat', '-', 'AbCdEfGhIjKlMnOpQrSt'].join('')
    const envAssignment = ['DEPLOY', '_TOKEN', '=', 'supersecretvalue'].join('')
    const j = new Journal(dir, () => 1_700_000_000_000)
    await j.append({
      session: 's1', tool: 'bash', rule: 'secret.access', tier: 'deny',
      target: `curl -H 'PRIVATE-TOKEN: ${registryToken}' https://git.example/api`,
      repo: envAssignment, branch: 'main', cwd: '/tmp/work',
      note: `credential surface: ${registryToken}`, outcome: 'denied',
    })
    const raw = await readFile(journalPath(dir), 'utf8')
    expect(raw).not.toContain(registryToken)
    expect(raw).not.toContain('supersecretvalue')
    expect(raw).toContain('[REDACTED]')
    const line = JSON.parse(raw.trim())
    expect(line.target).not.toContain(registryToken)
    expect(line.repo).not.toContain('supersecretvalue')
    expect(line.note).not.toContain(registryToken)
    // The readable part of a prefix-keeping pattern survives; only the value goes.
    expect(line.repo).toBe(['DEPLOY', '_TOKEN=[REDACTED]'].join(''))
    expect(line.redacted).toBe(true)
  })

  it('never throws when the journal location is unusable', async () => {
    const base = await mkdtemp(join(tmpdir(), 'j-'))
    // A REGULAR FILE where the journal directory must go: mkdir(dirname(p), { recursive: true })
    // cannot succeed, so the write genuinely fails with EEXIST/ENOTDIR.
    await writeFile(join(base, 'dsh-maestro-guard'), 'not a directory', 'utf8')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const j = new Journal(base)
      await expect(j.append({ tool: 'bash', rule: 'r', tier: 'deny', target: 'x' })).resolves.toBeUndefined()
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('never throws when the entry cannot be serialized', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'j-'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const j = new Journal(dir, () => 1_700_000_000_000)
      await expect(
        j.append({ tool: 'bash', rule: 'r', tier: 'journal', target: 'x', note: { big: 1n } as unknown as string }),
      ).resolves.toBeUndefined()
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      spy.mockRestore()
    }
  })

  /**
   * Boot-time rotation can rename the live file away between the appendFile
   * above and the hardening chmod below (seen in the wild as `ENOENT ...,
   * chmod '...journal.jsonl'` on boot). The entry is already preserved, so a
   * vanished file is the rotation winning the race — silent, never a logged
   * failure. Any other chmod failure still reports.
   */
  it('stays silent when rotation removes the live file before the chmod', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'j-'))
    chmodFault.error = enoent()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const j = new Journal(dir, () => 1_700_000_000_000)
      await expect(j.append({ tool: 'bash', rule: 'r', tier: 'deny', target: 'x' })).resolves.toBeUndefined()
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
      chmodFault.error = null
    }
  })

  it('still reports a chmod failure that is not a rotation race', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'j-'))
    const denied = new Error('chmod denied') as NodeJS.ErrnoException
    denied.code = 'EACCES'
    chmodFault.error = denied
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const j = new Journal(dir, () => 1_700_000_000_000)
      await expect(j.append({ tool: 'bash', rule: 'r', tier: 'deny', target: 'x' })).resolves.toBeUndefined()
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      spy.mockRestore()
      chmodFault.error = null
    }
  })
})
