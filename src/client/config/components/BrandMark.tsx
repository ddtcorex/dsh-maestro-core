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
import {
  MAESTRO_BRAND_TILE,
  MAESTRO_MARK_PATH,
  MAESTRO_MARK_STROKE_WIDTH,
  MAESTRO_MARK_VIEWBOX,
} from '../maestro-mark.js'

// Re-exported so importers of this path keep working; the declarations live in
// ../maestro-mark.ts, which has no react import and is therefore importable
// from a test — BrandMark.tsx cannot be, because react is a client-bundler
// EXTERNAL with no entry in this package's package.json.
export {
  MAESTRO_BRAND_TILE,
  MAESTRO_MARK_PATH,
  MAESTRO_MARK_STROKE_WIDTH,
  MAESTRO_MARK_VIEWBOX,
  maestroMarkMaskUri,
} from '../maestro-mark.js'

/**
 * Keys a call site may override on the badge. POSITIONING ONLY — the tile's
 * colour, border, shadow, radius and size are the brand and are not negotiable.
 * A `style` prop spread wholesale would let any call site silently repaint the
 * badge, which is the one thing the fixed `#0A84FF` exists to prevent.
 */
export const BRAND_BADGE_LAYOUT_KEYS = [
  'alignSelf', 'margin', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
] as const

type BrandBadgeStyle = Partial<Record<(typeof BRAND_BADGE_LAYOUT_KEYS)[number], unknown>>

/** Keep only the layout keys; drop anything that would touch the chrome. */
function layoutOnly(style: BrandBadgeStyle | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of BRAND_BADGE_LAYOUT_KEYS) {
    if (style?.[key] !== undefined) out[key] = style[key]
  }
  return out
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
export function BrandBadge(props: { size?: number; outer?: number; radius?: number; style?: BrandBadgeStyle }) {
  const outer = props.outer ?? 28
  const size = props.size ?? 16
  const radius = props.radius ?? 8
  return h('span', {
    'data-maestro-logo': '',
    style: {
      width: outer, height: outer, borderRadius: radius, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: `var(--dsw-alias-brand-primary, ${MAESTRO_BRAND_TILE})`, backgroundColor: MAESTRO_BRAND_TILE, color: '#fff', flex: 'none',
      border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 0 0 1px var(--dsw-alias-border-l1)', boxSizing: 'border-box' as any,
      ...layoutOnly(props.style),
    },
  } as any, h(MaestroMark as any, { size }))
}
