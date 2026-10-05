import { appendFileSync, mkdirSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

/**
 * Durable out-of-band resume log (`~/.dsh/.supervisor/resume.log.jsonl`).
 *
 * The in-tree supervisor's `ctx.logger` output does not reach `dsh-web.log`
 * (it goes to the per-session console), which made every `agents.resume`
 * failure invisible on real machines — the 2026-09-02 investigation only
 * recovered the pattern ("last successful continue 12:00Z, then 5 restarts
 * with none", `lastResumeProbe: null`, unconsumed intents) by scanning the
 * session logs. This append-only JSONL sidecar gives a machine-local audit
 * trail of resume outcomes that survives no matter where plugin logs land.
 * Never throws: a write failure must not break the resume path.
 * The path honours `DSH_HOME`. Resolving `homedir()` alone meant every test
 * touching the resume path appended fixture rows to the OPERATOR's journal —
 * `interrupted: ['proj/a-1', 'proj/shared', 'proj/b-2']`, session ids no machine
 * has. Same trap that overwrote the notifier domain's botToken once already.
 */
export interface ResumeLogEntry {
  ts: number
  sessionId?: string
  /** `resume-retry`: a resume blocked by another owner's write handle, retried. */
  kind: 'scan' | 'resume-failed' | 'resumed' | 'no-agent' | 'resume-retry'
  error?: string
  detail?: string
  scanned?: number
  interrupted?: string[]
}

/** The supervisor's own directory under the active DSH home. */
function supervisorDir(): string {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), '.supervisor')
}

export function resumeLogPath(): string {
  return join(supervisorDir(), 'resume.log.jsonl')
}

export function appendResumeLog(entry: ResumeLogEntry): void {
  try {
    const dir = supervisorDir()
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const p = join(dir, 'resume.log.jsonl')
    // The mode goes on the CREATE, not only on the chmod afterwards: a first
    // write would otherwise leave the journal readable by the process umask
    // (0664 measured at umask 002) for as long as the append took. The entry
    // records session ids, so it is never group- or world-readable.
    appendFileSync(p, JSON.stringify(entry) + '\n', { encoding: 'utf8', mode: 0o600 })
    try { chmodSync(p, 0o600) } catch {}
  } catch {}
}

