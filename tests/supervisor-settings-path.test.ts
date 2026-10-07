import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { Supervisor } from '../src/host/supervisor.js'

/**
 * The supervisor reads its auto-resume keys from the canonical settings store
 * path (`<dsh home>/dsh-maestro-config/settings.json`) and never consults the
 * retired `<dsh home>/maestro/settings.json`.
 */
describe('Supervisor settings path', () => {
  const saved = { HOME: process.env.HOME, DSH_HOME: process.env.DSH_HOME, EN: process.env.DSH_SUPERVISOR_AUTO_RESUME, WI: process.env.DSH_SUPERVISOR_RESUME_WITHIN }
  let home: string

  const write = (rel: string, body: unknown) => {
    const p = path.join(home, '.dsh', rel)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, JSON.stringify(body))
  }
  const sup = () => new Supervisor({} as any) as any

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'sup-settings-'))
    process.env.HOME = home
    delete process.env.DSH_HOME
    delete process.env.DSH_SUPERVISOR_AUTO_RESUME
    delete process.env.DSH_SUPERVISOR_RESUME_WITHIN
  })
  afterEach(() => {
    for (const [k, v] of [['HOME', saved.HOME], ['DSH_HOME', saved.DSH_HOME], ['DSH_SUPERVISOR_AUTO_RESUME', saved.EN], ['DSH_SUPERVISOR_RESUME_WITHIN', saved.WI]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    fs.rmSync(home, { recursive: true, force: true })
  })

  it('reads autoResumeEnabled from the canonical store path', () => {
    write('dsh-maestro-config/settings.json', { version: 1, domains: { supervisor: { autoResumeEnabled: false } } })
    expect(sup().getAutoResumeEnabled()).toBe(false)
  })

  it('reads autoResumeWithin from the canonical store path', () => {
    write('dsh-maestro-config/settings.json', { version: 1, domains: { supervisor: { autoResumeWithin: 9 } } })
    expect(sup().getResumeWithinMs()).toBe(9 * 60 * 1000)
  })

  it('ignores the retired maestro path', () => {
    write('maestro/settings.json', { domains: { supervisor: { autoResumeEnabled: false } } })
    expect(sup().getAutoResumeEnabled()).toBe(true)
  })

  it('prefers the canonical file over the retired one', () => {
    write('maestro/settings.json', { domains: { supervisor: { autoResumeEnabled: false } } })
    write('dsh-maestro-config/settings.json', { version: 1, domains: { supervisor: { autoResumeEnabled: true } } })
    expect(sup().getAutoResumeEnabled()).toBe(true)
  })
})
