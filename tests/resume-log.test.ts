import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendResumeLog, resumeLogPath } from '../src/host/resume-log.js'

/**
 * The resume log is the operator's audit trail — the record of which sessions
 * the supervisor resumed after a restart. It used to resolve `homedir()` only,
 * so `DSH_HOME` was ignored and every test that touched the resume path wrote
 * fixture rows into the real file. The operator's journal grew entries like
 * `interrupted: ['proj/a-1', 'proj/shared', 'proj/b-2']` — session ids no
 * machine has.
 *
 * The same trap has already cost this workspace real data once: a store test
 * without DSH_HOME overwrote the `notifier` domain's botToken and chatId.
 */
const created: string[] = []
let home = ''

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'dsh-resume-log-'))
  created.push(home)
  process.env.DSH_HOME = home
})

afterEach(() => {
  delete process.env.DSH_HOME
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('resume log path', () => {
  it('follows DSH_HOME instead of the real home', () => {
    expect(resumeLogPath()).toBe(join(home, '.supervisor', 'resume.log.jsonl'))
  })

  it('falls back to the home directory when DSH_HOME is unset', () => {
    delete process.env.DSH_HOME
    // Read-only assertion: this resolves the operator's path without writing.
    expect(resumeLogPath()).toMatch(/\.dsh[/\\]\.supervisor[/\\]resume\.log\.jsonl$/)
  })

  it('writes into the isolated home, never the operator journal', () => {
    appendResumeLog({ ts: 1, kind: 'scan', scanned: 0, interrupted: [] })

    const written = join(home, '.supervisor', 'resume.log.jsonl')
    expect(existsSync(written), 'the entry did not land in the isolated home').toBe(true)
    expect(readFileSync(written, 'utf8')).toContain('"kind":"scan"')
  })

  it('keeps the file private', () => {
    appendResumeLog({ ts: 1, kind: 'scan', scanned: 0, interrupted: [] })
    const written = join(home, '.supervisor', 'resume.log.jsonl')
    // mode 600: the log records session ids. Read it with statSync — a Buffer
    // from readFileSync carries no mode, so `readFileSync(p).mode & 0o777` is
    // 0 and would fail this assertion no matter what the writer did.
    expect(statSync(written).mode & 0o777).toBe(0o600)
  })

  it('creates the journal 600 on first write, before any chmod', () => {
    // A first write must not expose session ids at the process umask for even
    // the microseconds between create and chmod, so the mode is passed to the
    // create itself. The umask is forced loose so a regression is visible.
    const prev = process.umask(0o000)
    try {
      appendResumeLog({ ts: 1, kind: 'scan', scanned: 0, interrupted: [] })
      const journal = join(home, '.supervisor', 'resume.log.jsonl')
      expect(statSync(journal).mode & 0o777).toBe(0o600)
    } finally {
      process.umask(prev)
    }
  })

  it('never throws when the directory cannot be created', () => {
    // A regular file stands where the supervisor directory must go, so mkdir
    // fails with ENOTDIR immediately.
    //
    // Do NOT point this at `/proc/…` for the "unwritable" case: mkdirSync on a
    // procfs path BLOCKS in the kernel indefinitely (measured 2026-10-05 — it
    // never returns and never throws), which hangs the whole vitest worker
    // rather than exercising the catch path.
    const blocker = join(home, 'blocker')
    writeFileSync(blocker, 'not a directory')
    process.env.DSH_HOME = blocker

    expect(() => appendResumeLog({ ts: 1, kind: 'scan', scanned: 0, interrupted: [] })).not.toThrow()
  })
})
