import { resolveDeepseekHarnessDir } from './paths.js'

/**
 * How to start the `dsh` CLI on this host. `DSH_BIN` (the installed package's
 * bin, e.g. `~/.local/share/dsh/current/bin/dsh`) is the single switch: set,
 * the packaged runtime runs through the current node; unset, the source
 * checkout runs through tsx, which is how hosts without a packaged install
 * have always booted.
 */
export interface DshLaunch {
  command: string
  args: string[]
  cwd?: string
}

export interface DshLaunchDeps {
  env?: Record<string, string | undefined>
  execPath?: string
  sourceDir?: string
}

export function resolveDshLaunch(args: string[], deps: DshLaunchDeps = {}): DshLaunch {
  const env = deps.env ?? process.env
  const command = deps.execPath ?? process.execPath
  const bin = env.DSH_BIN?.trim()
  if (bin) return { command, args: [bin, ...args] }
  return {
    command,
    args: ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', ...args],
    cwd: deps.sourceDir ?? resolveDeepseekHarnessDir(),
  }
}

/** The same launch as a shell fragment (`[cd <dir> && ]exec <argv>`), every word quoted. */
export function dshLaunchShell(args: string[], deps: DshLaunchDeps = {}): string {
  const launch = resolveDshLaunch(args, deps)
  const argv = [launch.command, ...launch.args].map(a => JSON.stringify(a)).join(' ')
  return launch.cwd ? `cd ${JSON.stringify(launch.cwd)} && exec ${argv}` : `exec ${argv}`
}

/**
 * Whether a process command line is a `dsh web` boot in either form: the
 * source entry (`apps/cli/src/bin.ts web`), the package entry (`lib/bin.js
 * web`) or the installed bin (`.../dsh web`).
 */
export function isDshWebCommand(cmd: string): boolean {
  return /(?:\bbin\.[jt]s|\/dsh)\s+web(?:\s|$)/.test(cmd)
}
