/**
 * Supervisor-daemon freshness, in-tree.
 *
 * `dsh web` is not the only process that caches this package's `lib/*.js` in
 * RAM: the standalone `dsh-web-supervisor` daemon does too, and it is the
 * process that decides whether a fresh boot is healthy or must be rolled back.
 * A daemon started BEFORE the newest build keeps applying the OLD rollback
 * rules — on 2026-09-13 exactly that judged a slow boot as down and rolled
 * `dsh web` back in a loop while the port answered in 1.4ms.
 *
 * The bash helper (`skills/dsh-safe-restart/scripts/restart-dsh-web.sh`,
 * `supervisor_daemon_state`) owns the same judgement for out-of-session
 * callers and refuses to swap under a stale daemon. An agent inside `dsh web`
 * cannot run that helper (the self-kill guard refuses it) and could easily
 * forget the check, so `dsh_web_restart` reports the verdict itself at schedule
 * time. This is a READ-ONLY probe: it never signals the daemon — only systemd
 * owns its relaunch, so the reload stays an explicit `kill -TERM <pid>` step.
 */

import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { resolveSupervisorPackageDir } from './paths.js'

/** fresh = the daemon runs the newest build; stale = it predates it. */
export type DaemonVerdict = 'fresh' | 'stale' | 'absent' | 'unknown'

export interface DaemonState {
  verdict: DaemonVerdict
  pid?: number
  /** Process start, from the `/proc/<pid>` directory mtime. */
  startMs?: number
  /** Newest mtime among this package's built `lib/*.js`. */
  libMs?: number
}

/** Every probe is injected so the judgement is unit-testable without systemd. */
export interface DaemonStateDeps {
  mainPid?: () => number | undefined
  cmdline?: (pid: number) => string | undefined
  startMs?: (pid: number) => number | undefined
  newestLibMs?: () => number | undefined
}

const UNIT = 'dsh-web-supervisor.service'
/** A pid is only ever considered this daemon when its cmdline says so. */
const DAEMON_MARK = 'bin.js daemon'

/**
 * Classify the daemon as fresh | stale | absent | unknown. Mirrors the bash
 * helper exactly, including the boundaries: an unbuildable package and an
 * unreadable start time are `unknown` (never silently `fresh`), and a MainPID
 * whose cmdline is someone else's is `absent`, so no caller can signal it.
 */
export function supervisorDaemonState(deps: DaemonStateDeps = {}): DaemonState {
  const pid = (deps.mainPid ?? defaultMainPid)()
  if (!pid) return { verdict: 'absent' }

  const cmd = (deps.cmdline ?? defaultCmdline)(pid)
  if (!cmd || !cmd.includes(DAEMON_MARK)) return { verdict: 'absent' }

  const startMs = (deps.startMs ?? defaultStartMs)(pid)
  const libMs = (deps.newestLibMs ?? defaultNewestLibMs)()
  if (startMs === undefined || libMs === undefined) return { verdict: 'unknown', pid }

  // Strictly newer, matching the bash helper: a same-second build is not stale.
  return { verdict: libMs > startMs ? 'stale' : 'fresh', pid, startMs, libMs }
}

/**
 * One line for a tool result. Only the stale case carries a command — the
 * agent has to act on it before the swap lands, and it has to be the exact
 * safe form (the daemon pid, never the `dsh web` pid, never `systemctl`).
 */
export function describeDaemonState(state: DaemonState, formatMs: (ms: number) => string = defaultFormatMs): string {
  switch (state.verdict) {
    case 'stale':
      return `supervisor daemon: stale pid=${state.pid} (started ${formatMs(state.startMs!)}, newest lib ${formatMs(state.libMs!)}) — it judges the new boot with the old build, so \`kill -TERM ${state.pid}\` it NOW, before the swap lands`
    case 'fresh':
      return `supervisor daemon: fresh pid=${state.pid} (started ${formatMs(state.startMs!)}, newest lib ${formatMs(state.libMs!)})`
    case 'unknown':
      return `supervisor daemon: unknown pid=${state.pid} (its start time or this package's build time is unreadable) — compare them by hand before the swap`
    default:
      return 'supervisor daemon: absent — nothing to reload'
  }
}

function defaultFormatMs(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString()
  } catch {
    return String(ms)
  }
}

/** MainPID of the supervisor unit. Read-only `systemctl --user show`. */
function defaultMainPid(): number | undefined {
  try {
    const out = execFileSync('systemctl', ['--user', 'show', '-p', 'MainPID', '--value', UNIT], {
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const pid = Number.parseInt(String(out).replace(/[^0-9]/g, ''), 10)
    return Number.isInteger(pid) && pid > 0 ? pid : undefined
  } catch {
    return undefined
  }
}

function defaultCmdline(pid: number): string | undefined {
  try {
    return readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim()
  } catch {
    return undefined
  }
}

/** A process' `/proc/<pid>` directory mtime is its start time on Linux. */
function defaultStartMs(pid: number): number | undefined {
  try {
    return statSync(`/proc/${pid}`).mtimeMs
  } catch {
    return undefined
  }
}

function defaultNewestLibMs(): number | undefined {
  try {
    const libDir = join(resolveSupervisorPackageDir(), 'lib')
    let newest: number | undefined
    for (const name of readdirSync(libDir)) {
      if (!name.endsWith('.js')) continue
      try {
        const m = statSync(join(libDir, name)).mtimeMs
        if (newest === undefined || m > newest) newest = m
      } catch {}
    }
    return newest
  } catch {
    return undefined
  }
}