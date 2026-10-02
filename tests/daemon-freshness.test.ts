import { describe, it, expect } from 'vitest'
import { supervisorDaemonState, describeDaemonState, type DaemonStateDeps } from '../src/host/daemon-freshness.js'

// The bash helper owns this judgement for out-of-session callers
// (restart-dsh-web.sh supervisor_daemon_state); the tool needs the same answer
// in-tree so a scheduled restart can report the daemon's verdict instead of
// leaving the agent to remember to look. Every probe is injected — this suite
// never touches /proc, systemd or the real lib/.
const DAEMON_START = 1_000_000
const LIB_AFTER_START = 1_060_000

function deps(over: Partial<DaemonStateDeps> = {}): DaemonStateDeps {
  return {
    mainPid: () => 4242,
    cmdline: () => 'node /srv/dsh-maestro/lib/bin.js daemon',
    startMs: () => DAEMON_START,
    newestLibMs: () => LIB_AFTER_START,
    ...over,
  }
}

const iso = (ms: number) => new Date(ms).toISOString().slice(11, 19)

describe('supervisorDaemonState', () => {
  it('is stale when the newest lib build is newer than the daemon start', () => {
    // The 2026-10-02 case: daemon started 19:18:01, lib rebuilt 19:58:19.
    const state = supervisorDaemonState(deps())
    expect(state.verdict).toBe('stale')
    expect(state.pid).toBe(4242)
    expect(state.startMs).toBe(DAEMON_START)
    expect(state.libMs).toBe(LIB_AFTER_START)
  })

  it('is fresh when the daemon started after the newest lib build', () => {
    expect(supervisorDaemonState(deps({ newestLibMs: () => DAEMON_START - 1 })).verdict).toBe('fresh')
  })

  it('treats the exact boundary as fresh (only a strictly newer build is stale)', () => {
    // Same comparison the bash helper makes (`LIB > START`); pinning it so a
    // future `<=` cannot turn every same-second reload into a stale verdict.
    expect(supervisorDaemonState(deps({ newestLibMs: () => DAEMON_START })).verdict).toBe('fresh')
  })

  it('is absent when no daemon is running', () => {
    expect(supervisorDaemonState(deps({ mainPid: () => undefined })).verdict).toBe('absent')
    expect(supervisorDaemonState(deps({ mainPid: () => 0 })).verdict).toBe('absent')
  })

  it('is absent — never a foreign pid — when MainPID is not this daemon', () => {
    // systemd can report a MainPID whose cmdline is something else entirely;
    // the bash helper refuses that pid rather than signalling it.
    const state = supervisorDaemonState(deps({ cmdline: () => '/usr/bin/some-other-service --serve' }))
    expect(state.verdict).toBe('absent')
    expect(state.pid).toBeUndefined()
  })

  it('is unknown when the start time cannot be read', () => {
    const state = supervisorDaemonState(deps({ startMs: () => undefined }))
    expect(state.verdict).toBe('unknown')
    expect(state.pid).toBe(4242)
  })

  it('is unknown when the package has no built lib yet', () => {
    expect(supervisorDaemonState(deps({ newestLibMs: () => undefined })).verdict).toBe('unknown')
  })
})

describe('describeDaemonState', () => {
  it('names the pid and the reload command for a stale daemon', () => {
    const text = describeDaemonState(supervisorDaemonState(deps()), iso)
    expect(text).toContain('stale')
    expect(text).toContain('4242')
    expect(text).toContain('kill -TERM 4242')
    expect(text).toContain(iso(DAEMON_START))
    expect(text).toContain(iso(LIB_AFTER_START))
  })

  it('carries no kill advice for a fresh daemon', () => {
    const text = describeDaemonState(supervisorDaemonState(deps({ newestLibMs: () => DAEMON_START - 1 })), iso)
    expect(text).toMatch(/fresh/)
    expect(text).not.toContain('kill')
  })

  it('stays advice-free when the daemon is absent or unmeasurable', () => {
    expect(describeDaemonState(supervisorDaemonState(deps({ mainPid: () => undefined })), iso)).toMatch(/absent/)
    expect(describeDaemonState(supervisorDaemonState(deps({ startMs: () => undefined })), iso)).not.toContain('kill')
  })
})