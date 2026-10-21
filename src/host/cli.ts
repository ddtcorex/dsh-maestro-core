import { Supervisor } from './supervisor.js'
import { pollHealth } from './health-poller.js'
import * as path from 'node:path'
import * as os from 'node:os'
import { resolveHarnessRoot } from './paths.js'
import { checkPlannedRestart, readRestartRequest, clearPlannedRestart } from './restart-guards.js'
import { readSupervisorConfig } from './config.js'

export async function runCli(args: string[]): Promise<void> {
  const cmd = args[2] ?? '--help'
  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(`Usage: dsh-web-supervisor <command>

Commands:
  daemon     Run supervisor daemon (poll every 3s)
  status     Show health
  resume [--within <dur>]  List interrupted sessions (filter by time, e.g. 5m, 30s, 1h)
  boot-guard acquire|release --pid <pid>  Take/release boot.lock + boot-boundary (used by the safe-restart script)
`)
    return
  }
  if (cmd === 'boot-guard') {
    const { runBootGuardCli } = await import('./boot-guard.js')
    process.exit(runBootGuardCli(args.slice(3)))
  }
  if (cmd === 'status') {
    const health = await pollHealth()
    console.log(`up: ${health.up}, httpCode: ${health.httpCode}, error: ${health.error ?? 'none'}`)
    return
  }
  if (cmd === 'resume') {
    const withinIdx = args.indexOf('--within')
    let withinMs: number | undefined
    if (withinIdx !== -1) {
      const raw = args[withinIdx + 1] ?? ''
      const { parseDuration } = await import('./resume.js')
      withinMs = parseDuration(raw)
      if (withinMs === undefined) {
        console.error(`invalid --within value: ${raw} (use e.g. 5m, 30s, 1h)`)
        process.exit(1)
      }
    }
    const { findInterrupted } = await import('./resume.js')
    const res = await findInterrupted(undefined, withinMs !== undefined ? { withinMs } : undefined)
    if (withinMs !== undefined) {
      console.log(`interrupted within ${args[withinIdx + 1]}: ${res.interrupted.length}/${res.scanned}`)
    } else {
      console.log(`interrupted: ${res.interrupted.length}/${res.scanned}`)
    }
    for (const id of res.interrupted) console.log(id)
    return
  }
  if (cmd === 'daemon') {
    console.log('[supervisor] starting daemon — poll every 3s, Ctrl+C to stop')
    const reportsRoot = path.join(os.homedir(), '.dsh/.supervisor/reports')
    const supervisor = new Supervisor({
      pollHealth: () => pollHealth(),
      writeReport: async ({ ts, health, action, logTail, gitDiff }: any) => {
        const { writeReport, collectGitDiff } = await import('./report.js')
        const { collectLogTail } = await import('./health-poller.js')
        // Prefer supervisor-provided tail/diff (from health.logTail); fallback to live collect
        let tail: string = logTail ?? (health as any).logTail ?? ''
        if (!tail) {
          try { tail = await collectLogTail() } catch { tail = '' }
        }
        let diff: string = gitDiff ?? ''
        if (!diff) {
          try {
            const harnessRoot = resolveHarnessRoot()
            diff = await collectGitDiff(harnessRoot).catch(() => '')
            if (!diff) {
              // fallback: try git diff in cwd
              const { execSync } = await import('node:child_process')
              try { diff = execSync('git diff 2>/dev/null | head -n 200', { encoding: 'utf-8', timeout: 2000 }) } catch { diff = '' }
            }
          } catch { diff = '' }
        }
        return writeReport({ reportsRoot, ts, health, gitDiff: diff, logTail: tail, action })
      },
      restartWeb: async () => {
        // One implementation of the single-boot restart: marker (TTL = boot
        // budget) → boot.lock → serialized systemd start → direct-node nohup
        // only on hosts where the unit does not exist (D4/D5).
        const { performSingleBootRestart, DEFAULT_BOOT_GRACE_MS } = await import('./restart-web.js')
        let grace = DEFAULT_BOOT_GRACE_MS
        try {
          const cfg = await readSupervisorConfig()
          if (typeof (cfg as any).bootGraceMs === 'number' && (cfg as any).bootGraceMs > 0) grace = (cfg as any).bootGraceMs
        } catch {}
        const res = await performSingleBootRestart({ bootGraceMs: grace })
        if (!res.restarted) console.log(`[supervisor] restart skipped: ${res.reason ?? 'boot lock held'}`)
      },
      notify: async (msg) => console.log(`[notify] ${msg}`),
      isPlannedRestartActive: () => checkPlannedRestart(),
      // dsh_web_restart marker ownership: the daemon acts on the marker. After
      // the restart, scan recent session logs for torn tails (an in-flight
      // session truncated by the restart) and report; the marker is cleared in
      // the supervisor's own finally block and again here as a safety net.
      readRestartRequest: () => readRestartRequest(),
      onRestartRequestHandled: async () => {
        const { scanSessions } = await import('./scan.js')
        const res = await scanSessions(path.join(os.homedir(), '.dsh'), { withinMs: 10 * 60 * 1000 }).catch(() => ({ scanned: 0, torn: [] }))
        if (res.torn.length) {
          console.log(`[supervisor] post-self-restart scan: ${res.torn.length} torn session log(s)`)
        } else {
          console.log('[supervisor] post-self-restart scan: clean')
        }
        void clearPlannedRestart()
      },
    })
    await supervisor.start()
    // keep process alive
    await new Promise(() => {})
  }
  console.log(`unknown command: ${cmd} — try --help`)
}
