import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runDebugAgent, _resetDebugAgentForTest, buildDryBootCommand } from '../src/host/debug-agent.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

function fixtureReport(content = 'unknown error XYZ'): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dbg-'))
  const report = path.join(tmp, 'report.md')
  fs.writeFileSync(report, content)
  return report
}

describe('debug-agent — cooldown and max attempts', () => {
  beforeEach(() => _resetDebugAgentForTest())

  it('respects cooldown', async () => {
    const report = fixtureReport('# report')

    // mock dryBoot to succeed so first call returns fixed
    const r1 = await runDebugAgent({
      reportPath: report,
      health: { error: 'transient' },
      cooldownMs: 60000,
      dryBoot: async () => true,
    })
    expect(r1.fixed).toBe(true)

    const r2 = await runDebugAgent({
      reportPath: report,
      health: { error: 'transient' },
      cooldownMs: 60000,
      dryBoot: async () => true,
    })
    expect(r2.reason).toBe('cooldown')
    expect(r2.fixed).toBe(false)
    fs.rmSync(path.dirname(report), { recursive: true, force: true })
  })

  it('stops after 3 attempts', async () => {
    const report = fixtureReport('# report')

    _resetDebugAgentForTest()
    for (let i = 0; i < 3; i++) {
      const r = await runDebugAgent({
        reportPath: report,
        health: { error: `fail ${i}` },
        cooldownMs: 0,
        dryBoot: async () => false,
        exec: () => '',
        readFile: (p: string) => { try { return fs.readFileSync(p, 'utf-8') } catch { return '' } },
      })
      expect(r.fixed).toBe(false)
    }
    const r4 = await runDebugAgent({
      reportPath: report,
      health: { error: 'fourth' },
      cooldownMs: 0,
      dryBoot: async () => false,
      exec: () => '',
      readFile: (p: string) => { try { return fs.readFileSync(p, 'utf-8') } catch { return '' } },
    })
    expect(r4.reason).toBe('max attempts')
    fs.rmSync(path.dirname(report), { recursive: true, force: true })
  })
})

describe('debug-agent — deterministic transient', () => {
  beforeEach(() => _resetDebugAgentForTest())

  it('returns fixed when dryBoot succeeds (transient degraded)', async () => {
    const report = fixtureReport('ERR_MODULE_NOT_FOUND fake')

    const r = await runDebugAgent({
      reportPath: report,
      health: { error: 'ERR_MODULE_NOT_FOUND: lib/index.js' },
      cooldownMs: 0,
      dryBoot: async () => true,
      exec: () => '',
      readFile: (p: string) => { try { return fs.readFileSync(p, 'utf-8') } catch { return '' } },
    })
    expect(r.fixed).toBe(true)
    expect(r.reason).toMatch(/dry-boot ok|transient/i)
    fs.rmSync(path.dirname(report), { recursive: true, force: true })
  })

  it('deterministic auto-fix for allowBuilds applies before dry-boot', async () => {
    const report = fixtureReport('allowBuilds')

    const exec = vi.fn((cmd: string) => {
      if (cmd.includes('pnpm')) return ''
      return ''
    })
    const writeFile = vi.fn((p: string, c: string) => { fs.writeFileSync(p, c) })

    const r = await runDebugAgent({
      reportPath: report,
      health: { error: 'ERR_PNPM allowBuilds.esbuild is not set' },
      cooldownMs: 0,
      exec,
      writeFile,
      readFile: (p: string) => { try { return fs.readFileSync(p, 'utf-8') } catch { return '' } },
      dryBoot: async () => true,
    })

    // allowBuilds deterministic path should try exec + patch, then dryBoot → fixed
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('pnpm'), expect.anything())
    expect(r.fixed).toBe(true)
    fs.rmSync(path.dirname(report), { recursive: true, force: true })
  })

  it('never calls a model or fetch on the crash path', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-key')
    vi.stubEnv('DEEPSEEK_API_URL', 'http://127.0.0.1:1/v1')
    const span = vi.spyOn(globalThis, 'fetch')
    const report = fixtureReport()

    const res = await runDebugAgent({
      reportPath: report,
      health: { error: 'fatal: some htmi', httpCode: 500 },
      cooldownMs: 0,
      exec: () => '',
      readFile: (p: string) => { try { return fs.readFileSync(p, 'utf-8') } catch { return '' } },
      dryBoot: async () => false,
    })

    expect(span).not.toHaveBeenCalled()
    expect(res.fixed).toBe(false)
    expect(res.reason).toContain('manual fix needed')
    expect(res.reason).not.toContain('LLM')
    vi.unstubAllEnvs()
    span.mockRestore()
    fs.rmSync(path.dirname(report), { recursive: true, force: true })
  })
})

describe('debug-agent — dry-boot command', () => {
  const deps = { execPath: '/opt/node/bin/node', sourceDir: '/work/deepseek-harness' }
  it('boots the packaged bin on the temp home when DSH_BIN is set', () => {
    const cmd = buildDryBootCommand('/tmp/x', 19001, { ...deps, env: { DSH_BIN: '/rt/current/bin/dsh' } })
    expect(cmd).toContain(`DSH_HOME=/tmp/x "/opt/node/bin/node" "/rt/current/bin/dsh" "web" "--port" "19001" "--no-open" >/tmp/x/dsh.log 2>&1 &`)
    expect(cmd).not.toContain('pnpm')
  })
  it('boots the source checkout when DSH_BIN is unset', () => {
    const cmd = buildDryBootCommand('/tmp/x', 19001, { ...deps, env: {} })
    expect(cmd).toContain(`cd "/work/deepseek-harness" && DSH_HOME=/tmp/x "/opt/node/bin/node" "--import" "tsx/esm" "apps/cli/src/bin.ts" "web" "--port" "19001" "--no-open"`)
  })
})
