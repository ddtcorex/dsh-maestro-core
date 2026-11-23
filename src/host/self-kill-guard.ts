/**
 * Self-kill guard for `tools/pre-execute`: deny bash/shell commands that would
 * kill or restart the very dsh web process the agent is running inside. The
 * model must route restarts through the supervisor's dsh_web_restart tool, not
 * by killing the host.
 *
 * The predicate is scoped to the HOST, not to the verb family: what makes a
 * command a self-kill is its TARGET (a live host pid, or the `dsh` name in a
 * kill/restart shape), never the mere presence of `kill`/`pkill`/`killall`.
 * A blanket verb deny read as "no process may ever be killed through the agent"
 * and blocked ordinary work (`pkill -f chrome`, `systemctl status nginx`,
 * `kill 1234 2>/dev/null`), which is not the protection this file exists for.
 */

import { createRequire } from 'node:module'
import { parseCommand, unwrapSegments, type Segment } from './guard/parse.js'

const require = createRequire(import.meta.url)

// Patterns that restart/stop/start or kill dsh web (systemctl --user units,
// pkill/killall over the dsh tree, killing holders of :3080, and the
// dsh-safe-web-update helper itself). Matched — like dsh-maestro-guard —
// against the executed command surface with quoted/heredoc spans stripped, so
// text that merely MENTIONS these words (echo/printf/script bodies) is data,
// not argv.
const SELF_KILL_RE = /(systemctl\s+--?user\s+.*(restart|stop|start).*dsh-web|pkill\s+.*dsh|killall\s+.*dsh|ss\s+.*3080.*kill|restart-dsh-web)/i

/** Verbs whose whole job is ending a process (their target is what matters). */
const KILL_FAMILY = new Set(['kill', 'pkill', 'killall'])

/**
 * The `systemctl` actions that can stop the host or something it depends on. A
 * read-only `systemctl status` is deliberately absent: it is how an operator
 * inspects the host, and refusing it protects nothing.
 */
const SYSTEMCTL_ACTIONS = new Set([
  'restart', 'stop', 'start', 'kill', 'try-restart', 'reload-or-restart',
  'force-reload', 'isolate', 'reboot', 'halt', 'poweroff', 'suspend',
])

/** The host's own name, in any spelling the process or unit carries it in. */
const DSH_TARGET = /dsh/i

/** Fallback reading for input the parser refuses: a kill-family word plus the host's name. */
const KILL_FAMILY_RAW = /\b(?:kill|pkill|killall)\b/i

/**
 * Remove data spans (quoted strings and heredoc bodies) from a command before
 * self-kill matching. Text inside quotes or a heredoc is content — an echo,
 * printf, node -e script or cat <<'EOF' body can legitimately discuss kill
 * commands without executing one.
 */
export function stripDataSpans(cmd: string): string {
  let out = cmd
  let prev = ''
  while (out !== prev) {
    prev = out
    // heredoc FIRST: the `<<'EOF'` delimiter quotes would otherwise be eaten by
    // the generic quote-strip below and the body would survive as unquoted text
    out = out.replace(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?[^\r\n]*\r?\n[\s\S]*?^\1\s*$/gm, ' ')
    // quote spans respect backslash escapes (`\"` inside a double-quoted
    // node -e body is content, not a delimiter) so nested literals stay stripped
    out = out.replace(/"(?:[^"\\]|\\.)*"/g, ' ').replace(/'(?:[^'\\]|\\.)*'/g, ' ')
  }
  return out
}

/**
 * The dsh web MainThread owns both ports (3000 = gitlab-webhook, 3080 = web).
 * Only listeners on these ports can be dsh web; every other listening process
 * on the host (mysql, sshd, nginx, redis, ...) is explicitly NOT protected.
 */
export const DSH_WEB_PORTS = [3000, 3080]

export type TreeBoundaryKind = 'none' | 'launcher' | 'service-manager'

/**
 * Boundary classification for the ancestor walk — mirrors
 * `skills/dsh-safe-restart/scripts/restart-dsh-web.sh`'s `resolve_tree()`:
 * the walk stops at `pnpm` (the launcher — everything above it is the
 * launching shell, not dsh web) and never walks into a `systemd --user`
 * manager (it owns every user unit on the box). `launcher` pids stay in the
 * forest; `service-manager` pids are never included.
 */
