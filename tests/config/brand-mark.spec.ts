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
    // The declarations live in the react-free maestro-mark.ts so a test can
    // import them; components/BrandMark.tsx only re-exports them. Asserting
    // the single home AND the absence of a second copy is what keeps it single.
    const mark = read('maestro-mark.ts')
    expect(mark).toContain("export const MAESTRO_MARK_PATH = 'M2 11 L5 4 L8 9 L11 4 L14 11'")
    expect(mark).toContain("export const MAESTRO_MARK_VIEWBOX = '0 0 16 16'")
    expect(mark).toContain('export const MAESTRO_MARK_STROKE_WIDTH = 1.6')
    expect(mark).toContain("export const MAESTRO_BRAND_TILE = '#0A84FF'")

    const brand = read('components/BrandMark.tsx')
    expect(brand).not.toMatch(/^\s*export const MAESTRO_MARK_PATH\s*=/m)
    expect(brand).not.toMatch(/^\s*export const MAESTRO_BRAND_TILE\s*=/m)
    expect(brand).toContain("from '../maestro-mark.js'")
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

describe('BrandBadge chrome is not caller-overridable', () => {
  // A call site that could repaint the tile would break the one invariant the
  // badge carries: a fixed #0A84FF that stays visible on both light and dark
  // surfaces. The optional `style` override exists for POSITIONING, so it takes
  // layout keys only. Pin that boundary here rather than in a comment.
  it('declares a layout-only allow-list for the style override', () => {
    const brand = read('components/BrandMark.tsx')
    const allow = /BRAND_BADGE_LAYOUT_KEYS[^=]*=\s*\[([^\]]*)\]/.exec(brand)
    expect(allow, 'BrandMark.tsx must export a BRAND_BADGE_LAYOUT_KEYS allow-list').not.toBeNull()
    const keys = allow![1].split(',').map((k) => k.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
    // positioning only — never the brand chrome itself
    for (const chrome of ['background', 'backgroundColor', 'color', 'border', 'boxShadow', 'borderRadius', 'width', 'height']) {
      expect(keys, `\`${chrome}\` is brand chrome and must not be caller-overridable`).not.toContain(chrome)
    }
    expect(keys).toContain('alignSelf')
  })

  it('filters the override through that allow-list instead of spreading it', () => {
    const brand = read('components/BrandMark.tsx')
    expect(brand).toMatch(/BRAND_BADGE_LAYOUT_KEYS/)
    // the raw `...props.style` spread is what let a caller repaint the tile
    expect(brand).not.toMatch(/\.\.\.\(\s*props\.style\s*\?\?\s*\{\}\s*\)/)
  })
})

// The mask URI renders through CSS `mask`, so a subtly different encoding leaves
// the settings-nav row blank rather than erroring. BrandMark.tsx cannot be
// imported (react is a client-bundler EXTERNAL with no package.json entry), so
// the react-free half lives in maestro-mark.ts and is pinned here by exact
// bytes — not by grepping a call site for a function name.
import { maestroMarkMaskUri, MAESTRO_MARK_PATH } from '../src/client/maestro-mark.js'

describe('maestroMarkMaskUri encoding', () => {
  it('encodes only < and >, leaving quotes, slashes and spaces intact', () => {
    expect(maestroMarkMaskUri()).toBe(
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' " +
      "viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' " +
      `stroke-linejoin='round'%3E%3Cpath d='${MAESTRO_MARK_PATH}'/%3E%3C/svg%3E`,
    )
  })

  // A naive encodeURIComponent rewrite satisfies every other assertion in this
  // file and still blanks the row. This is the assertion that would catch it.
  it('would differ from encodeURIComponent, which is why it is not used', () => {
    const naive = `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg"><path d="${MAESTRO_MARK_PATH}"/></svg>`,
    )}`
    expect(naive).not.toBe(maestroMarkMaskUri())
  })
})
