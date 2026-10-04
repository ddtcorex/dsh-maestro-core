/**
 * Maestro M logo — the react-free half of the reference implementation.
 *
 * Split out from `components/BrandMark.tsx` so the glyph declaration and the
 * CSS-mask encoding are importable from a test. `BrandMark.tsx` imports react,
 * which the client bundler treats as an EXTERNAL with no entry in this
 * package's `package.json` — so it cannot be imported from vitest at all, and a
 * test that only greps its text would accept a naive `encodeURIComponent` that
 * silently changes every rendered mask. This module has no react import, so
 * `tests/brand-mark.spec.ts` can assert the exact URI bytes.
 *
 * The path itself is duplicated in other Maestro packages and that duplication
 * is structural — see the header in `components/BrandMark.tsx`.
 */

export const MAESTRO_MARK_PATH = 'M2 11 L5 4 L8 9 L11 4 L14 11'
export const MAESTRO_MARK_VIEWBOX = '0 0 16 16'
export const MAESTRO_MARK_STROKE_WIDTH = 1.6

/** Badge tile colour — part of the house pattern documented in AGENTS.md. */
export const MAESTRO_BRAND_TILE = '#0A84FF'

/**
 * The exact data-URI the settings-nav row paints as a `currentColor` mask.
 *
 * Only `<` and `>` are encoded. `encodeURIComponent` would additionally escape
 * quotes, slashes and spaces, producing a different URI than the literal this
 * replaces — and the row renders through `mask`, so a subtly different URI can
 * leave the glyph blank. `tests/brand-mark.spec.ts` pins the bytes.
 */
export function maestroMarkMaskUri(): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='${MAESTRO_MARK_VIEWBOX}' ` +
    `fill='none' stroke='black' stroke-width='${MAESTRO_MARK_STROKE_WIDTH}' ` +
    `stroke-linecap='round' stroke-linejoin='round'><path d='${MAESTRO_MARK_PATH}'/></svg>`
  return `data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E')}`
}