export function treeBoundaryKind(commandLine: string): TreeBoundaryKind {
  if (commandLine.includes('pnpm')) return 'launcher'
  if (commandLine.includes('systemd --user')) return 'service-manager'
  return 'none'
}

export interface ProcessRow { pid: number; ppid: number }

/**
 * Resolve the pids that belong to the dsh web process forest. `listeners` are
 * the pids owning the dsh-web ports (already narrowed by the caller). A pid is
 * protected iff its upward ancestor chain reaches the forest before pid 1:
 *
 *   - the forest roots are the listeners plus every ancestor up to the
 *     `launcher` boundary (pnpm stays inside the forest; systemd --user and
 *     the launching shell stay out);
 *   - the descendant closure then protects the whole owned subtree — the dsh
 *     web node processes AND their bash-tool/browser children — while never
 *     climbing into unrelated ancestors.
 *
 * `boundary(pid)` classifies the command line of a walked pid; it is only
 * invoked for the handful of listener + ancestor pids, never for the full
 * table.
 */
export function resolveDshWebTreePids(
  listeners: number[],
  rows: ProcessRow[],
  boundary: (pid: number) => TreeBoundaryKind = () => 'launcher',
): number[] {
  const byPid = new Map(rows.map(r => [r.pid, r]))
  const roots = new Set<number>()
  for (const pid of listeners) {
    let cur = pid
    for (let depth = 0; cur && cur !== 1 && depth < 100 && !roots.has(cur); depth++) {
      const row = byPid.get(cur)
      if (!row) break
      const kind = boundary(cur)
      if (kind === 'service-manager') break // never climb into systemd --user
      roots.add(cur)
      if (kind === 'launcher') break // pnpm is the ceiling of the forest
      if (row.ppid === cur || row.ppid <= 0) break
      cur = row.ppid
    }
  }
  const protectedSet = new Set(roots)
  for (const row of rows) {
    let cur: number | undefined = row.pid
    for (let depth = 0; cur && cur !== 1 && depth < 100; depth++) {
      if (roots.has(cur)) {
        protectedSet.add(row.pid)
        break
      }
      const next = byPid.get(cur)
      if (!next || next.ppid === cur || next.ppid <= 0) break
      cur = next.ppid
    }
  }
  return [...protectedSet].sort((a, b) => a - b)
}

/**
 * Whether a shell command is a self-kill. Two questions decide it, and both are
 * about the TARGET, never about the verb:
 *
 * 1. does the command name a pid of the dsh web process forest? A command that
 *    signals a live host pid is a self-kill in whatever shape it arrives
 *    (`kill -9 300`, `kill -9 300 2>/dev/null`, `nice kill 300`, `pkill -9 300`),
 *    because the target is exact;
 * 2. does a kill-family or restart shape name the host? `kill`/`pkill`/`killall`
 *    carrying `dsh` in any argument (`pkill -f "dsh web"`, `bash -c "pkill -f
 *    dsh"`), a `systemctl` ACTION on a dsh unit, the `restart-dsh-web` helper,
 *    and killing whatever owns :3080.
 *
 * Everything else is allowed, including a kill of an unrelated pid, `killall
 * node`, `pkill -f chrome` and `systemctl restart mysql`. Wide patterns such as
 * `pkill -f node` can still take the host down, so the guard only promises that
 * it will not DENY ordinary kill-family work: the host's own recovery (supervisor
 * daemon + auto-resume) is what covers an agent that aims badly, exactly as
 * before this file existed.
 */
export function isSelfKillCommand(cmd: string, livePids: number[]): boolean {
  const live = new Set(livePids)
  // An exact host pid anywhere in a kill invocation is a self-kill, including
  // through wrappers whose verb the parser cannot see (`nice -n 10 kill 300`).
  for (const match of cmd.matchAll(/\bkill\s+(?:-\S+\s+)*(\d+)/gi)) {
    if (live.has(Number(match[1]))) return true
  }
  // Shapes whose target the argv does not carry: killing whatever owns :3080,
  // and the guarded restart helper itself.
  const stripped = stripDataSpans(cmd)
  if (SELF_KILL_RE.test(stripped)) return true

  const segs = segmentsOf(cmd)
  if (segs === undefined) {
    // Input the parser refused cannot be proven safe, so it keeps the
    // conservative reading: a kill-family word next to the host's name.
    return KILL_FAMILY_RAW.test(stripped) && DSH_TARGET.test(stripped)
  }
  for (const seg of segs) {
    const verb = commandVerb(seg.verb)
    const argv = seg.argv.slice(1)
    if (!argv.some((token) => DSH_TARGET.test(token))) continue
    if (verb !== undefined && KILL_FAMILY.has(verb)) return true
    if (verb === 'systemctl' && argv.some((token) => SYSTEMCTL_ACTIONS.has(token.toLowerCase()))) return true
  }
  return false
}

