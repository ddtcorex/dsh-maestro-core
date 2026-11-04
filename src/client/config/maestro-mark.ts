/**
 * Maestro M logo — the react-free half of the reference implementation.
 *
 * Split out from `components/BrandMark.tsx` so the glyph declaration is
 * importable from a test: `BrandMark.tsx` imports react, which the client
 * bundler treats as an EXTERNAL with no entry in this package's `package.json`,
 * so it cannot be imported from vitest at all. This module has no react import,
 * so `tests/brand-mark.spec.ts` can still read the declarations a caller builds
 * its glyph from.
 *
 * The path itself is duplicated in other Maestro packages and that duplication
 * is structural — see the header in `components/BrandMark.tsx`.
 */

export const MAESTRO_MARK_PATH = 'M2 11 L5 4 L8 9 L11 4 L14 11'
export const MAESTRO_MARK_VIEWBOX = '0 0 16 16'
export const MAESTRO_MARK_STROKE_WIDTH = 1.6

/** Badge tile colour — part of the house pattern documented in AGENTS.md. */
export const MAESTRO_BRAND_TILE = '#0A84FF'
