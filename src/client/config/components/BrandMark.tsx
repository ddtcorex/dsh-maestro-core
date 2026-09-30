/**
 * The Maestro M logo — canonical reference implementation.
 *
 * This file was a verbatim copy of dsh-maestro-dashboard's
 * `src/client/components/BrandMark.tsx`, which this plugin set no longer
 * installs. It is now the source of record: `AGENTS.md:394` points here, and
 * the settings-nav mask in `index.tsx` plus the Settings card badge in
 * `MaestroSettings.tsx` both build from the constants declared below.
 *
 * Every OTHER Maestro package still inlines its own copy of the path, and that
 * duplication is structural — do not "fix" it with a cross-plugin import:
 *
 *   - each plugin declares its own `dsh.client` entry ({platform: web}) and
 *     builds its own `lib/client.js`, so one plugin's client module cannot
 *     import another's;
 *   - dsh-maestro-remote's copy is a host-side HTML string (the PIN login
 *     badge in `src/host/remote-proxy.ts`), which no client module reaches;
 *   - dsh-maestro-gateway, -jobs and -sync each carry it in their own client
 *     bundle for the same reason.
 *
 * Mark:  `M2 11 L5 4 L8 9 L11 4 L14 11`, currentColor, strokeWidth 1.6.
 * Badge: `data-maestro-logo`, outer 28 / size 16 / radius 8, `#0A84FF` tile.
 *        The fixed brand blue keeps the badge visible on both light
 *        (`bg-base #fff`) and dark (`bg-base #121212`) — a token-only
 *        background can resolve to near-white on some dark tokens.
 */

import { createElement as h } from 'react'

/** The glyph. Never re-hardcode it; every surface reads this constant. */
export const MAESTRO_MARK_PATH = 'M2 11 L5 4 L8 9 L11 4 L14 11'
export const MAESTRO_MARK_VIEWBOX = '0 0 16 16'
export const MAESTRO_MARK_STROKE_WIDTH = 1.6

/** Badge tile colour — part of the house pattern documented in AGENTS.md. */
export const MAESTRO_BRAND_TILE = '#0A84FF'

/**
 * The same glyph as a `currentColor` CSS-mask data-URI, for the settings-nav
 * row (see `SETTINGS_NAV_CSS` in `index.tsx`).
 *
 * Only `<` and `>` are encoded. `encodeURIComponent` would additionally escape
 * quotes, slashes and spaces, producing a different data-URI than the literal
 * this replaces — the nav glyph renders through `mask`, so a subtly different
 * URI can leave the row blank.
 */
export function maestroMarkMaskUri(): string {
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='${MAESTRO_MARK_VIEWBOX}' ` +
    `fill='none' stroke='black' stroke-width='${MAESTRO_MARK_STROKE_WIDTH}' ` +
    `stroke-linecap='round' stroke-linejoin='round'><path d='${MAESTRO_MARK_PATH}'/></svg>`
  return `data:image/svg+xml,${svg.replace(/</g, '%3C').replace(/>/g, '%3E')}`
}

export function MaestroMark(props: { size?: number }) {
  const s = props.size ?? 16
  return h('svg', { width: s, height: s, viewBox: MAESTRO_MARK_VIEWBOX, fill: 'none', 'aria-hidden': 'true' } as any,
    h('path', { d: MAESTRO_MARK_PATH, stroke: 'currentColor', strokeWidth: MAESTRO_MARK_STROKE_WIDTH, strokeLinecap: 'round', strokeLinejoin: 'round' } as any)
  )
}

/**
 * `style` merges over the tile so a call site can position the badge without
 * copying its chrome: the Settings card header needs `alignSelf`/`marginTop`
 * to sit flush in a flex row, and those are layout, not brand.
 */
export function BrandBadge(props: { size?: number; outer?: number; radius?: number; style?: Record<string, unknown> }) {
  const outer = props.outer ?? 28
  const size = props.size ?? 16
  const radius = props.radius ?? 8
  return h('span', {
    'data-maestro-logo': '',
    style: {
      width: outer, height: outer, borderRadius: radius, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: `var(--dsw-alias-brand-primary, ${MAESTRO_BRAND_TILE})`, backgroundColor: MAESTRO_BRAND_TILE, color: '#fff', flex: 'none',
      border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 0 0 1px var(--dsw-alias-border-l1)', boxSizing: 'border-box' as any,
      ...(props.style ?? {}),
    },
  } as any, h(MaestroMark as any, { size }))
}
