import { createElement as h } from 'react'

export function MaestroMark(props: { size?: number }) {
  const s = props.size ?? 16
  return h('svg', { width: s, height: s, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' } as any,
    h('path', { d: 'M2 11 L5 4 L8 9 L11 4 L14 11', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as any)
  )
}

export function BrandBadge(props: { size?: number; outer?: number; radius?: number }) {
  const outer = props.outer ?? 28
  const size = props.size ?? 16
  const radius = props.radius ?? 8
  return h('span', {
    'data-maestro-logo': '',
    style: {
      width: outer, height: outer, borderRadius: radius, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--dsw-alias-brand-primary, #0A84FF)', backgroundColor: '#0A84FF', color: '#fff', flex: 'none',
      border: '1px solid rgba(0,0,0,0.08)', boxShadow: '0 0 0 1px var(--dsw-alias-border-l1)', boxSizing: 'border-box' as any,
    },
  } as any, h(MaestroMark as any, { size }))
}
