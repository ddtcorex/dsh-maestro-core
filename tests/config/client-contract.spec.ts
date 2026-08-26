import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/client')
const read = (f: string) => readFileSync(resolve(clientDir, f), 'utf8')

describe('settings section registration contract', () => {
  const entry = read('index.tsx')

  it('registers as "Maestro" (not "Maestro Config") right below Agent presets', () => {
    expect(entry).toContain("id: 'maestro'")
    expect(entry).toContain("order: 25")
    expect(entry).toMatch(/label:\s*\(\)\s*=>\s*'Maestro'/)
    expect(entry).not.toContain('Maestro Config')
  })

  it('speaks the canonical granular review RPC channel', () => {
    expect(read('api.ts')).toContain("'/dsh-maestro-review'")
  })

  it('installs the settings-nav icon marker and disposes it', () => {
    expect(entry).toContain('registerSettingsNavIcon')
    expect(entry).toContain('SETTINGS_NAV_CSS')
    expect(entry).toMatch(/ctx\.effect\([\s\S]*?registerSettingsNavIcon/)
  })

  it('keeps the legacy card visuals (alias tokens, masked secrets, sections)', () => {
    const card = read('maestro-card.jsx')
    expect(card).toContain('--dsw-alias-border-l2')
    expect(card).toContain("--dsw-alias-bg-layer-3")
    expect(card).toContain("'password'")
    expect(card).toContain('saved — leave blank to keep')
    expect(card).toContain('Tracked projects')
    // audio-lines glyph mask from the old bundle
    expect(card + entry).toContain('data:image/svg+xml')
    expect(read('settings-nav-icon.ts')).toContain('data-maestro-settings-nav')
  })
})