/** The segment's verb without its directory (`/bin/kill` → `kill`). */
function commandVerb(verb: string | undefined): string | undefined {
  if (verb === undefined) return undefined
  const cut = verb.lastIndexOf('/')
  return cut === -1 ? verb : verb.slice(cut + 1)
}

/**
 * The command's segments with shell wrappers unwrapped, so a kill hidden behind
 * `bash -c` is judged as the kill it runs. `undefined` when the parser throws,
 * which the caller answers conservatively rather than with an allow.
 */
function segmentsOf(cmd: string): Segment[] | undefined {
  try {
    return unwrapSegments(parseCommand(cmd))
  } catch {
    return undefined
  }
}

/**
 * Live pids of the dsh web OWN forest: pids owning the dsh-web ports
 * (3000/3080) plus their ancestor chain up to the pnpm/systemd boundary and
 * the owned subtree. A kill of an unrelated listener (mysql/sshd/nginx) is
 * therefore allowed — before this scoping the guard denied `kill <pid>` of ANY
 * pid holding a listening socket as a "restart dsh web".
 */
export function dshWebTreeLivePids(): number[] {
  try {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const filter = DSH_WEB_PORTS.map(p => `sport = :${p}`).join(' or ')
    const out = execSync(
      `ss -tlnp '( ${filter} )' 2>/dev/null | sed -n 's/.*pid=\\([0-9]*\\).*/\\1/p' | sort -u`,
      { encoding: 'utf8' },
    )
    const listeners = out.trim().split('\n').filter(Boolean).map(Number)
    if (listeners.length === 0) return []
    const psOut = execSync(`ps -eo pid=,ppid=`, { encoding: 'utf8' })
    const rows: ProcessRow[] = psOut.trim().split('\n')
      .map(line => line.trim().split(/\s+/))
      .filter(p => p.length >= 2 && /^\d+$/.test(p[0]) && /^\d+$/.test(p[1]))
      .map(([pid, ppid]) => ({ pid: Number(pid), ppid: Number(ppid) }))
    // Command lines are only fetched for the walked listener/ancestor pids
    // (a handful of subprocess calls), never for the whole process table.
    const boundary = (pid: number): TreeBoundaryKind => {
      try {
        const args = execSync(`ps -o args= -p ${pid}`, { encoding: 'utf8' })
        return treeBoundaryKind(args)
      } catch {
        return 'launcher' // gone or unreadable → stop walking right here
      }
    }
    return resolveDshWebTreePids(listeners, rows, boundary)
  } catch {
    return []
  }
}

/**
 * Build a `tools/pre-execute` waterfall listener: deny matching
 * bash/shell/exec commands, otherwise delegate to `next()`. Live pids default
 * to the dsh web process forest (see `dshWebTreeLivePids`) so `kill <pid>` of
 * a live host process is caught even when the command names no tool, while a
 * kill of an unrelated service is not.
 */
export function makePreExecuteGuard(opts: { livePids?: () => number[] } = {}) {
  const livePids = opts.livePids ?? dshWebTreeLivePids
  return async (exec: any, next: () => Promise<any>) => {
    // dsh-tools hands the frozen ToolExecution (name + arguments); the guard
    // also accepts the `args` shape for tests/embedded hosts.
    const cmd = String(exec?.args?.command ?? exec?.args?.input ?? exec?.arguments?.command ?? exec?.arguments?.input ?? '')
    if ((exec?.name === 'bash' || exec?.name === 'shell' || exec?.name === 'exec') && isSelfKillCommand(cmd, livePids())) {
      return { kind: 'deny', reason: 'DENIED — this command restarts the dsh web process you are running inside. Use the dsh_web_restart tool (supervisor) for a safe restart.' }
    }
    return next()
  }
}