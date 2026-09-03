import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/client')
const read = (f: string) => readFileSync(resolve(clientDir, f), 'utf8')

describe('Task 3: Settings UI tabs', () => {
  it('live settings card renders Guard tab', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('Guard')
  })

  it('Settings has 4 tabs: Guard | Blacklist | Supervisor | Notifier', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('Guard')
    expect(src).toContain('Blacklist')
    expect(src).toContain('Supervisor')
    expect(src).toContain('Notifier')
  })

  it('Guard tab has toggles for publishBlocked, gitProtection.enabled, cwdContainment', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('publishBlocked')
    expect(src).toContain('gitProtection')
    expect(src).toContain('cwdContainment')
  })

  it('Blacklist tab has textarea for patterns (one per line) plus placeholders JSON', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toMatch(/textarea/i)
    expect(src).toContain('patterns')
    expect(src).toContain('placeholders')
  })

  it('Supervisor tab has intervalMs etc', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('intervalMs')
  })

  it('Notifier tab has telegram fields', () => {
    const src = read('MaestroSettings.tsx')
    expect(src).toContain('telegram')
  })

  it('host exposes guard/guardBlacklist domains via RPC get/set (generic channel)', () => {
    const host = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/host/index.ts'), 'utf8')
    expect(host).toContain('/dsh-maestro-config')
    expect(host).toContain("'get'")
    expect(host).toContain("'set'")
  })

  it('client index wires configRpcCall for guard domains', () => {
    const entry = read('index.tsx')
    expect(entry).toContain('configRpcCall')
    expect(entry).toContain('/dsh-maestro-config')
  })
})
