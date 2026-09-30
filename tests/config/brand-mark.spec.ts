import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const clientDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/client')
const read = (f: string) => readFileSync(resolve(clientDir, f), 'utf8')

describe('Maestro M logo reference implementation', () => {
  // The documented source of the glyph used to be
  // dsh-maestro-dashboard/src/client/components/BrandMark.tsx, which this
  // plugin set removes. The declaration now lives here, in the plugin that
  // survives. Every OTHER Maestro package still inlines its own copy and must:
  // each declares its own dsh.client entry and builds its own lib/client.js, so
  // one plugin's client module cannot import another's, and
  // dsh-maestro-remote's copy is a host-side HTML string. That duplication is
  // structural — do not "fix" it with a cross-plugin import.

  it('declares the canonical path exactly once', () => {
    const brand = read('components/BrandMark.tsx')
    expect(brand).toContain("export const MAESTRO_MARK_PATH = 'M2 11 L5 4 L8 9 L11 4 L14 11'")
    expect(brand).toContain("export const MAESTRO_MARK_VIEWBOX = '0 0 16 16'")
    expect(brand).toContain('export const MAESTRO_MARK_STROKE_WIDTH = 1.6')
    expect(brand).toContain("export const MAESTRO_BRAND_TILE = '#0A84FF'")
  })

  // The consumers build their glyph from the constant. A re-hardcoded literal
  // is how the glyph drifted across four files in the first place.
  it('leaves no literal copy in the settings-nav CSS', () => {
    const entry = read('index.tsx')
    expect(entry).toContain('maestroMarkMaskUri()')
    expect(entry).not.toContain('M2 11 L5 4')
  })

  it('leaves no inline badge style in the settings card', () => {
    const card = read('MaestroSettings.tsx')
    expect(card).toContain('BrandBadge')
    expect(card).not.toContain('M2 11 L5 4')
    // The badge tile colour is part of the house pattern AGENTS.md documents,
    // so it belongs to the reference implementation. Scoped to the JS inline
    // style on purpose: the card ALSO injects a <style> block at ~line 1923
    // with `background-color:#0A84FF !important` to beat shell styles, and
    // that override has no business moving into a component.
    expect(card).not.toContain("backgroundColor: '#0A84FF'")
  })
})
