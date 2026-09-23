import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

// Wrap execSync so we can observe every call resume.ts makes (it decompresses
// .zstd session logs via a dynamic `import('node:child_process')`), while still
// letting the wrapped calls actually execute for fixture setup and real
// decompression during the tests that need it.
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return { ...actual, execSync: vi.fn(actual.execSync) }
})

import * as childProcess from 'node:child_process'
import { findInterrupted, findDanglingOpenTurns, resolveSessionLogPath } from '../src/host/resume.js'

const mockedExecSync = childProcess.execSync as unknown as ReturnType<typeof vi.fn>

let zstdAvailable = true
try {
  childProcess.execSync('zstd --version', { stdio: 'ignore' })
} catch {
  zstdAvailable = false
}

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'resume-test-'))
  mockedExecSync.mockClear()
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

function sessionDir(group: string, id: string): string {
  const dir = path.join(tmp, 'sessions', group, id)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function writeJsonl(dir: string, lines: string[], mtime?: Date) {
  const file = path.join(dir, 'session.jsonl')
  fs.writeFileSync(file, lines.join('\n') + '\n')
  if (mtime) fs.utimesSync(file, mtime, mtime)
}

function writeZstd(dir: string, lines: string[], mtime?: Date) {
  const plain = path.join(dir, '_src.jsonl')
  fs.writeFileSync(plain, lines.join('\n') + '\n')
  const zstdPath = path.join(dir, 'session.jsonl.zstd')
  childProcess.execSync(`zstd -q -f ${JSON.stringify(plain)} -o ${JSON.stringify(zstdPath)}`)
  fs.rmSync(plain)
  if (mtime) fs.utimesSync(zstdPath, mtime, mtime)
}

function interruptedLine(time: number): string {
  return JSON.stringify({ type: 'turn/end', time, data: { reason: { kind: 'interrupted' } } })
}

function completedLine(time: number): string {
  return JSON.stringify({ type: 'turn/end', time, data: { reason: { kind: 'completed' } } })
}

describe('findInterrupted — plain .jsonl detection', () => {
  it('detects a trailing turn/end interrupted event', async () => {
    const dir = sessionDir('proj', 'sess-a')
    writeJsonl(dir, [
      JSON.stringify({ type: 'turn/start', time: Date.now() - 1000 }),
      interruptedLine(Date.now()),
    ])
    const res = await findInterrupted(tmp)
    expect(res.interrupted).toContain('proj/sess-a')
    expect(res.scanned).toBe(1)
  })

  it('does not detect a turn/end whose reason is completed, not interrupted', async () => {
    const dir = sessionDir('proj', 'sess-b')
    writeJsonl(dir, [completedLine(Date.now())])
    const res = await findInterrupted(tmp)
    expect(res.interrupted).not.toContain('proj/sess-b')
  })

  it('does not crash and does not false-positive on garbage/unparseable lines', async () => {
    const dir = sessionDir('proj', 'sess-c')
    writeJsonl(dir, [
      'not json at all',
      '{ still not valid json',
      JSON.stringify({ type: 'turn/end' }), // no data.reason at all
      completedLine(Date.now()),
    ])
    const result = await findInterrupted(tmp)
    expect(result.interrupted).not.toContain('proj/sess-c')
  })
})

describe('findInterrupted — .zstd detection', () => {
  it.skipIf(!zstdAvailable)('detects an interrupted turn/end in a zstd-compressed log', async () => {
    const dir = sessionDir('proj', 'sess-z')
    writeZstd(dir, [
      JSON.stringify({ type: 'turn/start', time: Date.now() - 1000 }),
      interruptedLine(Date.now()),
    ])
    const res = await findInterrupted(tmp)
    expect(res.interrupted).toContain('proj/sess-z')
  })
})

describe('findInterrupted — time-window filtering', () => {
  it('excludes an interrupted session older than the window and includes one within it', async () => {
    const now = Date.now()
    const oldDir = sessionDir('proj', 'sess-old')
    writeJsonl(oldDir, [interruptedLine(now - 60 * 60 * 1000)]) // 1h ago
    const recentDir = sessionDir('proj', 'sess-recent')
    writeJsonl(recentDir, [interruptedLine(now - 1000)]) // 1s ago

    const res = await findInterrupted(tmp, { withinMs: 5 * 60 * 1000 }) // 5m window
    expect(res.interrupted).not.toContain('proj/sess-old')
    expect(res.interrupted).toContain('proj/sess-recent')
  })
})

describe('findInterrupted — Finding 1: mtime pre-filter avoids decompression', () => {
  it.skipIf(!zstdAvailable)('never decompresses a .zstd log whose mtime predates the requested window', async () => {
    const now = Date.now()
    const oldTime = new Date(now - 60 * 60 * 1000) // 1h old — must be skipped
    const recentTime = new Date(now - 1000) // 1s old — must be scanned

    // Several old sessions that would otherwise all pay the decompression cost.
    for (let i = 0; i < 5; i++) {
      const dir = sessionDir('proj', `sess-old-${i}`)
      writeZstd(dir, [interruptedLine(now - 60 * 60 * 1000)], oldTime)
    }
    const recentDir = sessionDir('proj', 'sess-recent')
    writeZstd(recentDir, [interruptedLine(now - 1000)], recentTime)

    mockedExecSync.mockClear() // ignore the zstd compression calls used for fixture setup

    const res = await findInterrupted(tmp, { withinMs: 5 * 60 * 1000 })

    // Only the recent session's log should have been decompressed.
    expect(mockedExecSync).toHaveBeenCalledTimes(1)
    expect(mockedExecSync.mock.calls[0][0]).toContain('sess-recent')
    expect(res.interrupted).toContain('proj/sess-recent')
    expect(res.interrupted).not.toContain('proj/sess-old-0')
  })

  it.skipIf(!zstdAvailable)('does not skip anything when no time window is requested (sinceMs undefined)', async () => {
    const now = Date.now()
    const oldTime = new Date(now - 60 * 60 * 1000)
    const dir = sessionDir('proj', 'sess-old-unfiltered')
    writeZstd(dir, [interruptedLine(now - 60 * 60 * 1000)], oldTime)

    mockedExecSync.mockClear()

    const res = await findInterrupted(tmp) // no opts -> no window
    expect(mockedExecSync).toHaveBeenCalledTimes(1)
    expect(res.interrupted).toContain('proj/sess-old-unfiltered')
  })
})

describe('findDanglingOpenTurns — genuinely fresh crash, no closer written yet', () => {
  it('detects a session whose log ends mid-turn with no turn/end at all', async () => {
    const dir = sessionDir('proj', 'sess-crashed')
    const now = Date.now()
    writeJsonl(dir, [
      JSON.stringify({ type: 'turn/start', time: now - 2000, data: { turn: 1 } }),
      JSON.stringify({ type: 'step/start', time: now - 1900, data: { turn: 1, step: 1 } }),
      JSON.stringify({ type: 'request/header', time: now - 1800, data: {} }),
    ])
    const res = await findDanglingOpenTurns(tmp)
    expect(res.interrupted).toContain('proj/sess-crashed')
  })

  it('does not flag a session whose last turn closed cleanly', async () => {
    const dir = sessionDir('proj', 'sess-clean')
    const now = Date.now()
    writeJsonl(dir, [
      JSON.stringify({ type: 'turn/start', time: now - 2000, data: { turn: 1 } }),
      JSON.stringify({ type: 'turn/end', time: now - 1000, data: { turn: 1, reason: { kind: 'completed' } } }),
    ])
    const res = await findDanglingOpenTurns(tmp)
    expect(res.interrupted).not.toContain('proj/sess-clean')
  })

  it('does not flag a session that is simply idle (no turn ever started)', async () => {
    const dir = sessionDir('proj', 'sess-idle')
    writeJsonl(dir, [
      JSON.stringify({ type: 'session', time: Date.now() - 5000 }),
    ])
    const res = await findDanglingOpenTurns(tmp)
    expect(res.interrupted).not.toContain('proj/sess-idle')
  })

  it('does not flag a session where an earlier turn closed and a later turn is the one still open (matches by turn number, not just "any turn/end seen")', async () => {
    const dir = sessionDir('proj', 'sess-multi-turn')
    const now = Date.now()
    writeJsonl(dir, [
      JSON.stringify({ type: 'turn/start', time: now - 5000, data: { turn: 1 } }),
      JSON.stringify({ type: 'turn/end', time: now - 4000, data: { turn: 1, reason: { kind: 'completed' } } }),
      JSON.stringify({ type: 'turn/start', time: now - 2000, data: { turn: 2 } }),
      JSON.stringify({ type: 'step/start', time: now - 1900, data: { turn: 2, step: 1 } }),
    ])
    const res = await findDanglingOpenTurns(tmp)
    expect(res.interrupted).toContain('proj/sess-multi-turn')
  })

  it('respects the withinMs window using the log mtime', async () => {
    const dir = sessionDir('proj', 'sess-old-crash')
    const oldTime = new Date(Date.now() - 60 * 60 * 1000)
    writeJsonl(dir, [
      JSON.stringify({ type: 'turn/start', time: oldTime.getTime(), data: { turn: 1 } }),
    ], oldTime)
    const res = await findDanglingOpenTurns(tmp, { withinMs: 5 * 60 * 1000 })
    expect(res.interrupted).not.toContain('proj/sess-old-crash')
  })

  it('detects a crash whose open turn started before the window', async () => {
    // A real long turn: it opened 21 minutes before the process died and the
    // crash appended nothing after the `turn/start`. Keying the window on the
    // turn's own start time skipped exactly this session, so a restart in the
    // middle of a long turn resumed nothing (live case 2026-09-13: a 21-minute
    // turn was interrupted and no auto-continue was triggered). The log's
    // mtime is what says "something happened here recently".
    const dir = sessionDir('proj', 'sess-long-turn')
    const startedAt = Date.now() - 21 * 60 * 1000
    writeJsonl(dir, [
      JSON.stringify({ type: 'turn/start', time: startedAt, data: { turn: 1 } }),
    ], new Date(Date.now() - 30 * 1000))
    const res = await findDanglingOpenTurns(tmp, { withinMs: 5 * 60 * 1000 })
    expect(res.interrupted).toContain('proj/sess-long-turn')
  })

  it('does not crash on garbage/unparseable lines', async () => {
    const dir = sessionDir('proj', 'sess-garbage')
    writeJsonl(dir, ['not json at all', '{"broken"'])
    await expect(findDanglingOpenTurns(tmp)).resolves.toBeDefined()
  })

  it.skipIf(!zstdAvailable)('detects a dangling open turn in a zstd log whose decompressed size exceeds the default execSync maxBuffer', async () => {
    // Regression: real worker sessions decompress to 8-23MB (well over the 1MB
    // default execSync maxBuffer). readSessionAllLines ran `zstd -d -c ...`
    // without a maxBuffer, so any such session threw ENOBUFS and was silently
    // swallowed by the per-session catch — the open-turn scan never saw it.
    const dir = sessionDir('proj', 'sess-big-open-turn')
    const now = Date.now()
    const evts: string[] = []
    for (let i = 1; i <= 20000; i++) {
      evts.push(JSON.stringify({ type: 'turn/start', time: now - 2000, data: { turn: i } }))
    }
    writeZstd(dir, evts, new Date(now - 1000))
    mockedExecSync.mockClear() // ignore the fixture zstd compression calls
    const res = await findDanglingOpenTurns(tmp)
    expect(res.interrupted).toContain('proj/sess-big-open-turn')
  })
})

function writeZstdV3(dir: string, lines: string[], mtime?: Date) {
  const plain = path.join(dir, '_src.jsonl')
  fs.writeFileSync(plain, lines.join('\n') + '\n')
  const zstdPath = path.join(dir, 'session.v3.jsonl.zstd')
  childProcess.execSync(`zstd -q -f ${JSON.stringify(plain)} -o ${JSON.stringify(zstdPath)}`)
  fs.rmSync(plain)
  if (mtime) fs.utimesSync(zstdPath, mtime, mtime)
}

// Regression (2026-09-11 outage): live sessions persist as
// `session.v3.jsonl.zstd`, but the resume scan only looked for
// `session.jsonl.zstd`/`session.jsonl` — every current session was
// silently skipped, so no recovery continue was ever triggered.
describe('v3 session logs', () => {
  it('resolveSessionLogPath prefers the v3 log when both generations exist', () => {
    const dir = sessionDir('proj', 'sess-both')
    writeJsonl(dir, [completedLine(Date.now())])
    writeZstd(dir, [completedLine(Date.now())])
    const v3plain = path.join(dir, '_v3.jsonl')
    fs.writeFileSync(v3plain, interruptedLine(Date.now()) + '\n')
    const v3path = path.join(dir, 'session.v3.jsonl.zstd')
    if (zstdAvailable) {
      childProcess.execSync(`zstd -q -f ${JSON.stringify(v3plain)} -o ${JSON.stringify(v3path)}`)
    } else {
      fs.writeFileSync(v3path, 'v3-stub')
    }
    fs.rmSync(v3plain)
    expect(resolveSessionLogPath(dir)).toBe(v3path)
  })

  it.skipIf(!zstdAvailable)('findInterrupted detects a trailing interrupted turn/end in a v3 log', async () => {
    const dir = sessionDir('proj', 'sess-v3-interrupted')
    writeZstdV3(dir, [
      JSON.stringify({ type: 'turn/start', time: Date.now() - 1000, data: { turn: 9 } }),
      JSON.stringify({ type: 'turn/end', time: Date.now(), data: { turn: 9, reason: { kind: 'interrupted' } } }),
    ])
    const res = await findInterrupted(tmp)
    expect(res.interrupted).toContain('proj/sess-v3-interrupted')
  })

  it.skipIf(!zstdAvailable)('findDanglingOpenTurns detects an open turn in a v3 log', async () => {
    const now = Date.now()
    const dir = sessionDir('proj', 'sess-v3-dangling')
    writeZstdV3(dir, [
      JSON.stringify({ type: 'turn/start', time: now - 2000, data: { turn: 11 } }),
      JSON.stringify({ type: 'step/start', time: now - 1900, data: { turn: 11, step: 1 } }),
    ], new Date(now - 1000))
    const res = await findDanglingOpenTurns(tmp)
    expect(res.interrupted).toContain('proj/sess-v3-dangling')
  })
})

/** One log generation: gen 0 => session.jsonl[.zstd]; gen N => session.vN.jsonl[.zstd]. */
function writeZstdGen(dir: string, gen: number, lines: string[], mtime?: Date): string {
  const name = gen === 0 ? 'session.jsonl.zstd' : `session.v${gen}.jsonl.zstd`
  const plain = path.join(dir, `_src-gen${gen}.jsonl`)
  fs.writeFileSync(plain, lines.join('\n') + '\n')
  const zstdPath = path.join(dir, name)
  childProcess.execSync(`zstd -q -f ${JSON.stringify(plain)} -o ${JSON.stringify(zstdPath)}`)
  fs.rmSync(plain)
  if (mtime) fs.utimesSync(zstdPath, mtime, mtime)
  return zstdPath
}

// Regression (2026-09-23, after the DSH 0.1.7-rc.1 upgrade): the harness bumped
// the session format generation v3 -> v4, so live sessions persist as
// `session.v4.jsonl.zstd`. A resolver that enumerates generation filenames as
// literals goes blind again — the exact silent-skip class as 2026-09-11, which
// is why the generation must be discovered, never listed.
describe('current-generation session logs', () => {
  it('resolves a v4 log when it is the only log in the session dir', () => {
    const dir = sessionDir('proj', 'sess-v4-only')
    fs.writeFileSync(path.join(dir, 'session.lock'), '')
    fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), 'stub')
    expect(resolveSessionLogPath(dir)).toBe(path.join(dir, 'session.v4.jsonl.zstd'))
  })

  it('prefers the newest generation when several generations coexist', () => {
    const dir = sessionDir('proj', 'sess-multi-gen')
    writeJsonl(dir, [completedLine(Date.now())])
    fs.writeFileSync(path.join(dir, 'session.jsonl.zstd'), 'stub-gen0')
    fs.writeFileSync(path.join(dir, 'session.v3.jsonl.zstd'), 'stub-gen3')
    fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), 'stub-gen4')
    expect(resolveSessionLogPath(dir)).toBe(path.join(dir, 'session.v4.jsonl.zstd'))
  })

  it('prefers the compressed artifact when both encodings of one generation exist', () => {
    const dir = sessionDir('proj', 'sess-encoding')
    fs.writeFileSync(path.join(dir, 'session.v4.jsonl'), 'stub-plain')
    fs.writeFileSync(path.join(dir, 'session.v4.jsonl.zstd'), 'stub-zstd')
    expect(resolveSessionLogPath(dir)).toBe(path.join(dir, 'session.v4.jsonl.zstd'))
  })

  it('still reads generations above the ones known today', () => {
    // The generation counter is unbounded — the harness's own
    // generationLogFilename(version, compression) is parameterised and its
    // suite asserts v27 — so a future bump must not need a code change here.
    const dir = sessionDir('proj', 'sess-future-gen')
    fs.writeFileSync(path.join(dir, 'session.v3.jsonl.zstd'), 'stub-gen3')
    fs.writeFileSync(path.join(dir, 'session.v27.jsonl.zstd'), 'stub-gen27')
    expect(resolveSessionLogPath(dir)).toBe(path.join(dir, 'session.v27.jsonl.zstd'))
  })

  it('returns undefined for a session dir that holds no log at all', () => {
    const dir = sessionDir('proj', 'sess-empty')
    fs.writeFileSync(path.join(dir, 'session.lock'), '')
    expect(resolveSessionLogPath(dir)).toBeUndefined()
  })

  it.skipIf(!zstdAvailable)('findInterrupted detects a trailing interrupted turn/end in a v4 log', async () => {
    const dir = sessionDir('proj', 'sess-v4-interrupted')
    writeZstdGen(dir, 4, [
      JSON.stringify({ type: 'turn/start', time: Date.now() - 1000, data: { turn: 2 } }),
      interruptedLine(Date.now()),
    ])
    const res = await findInterrupted(tmp)
    expect(res.interrupted).toContain('proj/sess-v4-interrupted')
  })

  it.skipIf(!zstdAvailable)('findDanglingOpenTurns detects an open turn in a v4 log', async () => {
    const now = Date.now()
    const dir = sessionDir('proj', 'sess-v4-dangling')
    writeZstdGen(dir, 4, [
      JSON.stringify({ type: 'turn/start', time: now - 2000, data: { turn: 12 } }),
      JSON.stringify({ type: 'step/start', time: now - 1900, data: { turn: 12, step: 1 } }),
    ], new Date(now - 1000))
    const res = await findDanglingOpenTurns(tmp)
    expect(res.interrupted).toContain('proj/sess-v4-dangling')
  })

  it.skipIf(!zstdAvailable)('judges a mixed-generation dir by its newest generation, not the stale one', async () => {
    // A dir holding both v3 (old, clean) and v4 (live, interrupted) must be
    // reported interrupted: reading the stale file would both miss this
    // recovery and, on an old interrupted v3, fire a false continue.
    const dir = sessionDir('proj', 'sess-mixed-gen-live')
    const now = Date.now()
    writeZstdGen(dir, 3, [completedLine(now - 60_000)], new Date(now - 60_000))
    writeZstdGen(dir, 4, [
      JSON.stringify({ type: 'turn/start', time: now - 2000, data: { turn: 3 } }),
      interruptedLine(now),
    ])
    const res = await findInterrupted(tmp)
    expect(res.interrupted).toContain('proj/sess-mixed-gen-live')
  })
})
