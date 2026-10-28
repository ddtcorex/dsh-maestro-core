import { describe, it, expect } from 'vitest'
import { resolveDshLaunch, dshLaunchShell, isDshWebCommand } from '../src/host/dsh-launch.js'

const deps = { execPath: '/opt/node/bin/node', sourceDir: '/work/deepseek-harness' }

describe('resolveDshLaunch', () => {
  it('runs the packaged bin through the current node when DSH_BIN is set', () => {
    const launch = resolveDshLaunch(['web', '--no-open'], { ...deps, env: { DSH_BIN: '/rt/current/bin/dsh' } })
    expect(launch).toEqual({ command: '/opt/node/bin/node', args: ['/rt/current/bin/dsh', 'web', '--no-open'] })
  })

  it('falls back to the source checkout through tsx when DSH_BIN is unset', () => {
    const launch = resolveDshLaunch(['web', '--no-open'], { ...deps, env: {} })
    expect(launch).toEqual({
      command: '/opt/node/bin/node',
      args: ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--no-open'],
      cwd: '/work/deepseek-harness',
    })
  })

  it('treats an empty DSH_BIN as unset', () => {
    const launch = resolveDshLaunch(['web'], { ...deps, env: { DSH_BIN: '  ' } })
    expect(launch.cwd).toBe('/work/deepseek-harness')
  })
})

describe('dshLaunchShell', () => {
  it('renders the packaged launch as a quoted shell fragment', () => {
    const sh = dshLaunchShell(['web', '--port', '9001'], { ...deps, env: { DSH_BIN: '/rt/my dir/dsh' } })
    expect(sh).toBe(`exec "/opt/node/bin/node" "/rt/my dir/dsh" "web" "--port" "9001"`)
  })

  it('renders the source launch with a cd into the checkout', () => {
    const sh = dshLaunchShell(['web'], { ...deps, env: {} })
    expect(sh).toBe(`cd "/work/deepseek-harness" && exec "/opt/node/bin/node" "--import" "tsx/esm" "apps/cli/src/bin.ts" "web"`)
  })
})

describe('isDshWebCommand', () => {
  it.each([
    'node --import tsx/esm apps/cli/src/bin.ts web --port 9417',
    'node /home/u/.local/share/dsh/current/bin/dsh web --no-open --port 9417',
    'node /x/lib/node_modules/@deepseek-ai/dsh/lib/bin.js web --port 9417',
  ])('recognises %s', cmd => {
    expect(isDshWebCommand(cmd)).toBe(true)
  })

  it.each([
    'node /x/packages/dsh-maestro-core/lib/bin.js daemon',
    'node /x/bin/dsh plugin add foo',
    'node /x/bin/dshweb',
  ])('ignores %s', cmd => {
    expect(isDshWebCommand(cmd)).toBe(false)
  })
})
