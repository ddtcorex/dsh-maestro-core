import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dshWebTemplate = resolve(__dirname, '../systemd/dsh-web.service.template')

describe('scaffold', () => {
  it('emits lib/index.js', () => {
    expect(fs.existsSync('lib/index.js')).toBe(true)
  })

  it('the dsh-web unit template caps boot crash loops (StartLimitBurst)', () => {
    const tpl = fs.readFileSync(dshWebTemplate, 'utf8')
    expect(tpl).toMatch(/StartLimitIntervalSec=60/)
    expect(tpl).toMatch(/StartLimitBurst=3/)
  })

  it('the dsh-web unit template waits for the raw :3082 port to free before starting', () => {
    const tpl = fs.readFileSync(dshWebTemplate, 'utf8')
    const pre = tpl.match(/^ExecStartPre=.*$/m)?.[0] ?? ''
    expect(pre).toContain('127.0.0.1:3082')
    // systemd would expand an unescaped $var in the command line.
    expect(pre).not.toMatch(/\$/)
    // ExecStartPre belongs in [Service], StartLimit* in [Unit].
    const service = tpl.slice(tpl.indexOf('[Service]'), tpl.indexOf('[Install]'))
    const unit = tpl.slice(tpl.indexOf('[Unit]'), tpl.indexOf('[Service]'))
    expect(service).toContain(pre)
    expect(unit).toMatch(/StartLimitBurst=3/)
    expect(service).not.toMatch(/StartLimit/)
  })
})

describe('systemd templates run the packaged dsh runtime', () => {
  const web = fs.readFileSync(dshWebTemplate, 'utf8')
  const supervisor = fs.readFileSync(resolve(__dirname, '../systemd/dsh-web-supervisor.service.template'), 'utf8')
  const bin = 'Environment=DSH_BIN=%h/.local/share/dsh/current/bin/dsh'

  it('starts dsh web from DSH_BIN, never from a harness checkout', () => {
    const exec = web.match(/^ExecStart=.*$/m)?.[0] ?? ''
    expect(web).toContain(bin)
    expect(exec).toContain('exec node "$DSH_BIN" web --no-open')
    expect(web).not.toMatch(/tsx|apps\/cli|deepseek-harness/)
  })

  it('runs from a neutral working directory without a project .env', () => {
    expect(web).toMatch(/^WorkingDirectory=%h\/\.local\/share\/dsh$/m)
  })

  it('hands DSH_BIN to the supervisor daemon for its launch fallbacks', () => {
    expect(supervisor).toContain(bin)
  })
})
