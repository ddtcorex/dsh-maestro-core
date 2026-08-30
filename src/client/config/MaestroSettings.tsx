// @ts-nocheck
/**
 * Maestro Settings — DSH-native redesign.
 * Reuses DeepSeek Harness design tokens & primitive geometry maximally:
 *  - --dsw-alias-* color family (no hard-coded hex except QR tile #fff)
 *  - Button variants primary/ghost/outline (h36 capsule / h28 small) — same as @deepseek-ai/dsh-client-ui-primitives/Button
 *  - Input atom (h32, radius 8, bg-layer-1, focus border brand) — same as primitives/Input
 *  - DisclosureRow (24px row, 14px glyph, chevron hover) — same as primitives/DisclosureRow
 *  - Panel chroma: inner cards use bg-layer-2 / border-l2 / radius 12 / shadow lv3 where needed
 */

import { createElement as h, useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { MAESTRO_ENDPOINTS } from './api.js'
import { generateWebhookSecret, gitlabWebhookUrl } from './webhook-secret.js'

// ---------------------------------------------------------------------------
// DSH tokens — single source, no custom hex (except QR quiet zone #fff)
// ---------------------------------------------------------------------------
const t = {
  bgLayer1: 'var(--dsw-alias-bg-layer-1)',
  bgLayer2: 'var(--dsw-alias-bg-layer-2)',
  bgLayer3: 'var(--dsw-alias-bg-layer-3)',
  borderL2: 'var(--dsw-alias-border-l2)',
  labelPrimary: 'var(--dsw-alias-label-primary)',
  labelSecondary: 'var(--dsw-alias-label-secondary)',
  labelTertiary: 'var(--dsw-alias-label-tertiary)',
  labelDimmed: 'var(--dsw-alias-label-dimmed)',
  labelFg: 'var(--dsw-alias-label-primary-foreground)',
  primaryFill: 'var(--dsw-alias-button-primary-fill)',
  primaryHover: 'var(--dsw-alias-button-primary-hover)',
  interactiveHover: 'var(--dsw-alias-interactive-bg-hover)',
  interactiveActive: 'var(--dsw-alias-interactive-bg-active)',
  stateError: 'var(--dsw-alias-state-error-primary)',
  brand: 'var(--dsw-alias-brand-primary)',
  shadowLv3: 'var(--dsw-shadow-lv3)',
  scrollbarL2: 'var(--dsw-alias-scrollbar-bg-l2)',
}

// ---------------------------------------------------------------------------
// Lightweight DSH primitive mirrors (geometry + tokens identical to host)
// Usage is identical to @deepseek-ai/dsh-client-ui-primitives at runtime.
// ---------------------------------------------------------------------------
type ButtonVariant = 'primary' | 'ghost' | 'outline'
function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  children,
  style,
  ...rest
}: {
  variant?: ButtonVariant
  size?: 'md' | 'sm'
  icon?: unknown
  children?: unknown
  style?: Record<string, unknown>
} & Record<string, unknown>) {
  const base: Record<string, unknown> = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    border: 'none',
    borderRadius: size === 'sm' ? 16 : 18,
    cursor: 'pointer',
    fontSize: size === 'sm' ? 13 : 14,
    lineHeight: size === 'sm' ? '18px' : '22px',
    padding: size === 'sm' ? '0 12px' : '0 14px',
    height: size === 'sm' ? 32 : 36,
    color: t.labelPrimary,
    background: 'transparent',
    fontFamily: 'inherit',
  }
  if (variant === 'primary') {
    base.background = t.primaryFill
    base.color = t.labelFg
  }
  if (variant === 'outline') {
    base.border = `1px solid ${t.borderL2}`
    base.background = 'transparent'
  }
  const merged = { ...base, ...(style as object) } as Record<string, string>
  return h(
    'button',
    {
      type: 'button',
      style: merged,
      onMouseEnter: (e: any) => {
        if ((rest as any).disabled) return
        if (variant === 'primary') (e.currentTarget as HTMLElement).style.background = t.primaryHover as string
        else (e.currentTarget as HTMLElement).style.background = t.interactiveHover as string
      },
      onMouseLeave: (e: any) => {
        if (variant === 'primary') (e.currentTarget as HTMLElement).style.background = t.primaryFill as string
        else (e.currentTarget as HTMLElement).style.background = variant === 'outline' ? 'transparent' : 'transparent'
      },
      ...(rest as any),
    },
    icon ? h('span', { style: { display: 'inline-flex', width: 16, height: 16, alignItems: 'center', justifyContent: 'center' } }, icon as any) : null,
    children as any,
  )
}

function InputWrap({
  icon,
  children,
  style,
  focused,
}: {
  icon?: unknown
  children: unknown
  style?: Record<string, unknown>
  focused?: boolean
}) {
  return h(
    'span',
    {
      style: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        height: 36,
        padding: '0 12px',
        border: `1px solid ${focused ? t.brand : t.borderL2}`,
        borderRadius: 10,
        background: t.bgLayer1,
        flex: 1,
        minWidth: 0,
        boxSizing: 'border-box' as const,
        ...(style as object),
      },
    },
    icon
      ? h('span', { style: { display: 'inline-flex', width: 16, height: 16, color: t.labelTertiary } }, icon as any)
      : null,
    children as any,
  )
}

function FieldInput(props: React.InputHTMLAttributes<HTMLInputElement> & { icon?: unknown }) {
  const [focused, setFocused] = useState(false)
  const { icon, style, ...rest } = props as any
  return h(
    InputWrap as any,
    { icon, focused, style: { ...(style as object), flex: '1 1 auto' } },
    h('input', {
      ...(rest as any),
      onFocus: (e: any) => {
        setFocused(true)
        ;(rest as any).onFocus?.(e)
      },
      onBlur: (e: any) => {
        setFocused(false)
        ;(rest as any).onBlur?.(e)
      },
      style: {
        flex: 1,
        minWidth: 0,
        border: 'none',
        outline: 'none',
        background: 'transparent',
        fontSize: 14,
        lineHeight: '22px',
        color: t.labelPrimary,
        fontFamily: 'inherit',
      },
    }),
  )
}

function TextareaField(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const [focused, setFocused] = useState(false)
  return h('textarea', {
    ...(props as any),
    onFocus: (e: any) => {
      setFocused(true)
      ;(props as any).onFocus?.(e)
    },
    onBlur: (e: any) => {
      setFocused(false)
      ;(props as any).onBlur?.(e)
    },
    style: {
      width: '100%',
      minHeight: 96,
      padding: '8px 10px',
      border: `1px solid ${focused ? t.brand : t.borderL2}`,
      borderRadius: 8,
      background: t.bgLayer1,
      color: t.labelPrimary,
      fontFamily: 'inherit',
      fontSize: 13,
      lineHeight: '18px',
      resize: 'vertical' as const,
      boxSizing: 'border-box' as const,
      outline: 'none',
      ...(props as any).style,
    },
  })
}

// DSH DisclosureRow — 24px row, 14px glyph, hover chevron swap, same semantics as host
function DisclosureRow({
  icon,
  title,
  caption,
  open,
  expandable,
  onToggle,
  children,
}: {
  icon: unknown
  title: string
  caption?: string
  open: boolean
  expandable: boolean
  onToggle: () => void
  children?: unknown
}) {
  const rowExpands = expandable
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0 } },
    h(
      'div',
      {
        role: rowExpands ? 'button' : undefined,
        tabIndex: rowExpands ? 0 : undefined,
        'aria-expanded': rowExpands ? open : undefined,
        onClick: rowExpands ? onToggle : undefined,
        onKeyDown: rowExpands
          ? (e: any) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onToggle()
              }
            }
          : undefined,
        style: {
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 40,
          padding: '8px 10px',
          borderRadius: 12,
          cursor: rowExpands ? 'pointer' : 'default',
          background: open ? 'var(--dsw-specific-sidebar-nav-item-active)' : 'transparent',
          border: `1px solid ${open ? t.borderL2 : 'transparent'}`,
          boxSizing: 'border-box' as const,
        },
        onMouseEnter: (e: any) => {
          if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--dsw-specific-sidebar-nav-item-hover)'
        },
        onMouseLeave: (e: any) => {
          if (!open) (e.currentTarget as HTMLElement).style.background = 'transparent'
        },
      },
      expandable
        ? h(
            'button',
            {
              type: 'button',
              'aria-expanded': open,
              onClick: (e: any) => {
                e.stopPropagation()
                onToggle()
              },
              style: {
                flex: 'none',
                width: 20,
                height: 20,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: 'none',
                background: 'none',
                cursor: 'pointer',
                color: t.labelTertiary,
                padding: 0,
              },
            },
            open
              ? h('span', { style: { fontSize: 12, lineHeight: 1 } }, '▾')
              : h('span', { style: { fontSize: 12, lineHeight: 1 } }, '▸'),
          )
        : h('span', { style: { width: 20, display: 'inline-flex', justifyContent: 'center', color: t.labelTertiary, flex: 'none' } }, icon as any),
      h('span', { style: { flex: 1, minWidth: 0 } },
        h('span', { style: { display: 'block', fontSize: 14, lineHeight: '20px', fontWeight: 500, color: t.labelPrimary } }, title),
        caption ? h('span', { style: { display: 'block', fontSize: 12, lineHeight: '16px', color: t.labelSecondary, marginTop: 1 } }, caption) : null,
      ),
      !open && expandable
        ? h('span', { style: { color: t.labelTertiary, fontSize: 12 } }, '›')
        : null,
    ),
    open ? h('div', { style: { padding: '10px 0 14px 30px', display: 'flex', flexDirection: 'column', gap: 10 } }, children as any) : null,
  )
}

// ---------------------------------------------------------------------------
// Shared field helpers — DSH-native label / caption rhythm
// ---------------------------------------------------------------------------
const fieldLabelStyle: Record<string, string> = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  fontSize: '12px',
  lineHeight: '16px',
  fontWeight: '500',
  color: t.labelSecondary as string,
  margin: '12px 0 0',
}
const captionStyle: Record<string, string> = {
  fontSize: '12px',
  lineHeight: '16px',
  color: t.labelSecondary as string,
  margin: '4px 0',
}
const cardInsetStyle: Record<string, string> = {
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  padding: '12px',
  borderRadius: '12px',
  border: `1px solid ${t.borderL2}`,
  background: t.bgLayer1 as string,
}

// ---------------------------------------------------------------------------
// DSH General row — title + desc left, control right, 16px 0, border-bottom
// ---------------------------------------------------------------------------
const rowStyle: Record<string, string> = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '16px 0',
  borderBottom: `1px solid ${t.borderL2}`,
  minWidth: '0',
}
const rowTextStyle: Record<string, string> = {
  flex: '1',
  minWidth: '0',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
  paddingRight: '48px',
}
const rowTitleStyle: Record<string, string> = {
  fontSize: '14px',
  fontWeight: '400',
  lineHeight: '22px',
  color: t.labelPrimary as string,
}
const rowDescStyle: Record<string, string> = {
  fontSize: '12px',
  fontWeight: '400',
  lineHeight: '18px',
  color: t.labelTertiary as string,
}
// Pill selector — same as LanguageRow/EnterBehaviorRow: h36 r18 bg-module-platform
const pillSelectorStyle: Record<string, string> = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '12px',
  height: '36px',
  padding: '0 14px',
  border: 'none',
  borderRadius: '18px',
  background: 'var(--dsw-alias-bg-module-platform, #F5F6F7)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '22px',
  color: t.labelPrimary as string,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
function SettingRow({ title, description, control }: { title: string; description?: string; control: unknown }) {
  return h(
    'div',
    { 'data-maestro-row': '', style: rowStyle },
    h('div', { 'data-maestro-row-text': '', style: rowTextStyle }, h('div', { style: rowTitleStyle }, title), description ? h('div', { style: rowDescStyle }, description) : null),
    h('div', { 'data-maestro-control': '', style: { flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minHeight: '36px' } }, control as any),
  )
}
function ToggleRow({ title, description, checked, onChange }: { title: string; description?: string; checked?: boolean; onChange: (v: boolean) => void }) {
  return h(
    'label',
    { 'data-maestro-row': '', style: { ...rowStyle, cursor: 'pointer', alignItems: 'flex-start' } },
    h('input', { type: 'checkbox', checked: checked === true, onChange: (e: any) => onChange(e.target.checked), style: { width: 16, height: 16, accentColor: t.primaryFill as string, marginTop: 4, flex: 'none' } }),
    h('div', { 'data-maestro-row-text': '', style: { ...rowTextStyle, paddingRight: '0' } }, h('div', { style: rowTitleStyle }, title), description ? h('div', { style: rowDescStyle }, description) : null),
  )
}

// ---------------------------------------------------------------------------
// QR — same as before (light tile + quiet zone) — QR itself is #fff
// ---------------------------------------------------------------------------
function QrImage({ url, size = 104 }: { url: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    QRCode.toDataURL(url, { margin: 0, width: size * 2 })
      .then((d) => {
        if (live) setDataUrl(d)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [url, size])
  return h(
    'div',
    {
      style: {
        background: '#ffffff',
        borderRadius: 10,
        boxSizing: 'border-box',
        width: size + 20,
        height: size + 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        flex: 'none',
      },
    },
    dataUrl === null
      ? h('div', { style: { width: size, height: size, background: 'var(--dsw-alias-bg-skeleton)', borderRadius: 4 } })
      : h('img', { src: dataUrl, alt: url, width: size, height: size, style: { display: 'block' } }),
  )
}

// ---------------------------------------------------------------------------
// ReviewModelSelector — styled with DSH button + menu tokens
// ---------------------------------------------------------------------------
function ReviewModelSelector({
  value,
  catalog,
  fallbackValue,
  fallbackLabel,
  onChange,
  label,
}: {
  value: { provider: string; model: string; reasoningEffort?: string } | null
  catalog: any
  fallbackValue: any
  fallbackLabel: string
  onChange: (v: any) => void
  label: string | null
}) {
  const groups = catalog?.groups ?? []
  const providers: string[] = groups.map((g: any) => g.provider)
  const selectedProvider = value?.provider ?? ''
  const providerGroup = groups.find((g: any) => g.provider === selectedProvider)
  const selectedEffort = value?.reasoningEffort ?? ''
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<'root' | 'model' | 'effort'>('root')
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setPane('root')
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if ((e as any).key === 'Escape') {
        setOpen(false)
        setPane('root')
      }
    }
    document.addEventListener('mousedown', onDown as any)
    document.addEventListener('keydown', onKey as any)
    return () => {
      document.removeEventListener('mousedown', onDown as any)
      document.removeEventListener('keydown', onKey as any)
    }
  }, [open])
  const getModelId = (m: any) => (typeof m === 'string' ? m : m.id)
  const getModelName = (m: any) => (typeof m === 'string' ? m : (m.name ?? m.id))
  const selectedModelInfo = (() => {
    if (!selectedProvider || !value?.model) return null
    const raw = (providerGroup?.models ?? []).find((mm: any) => getModelId(mm) === value.model)
    if (raw === undefined) return null
    if (typeof raw === 'string') return { id: raw, supportsReasoning: false, reasoningEfforts: [] as string[] }
    return raw
  })()
  const supportsReasoning = (() => {
    if (!selectedModelInfo) return false
    if (typeof (selectedModelInfo as any).supportsReasoning === 'boolean') return (selectedModelInfo as any).supportsReasoning
    const efforts = (selectedModelInfo as any).reasoningEfforts ?? (selectedModelInfo as any).reasoning?.efforts?.map((e: any) => e.id) ?? []
    return efforts.filter((e: string) => e !== 'off').length > 0
  })()
  const availableEfforts: string[] = (() => {
    if (!supportsReasoning) return []
    const efforts = (selectedModelInfo as any)?.reasoningEfforts ?? (selectedModelInfo as any)?.reasoning?.efforts?.map((e: any) => e.id) ?? []
    const filtered = efforts.filter((e: string) => e !== 'off' && e !== '')
    if (filtered.length > 0) return filtered
    return ['low', 'medium', 'high']
  })()
  const warning =
    selectedEffort !== '' && !supportsReasoning && selectedModelInfo !== null
      ? `⚠️ This model does not support reasoning effort "${selectedEffort}" — reviews will fail.`
      : null
  const update = (field: string, newVal: string) => {
    if (newVal === '' && field === 'provider') {
      onChange(null)
      setOpen(false)
      setPane('root')
      return
    }
    const next: any = { provider: value?.provider ?? '', model: value?.model ?? '', ...(value?.reasoningEffort ? { reasoningEffort: value.reasoningEffort } : {}) }
    if (field === 'provider') {
      const g = groups.find((x: any) => x.provider === newVal)
      const first = g?.models[0]
      next.provider = newVal
      next.model = first !== undefined ? getModelId(first) : ''
    } else if (field === 'model') next.model = newVal
    else if (field === 'reasoningEffort') {
      if (newVal === '') delete next.reasoningEffort
      else next.reasoningEffort = newVal
    }
    if (!next.provider || !next.model) onChange(null)
    else onChange(next)
  }
  const effectiveFallback = fallbackValue !== undefined ? fallbackValue : (catalog?.current ?? null)
  const triggerLabel = value
    ? `${value.provider} / ${value.model}${value.reasoningEffort ? ` · ${value.reasoningEffort}` : ''}`
    : effectiveFallback
      ? `${fallbackLabel} · ${effectiveFallback.provider}/${effectiveFallback.model}${effectiveFallback.reasoningEffort ? ` · ${effectiveFallback.reasoningEffort}` : ''}`
      : fallbackLabel
  const menuStyle: Record<string, string> = {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: '0',
    minWidth: '300px',
    maxWidth: '360px',
    background: t.bgLayer2 as string,
    border: `1px solid ${t.borderL2}`,
    borderRadius: '12px',
    boxShadow: t.shadowLv3 as string,
    zIndex: '20',
    padding: '6px',
  }
  const rowStyle: Record<string, any> = {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '9px 10px',
    borderRadius: 8,
    border: 'none',
    background: 'transparent',
    color: t.labelPrimary,
    fontFamily: 'inherit',
    fontSize: 13,
    cursor: 'pointer',
    textAlign: 'left',
  }
  const check = (active: boolean) =>
    active
      ? h('svg', { width: 16, height: 16, viewBox: '0 0 16 16', style: { flex: 'none' } }, h('path', { d: 'M3.5 8.2l2.8 2.8L12.5 4.8', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }))
      : h('span', { style: { width: 16, flex: 'none' } })
  const chevronRight = h('svg', { width: 14, height: 14, viewBox: '0 0 14 14', style: { flex: 'none', opacity: 0.6 } }, h('path', { d: 'M5 3.5L8.5 7L5 10.5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }))
  const effortLabel = selectedEffort === '' ? 'Default effort' : selectedEffort
  const modelLabel = selectedProvider === '' ? 'Select model' : (value?.model ?? 'Select model')
  return h(
    'div',
    { ref: rootRef as any, 'data-maestro-trigger-wrap': '', style: { position: 'relative', display: 'inline-block', maxWidth: '100%' } },
    label ? h('span', { style: fieldLabelStyle }, label) : null,
    h(
      'button',
      {
        type: 'button',
        style: {
          height: 36,
          padding: '0 14px 0 16px',
          borderRadius: 18,
          border: 'none',
          background: 'var(--dsw-alias-bg-module-platform, #F5F6F7)' as string,
          color: t.labelPrimary as string,
          fontFamily: 'inherit',
          fontSize: 13,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          maxWidth: 320,
          whiteSpace: 'nowrap',
        },
        onClick: () => {
          setOpen((v) => !v)
          setPane('root')
        },
        'aria-expanded': open,
        'aria-haspopup': 'menu',
        title: triggerLabel,
      },
      h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, triggerLabel),
      h('svg', { width: 14, height: 14, viewBox: '0 0 14 14', style: { flex: 'none', opacity: 0.7 } }, h('path', { d: 'M3.5 5L7 8.5L10.5 5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' })),
    ),
    open
      ? h(
          'div',
          { 'data-maestro-menu': '', style: menuStyle as any, role: 'menu' },
          pane === 'root'
            ? h(
                'div',
                null,
                h(
                  'button',
                  { type: 'button', style: { ...rowStyle, background: !value ? t.bgLayer1 : 'transparent' } as any, onClick: () => { onChange(null); setOpen(false) } },
                  h('span', null, fallbackLabel),
                  check(!value),
                ),
                h('div', { style: { height: 1, background: t.borderL2 as string, margin: '6px 2px' } }),
                h(
                  'button',
                  { type: 'button', style: rowStyle as any, onClick: () => setPane('model') },
                  h('span', null, 'Model'),
                  h('span', { style: { display: 'flex', alignItems: 'center', gap: 8, color: t.labelSecondary as string, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, modelLabel), chevronRight),
                ),
                h(
                  'button',
                  { type: 'button', style: rowStyle as any, onClick: () => setPane('effort') },
                  h('span', null, 'Effort'),
                  h('span', { style: { display: 'flex', alignItems: 'center', gap: 8, color: t.labelSecondary as string } }, effortLabel, chevronRight),
                ),
                value ? h('p', { style: { ...captionStyle, margin: '8px 4px 2px' } }, `Selected: ${value.provider} / ${value.model}${value.reasoningEffort ? ` (${value.reasoningEffort})` : ''}`) : null,
                !value && effectiveFallback ? h('p', { style: { ...captionStyle, margin: '8px 4px 2px' } }, `${fallbackLabel === 'Use Global' ? 'Using Global' : 'Using DSH default'}: ${effectiveFallback.provider} / ${effectiveFallback.model}${effectiveFallback.reasoningEffort ? ` (${effectiveFallback.reasoningEffort})` : ''}`) : null,
                warning ? h('p', { style: { ...captionStyle, margin: '4px 4px 2px', color: t.stateError as string } }, warning) : null,
              )
            : null,
          pane === 'model'
            ? h(
                'div',
                null,
                h('button', { type: 'button', style: { ...rowStyle, color: t.labelSecondary } as any, onClick: () => setPane('root') }, h('span', null, '← Back'), h('span', { style: { fontSize: 12 } }, 'Model')),
                h(
                  'div',
                  { style: { maxHeight: 260, overflowY: 'auto', marginTop: 4 } },
                  providers.length === 0
                    ? h('p', { style: captionStyle }, 'No providers')
                    : providers.map((p: string) => {
                        const g = groups.find((x: any) => x.provider === p)
                        const ms: any[] = g?.models ?? []
                        return h(
                          'div',
                          { key: p, style: { marginBottom: 8 } },
                          h('div', { style: { fontSize: 11, fontWeight: 600, color: t.labelSecondary as string, padding: '6px 10px 2px', textTransform: 'uppercase', letterSpacing: 0.4, display: 'flex', alignItems: 'center', gap: 6 } }, h('span', { style: { width: 6, height: 6, borderRadius: 3, background: t.borderL2 as string, flex: 'none' } }), (g as any)?.name ?? p),
                          ms.length === 0
                            ? h('p', { style: { ...captionStyle, padding: '2px 10px 2px 28px' } }, 'No models')
                            : h(
                                'div',
                                { style: { marginLeft: 12, borderLeft: `1px solid ${t.borderL2}`, paddingLeft: 6, display: 'flex', flexDirection: 'column', gap: 2 } },
                                ms.map((m: any) => {
                                  const mid = getModelId(m)
                                  const mname = getModelName(m)
                                  const active = value?.provider === p && value?.model === mid
                                  return h(
                                    'button',
                                    {
                                      key: mid,
                                      type: 'button',
                                      style: { ...rowStyle, paddingLeft: 10, background: active ? (t.bgLayer1 as string) : 'transparent' } as any,
                                      onClick: () => {
                                        update('model', mid)
                                        if (value?.provider !== p) update('provider', p)
                                        else {
                                          const next: any = { provider: p, model: mid, ...(selectedEffort ? { reasoningEffort: selectedEffort } : {}) }
                                          onChange(next)
                                          setPane('root')
                                        }
                                      },
                                    },
                                    h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis' } }, mname),
                                    check(active),
                                  )
                                }),
                              ),
                        )
                      }),
                ),
              )
            : null,
          pane === 'effort'
            ? h(
                'div',
                null,
                h('button', { type: 'button', style: { ...rowStyle, color: t.labelSecondary } as any, onClick: () => setPane('root') }, h('span', null, '← Back'), h('span', { style: { fontSize: 12 } }, 'Effort')),
                selectedModelInfo === null
                  ? h('p', { style: { ...captionStyle, margin: '8px 4px 2px' } }, 'Select a model first to configure effort.')
                  : !supportsReasoning
                    ? h(
                        'div',
                        null,
                        h('p', { style: { ...captionStyle, margin: '8px 4px 6px' } }, 'This model does not support reasoning effort — using provider default'),
                        h(
                          'div',
                          { style: { marginTop: 4 } },
                          ([{ id: '', label: 'Default effort' }] as any).map((e: any) =>
                            h(
                              'button',
                              { key: e.id || 'default', type: 'button', style: { ...rowStyle, background: selectedEffort === e.id ? (t.bgLayer1 as string) : 'transparent' } as any, onClick: () => { update('reasoningEffort', e.id); setPane('root') } },
                              h('span', null, e.label),
                              check(selectedEffort === e.id),
                            ),
                          ),
                        ),
                        warning ? h('p', { style: { ...captionStyle, margin: '8px 4px 2px', color: t.stateError as string } }, warning) : null,
                      )
                    : h(
                        'div',
                        null,
                        h(
                          'div',
                          { style: { marginTop: 4 } },
                          ([{ id: '', label: 'Default effort' }, ...availableEfforts.map((id) => ({ id, label: id }))] as any).map((e: any) =>
                            h(
                              'button',
                              { key: e.id || 'default', type: 'button', style: { ...rowStyle, background: selectedEffort === e.id ? (t.bgLayer1 as string) : 'transparent' } as any, onClick: () => { update('reasoningEffort', e.id); setPane('root') } },
                              h('span', null, e.label),
                              check(selectedEffort === e.id),
                            ),
                          ),
                        ),
                        warning ? h('p', { style: { ...captionStyle, margin: '8px 4px 2px', color: t.stateError as string } }, warning) : null,
                      ),
              )
            : null,
        )
      : null,
  )
}

function ProjectMappingsEditor({ mappings, onChange, catalog, globalReviewModel }: { mappings: any[]; onChange: (v: any[]) => void; catalog: any; globalReviewModel: any }) {
  const rows = mappings as any[]
  const updateRow = (index: number, field: string, value: any) => {
    const next = rows.map((row: any, i: number) => (i === index ? { ...row, [field]: value } : row))
    onChange(next.filter((r) => (r.projectPath ?? '') !== '' || (r.localRepoPath ?? '') !== ''))
  }
  const removeRow = (index: number) => onChange(rows.filter((_, i) => i !== index))
  const addRow = () => onChange([...rows, { projectPath: '', localRepoPath: '', reviewProfile: 'magento2' }])
  return h(
    'div',
    { 'data-maestro-projects': '', style: { display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 } },
    // Header — count + primary Add
    h(
      'div',
      { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '4px 0 4px' } },
      h(
        'div',
        { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontSize: 14, fontWeight: 600, color: t.labelPrimary as string, lineHeight: '20px' } }, `Projects — ${rows.length} tracked`),
        h('div', { style: { fontSize: 12, color: t.labelSecondary as string, lineHeight: '16px', marginTop: 2 } }, 'GitLab path → local checkout → profile → model override'),
      ),
      h(Button as any, { variant: 'primary', size: 'md', onClick: addRow }, '+ Add project'),
    ),
    rows.length === 0
      ? h(
          'div',
          {
            'data-maestro-project-empty': '',
            style: {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
              padding: '20px 16px',
              borderRadius: 12,
              border: `1px dashed ${t.borderL2}`,
              background: 'transparent',
              textAlign: 'center' as const,
            },
          },
          h('div', { style: { fontSize: 13, color: t.labelSecondary as string, lineHeight: '18px' } }, 'No projects yet — add your first mapping'),
          h(Button as any, { variant: 'outline', size: 'md', onClick: addRow }, '+ Add project'),
        )
      : h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
          ...rows.map((row: any, i: number) =>
            h(
              'div',
              {
                key: i,
                'data-maestro-project-card': '',
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  padding: 12,
                  borderRadius: 12,
                  border: `1px solid ${t.borderL2}`,
                  background: t.bgLayer1 as string,
                  boxSizing: 'border-box' as const,
                },
              },
              // Card header: index + path + remove
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } },
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 } },
                  h(
                    'span',
                    {
                      style: {
                        flex: 'none',
                        width: 24,
                        height: 24,
                        borderRadius: 12,
                        background: 'var(--dsw-alias-bg-module-platform, #F5F6F7)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 11,
                        fontWeight: 600,
                        color: t.labelSecondary as string,
                      },
                    },
                    String(i + 1),
                  ),
                  h(
                    'span',
                    {
                      style: {
                        fontSize: 12,
                        fontFamily: 'ui-monospace, monospace',
                        color: row.projectPath ? (t.labelPrimary as string) : (t.labelTertiary as string),
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        minWidth: 0,
                      },
                    },
                    row.projectPath || 'Untitled project',
                  ),
                ),
                h(
                  Button as any,
                  { variant: 'outline', size: 'sm', onClick: () => removeRow(i), 'aria-label': `Remove project ${i + 1}`, title: 'Remove mapping' },
                  '✕',
                ),
              ),
              // Grid 2-col for paths
              h(
                'div',
                { 'data-maestro-project-grid': '', style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } },
                h(
                  'label',
                  { style: fieldLabelStyle, 'data-maestro-field': '' },
                  'GitLab path',
                  h(FieldInput as any, {
                    placeholder: 'group/project',
                    value: row.projectPath,
                    onChange: (e: any) => updateRow(i, 'projectPath', e.target.value),
                    'aria-label': `GitLab path ${i + 1}`,
                    style: { width: '100%' } as any,
                  }),
                ),
                h(
                  'label',
                  { style: fieldLabelStyle, 'data-maestro-field': '' },
                  'Local checkout',
                  h(FieldInput as any, {
                    placeholder: '/path/to/local/clone',
                    value: row.localRepoPath,
                    onChange: (e: any) => updateRow(i, 'localRepoPath', e.target.value),
                    'aria-label': `Local checkout ${i + 1}`,
                    style: { width: '100%' } as any,
                  }),
                ),
              ),
              // Row for profile + model — unified label+control, gap 12, pill h36
              h(
                'div',
                { 'data-maestro-project-profile-row': '', style: { display: 'flex', gap: 12, flexWrap: 'wrap' as const, alignItems: 'flex-start' } },
                h(
                  'label',
                  { style: { ...fieldLabelStyle, flex: '1 1 160px', minWidth: 0 } },
                  'Review profile',
                  h(
                    'select',
                    {
                      value: row.reviewProfile ?? 'magento2',
                      onChange: (e: any) => updateRow(i, 'reviewProfile', e.target.value),
                      'aria-label': `Review profile ${i + 1}`,
                      style: {
                        height: 36,
                        width: '100%',
                        padding: '0 14px',
                        border: 'none',
                        borderRadius: 18,
                        background: 'var(--dsw-alias-bg-module-platform, #F5F6F7)' as string,
                        color: t.labelPrimary as string,
                        font: 'inherit',
                        fontSize: 13,
                      },
                    },
                    h('option', { value: 'magento2' }, 'Magento 2'),
                    h('option', { value: 'generic' }, 'Generic'),
                  ),
                ),
                h(
                  'label',
                  { style: { ...fieldLabelStyle, flex: '1 1 200px', minWidth: 0 } },
                  'Model override',
                  h(ReviewModelSelector as any, {
                    value: row.reviewModel ?? null,
                    catalog,
                    fallbackValue: globalReviewModel ?? catalog?.current ?? null,
                    fallbackLabel: globalReviewModel ? 'Use Global' : 'Use DSH default',
                    onChange: (v: any) => updateRow(i, 'reviewModel', v),
                    label: null,
                  }),
                ),
              ),
            ),
          ),
        ),
  )
}

function SecretInput({ label, placeholder, hasSaved, onSave }: { label: string; placeholder: string; hasSaved?: boolean; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState('')
  const clear = () => {
    setDraft('')
    onSave('')
  }
  return h(
    'div',
    null,
    h('label', { style: fieldLabelStyle }, label),
    h(
      'div',
      { style: { display: 'flex', gap: 8 } },
      h(FieldInput as any, {
        placeholder: hasSaved === true ? 'saved — leave blank to keep' : placeholder,
        type: 'password',
        autoComplete: 'off',
        value: draft,
        onChange: (e: any) => setDraft(e.target.value),
        onBlur: () => {
          if (draft !== '') onSave(draft)
        },
        style: { flex: 1 } as any,
      }),
      hasSaved === true ? h(Button as any, { variant: 'outline', size: 'sm', onClick: clear }, 'Clear') : null,
    ),
  )
}

function ToggleField({ label, caption, checked, onChange }: { label: string; caption?: string; checked?: boolean; onChange: (v: boolean) => void }) {
  return h(
    'label',
    { style: { display: 'flex', alignItems: 'flex-start', gap: 10, margin: '8px 0', cursor: 'pointer' } },
    h('input', { type: 'checkbox', checked: checked === true, onChange: (e: any) => onChange(e.target.checked), style: { marginTop: 4, width: 16, height: 16, accentColor: t.primaryFill as string } }),
    h('span', null, h('div', { style: { fontSize: 13, color: t.labelPrimary as string, lineHeight: '18px' } }, label), caption ? h('div', { style: captionStyle }, caption) : null),
  )
}

function LanAccess({ proxyStatus, lanPin }: { proxyStatus: any; lanPin: any }) {
  const urls: string[] = proxyStatus?.lanUrls ?? []
  const [selected, setSelected] = useState(0)
  const index = Math.min(selected, Math.max(urls.length - 1, 0))
  if (!proxyStatus?.running) {
    return h('p', { style: { color: t.stateError as string, fontSize: 12, margin: '8px 0 0' } }, proxyStatus?.errorMessage ?? 'Proxy not running')
  }
  return h(
    'div',
    null,
    h('p', { style: captionStyle }, lanPin?.enabled === true ? 'Open this DSH UI from any device on your network — visitors enter the LAN PIN below.' : 'Open this DSH UI from any device on your network — no PIN needed.'),
    urls.length > 0
      ? h(
          'div',
          { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 } },
          ...urls.map((url, i) =>
            h(Button as any, { key: url, variant: i === index ? 'primary' : 'outline', size: 'sm', onClick: () => setSelected(i) }, url.replace(/^http:\/\//, '')),
          ),
        )
      : null,
    urls.length > 0
      ? h(
          'div',
          { 'data-maestro-qr-row': '', style: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' as const } },
          h(QrImage as any, { url: urls[index], size: 116 }),
          h('div', null, h('div', { style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: t.labelPrimary as string, wordBreak: 'break-all' } }, urls[index]), h('p', { style: captionStyle }, 'Scan with a phone on the same network.')),
        )
      : null,
    lanPin !== null ? h(LanPinRow as any, { lanPin }) : null,
  )
}

function LanPinRow({ lanPin }: { lanPin: any }) {
  return h(
    'div',
    { style: { marginTop: 12 } },
    h(
      'label',
      { style: { display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' } },
      h('input', { type: 'checkbox', checked: lanPin.enabled, onChange: (e: any) => lanPin.onToggle(e.target.checked), style: { width: 15, height: 15, accentColor: t.primaryFill as string } }),
      h('span', { style: { ...fieldLabelStyle, margin: 0 } }, 'Require a PIN on the LAN'),
    ),
    lanPin.enabled
      ? h(
          'div',
          { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' as const } },
          h('span', { style: { ...fieldLabelStyle, margin: 0 } }, 'LAN PIN'),
          h('code', { style: { fontFamily: 'ui-monospace, monospace', fontSize: 15, letterSpacing: 2, color: t.labelPrimary as string } }, lanPin.show ? (lanPin.pin ?? '••••••••') : '••••••••'),
          lanPin.show ? h(Button as any, { variant: 'outline', size: 'sm', onClick: lanPin.onHide }, 'Hide') : h(Button as any, { variant: 'outline', size: 'sm', onClick: lanPin.onShow }, 'Show'),
          h(Button as any, { variant: 'outline', size: 'sm', onClick: lanPin.onRotate }, 'Rotate'),
        )
      : null,
  )
}

function PublicAccess({ status, pin, showPin, onRevealPin, onHidePin, onRotatePin }: { status: any; pin: string | null; showPin: boolean; onRevealPin: () => void; onHidePin: () => void; onRotatePin: () => void }) {
  return h(
    'div',
    null,
    status?.running && status?.publicUrl
      ? h(
          'div',
          null,
          h(
            'div',
            { 'data-maestro-qr-row': '', style: { display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' as const } },
            h(QrImage as any, { url: status.publicUrl, size: 116 }),
            h('div', null, h('div', { style: { fontFamily: 'ui-monospace, monospace', fontSize: 12, color: t.labelPrimary as string, wordBreak: 'break-all' } }, status.publicUrl), h('p', { style: captionStyle }, 'Works from anywhere; visitors enter the PIN below.')),
          ),
        )
      : h('p', { style: captionStyle }, 'Start the tunnel to get a public address.'),
    h(
      'div',
      { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const } },
      h('span', { style: { ...fieldLabelStyle, margin: 0 } }, 'Access PIN'),
      h('code', { style: { fontFamily: 'ui-monospace, monospace', fontSize: 15, letterSpacing: 2, color: t.labelPrimary as string } }, showPin && pin !== null ? pin : '••••••••'),
      showPin ? h(Button as any, { variant: 'outline', size: 'sm', onClick: onHidePin }, 'Hide') : h(Button as any, { variant: 'outline', size: 'sm', onClick: onRevealPin }, 'Show'),
      h(Button as any, { variant: 'outline', size: 'sm', onClick: onRotatePin }, 'Rotate'),
    ),
    h('p', { style: captionStyle }, 'Stays the same across tunnel and DSH restarts; use Rotate when you need a new PIN.'),
  )
}

function NamedTunnelSetupNote() {
  return h(
    'div',
    { style: { ...cardInsetStyle, marginTop: '12px' } },
    h('p', { style: { ...captionStyle, marginBottom: 4, fontWeight: 500, color: t.labelPrimary as string } }, 'Named tunnel — one-time manual setup (requires your own Cloudflare account):'),
    h('ol', { style: { margin: '4px 0', paddingLeft: 20, fontSize: 12, color: t.labelSecondary as string, lineHeight: '18px' } }, h('li', null, 'cloudflared tunnel login'), h('li', null, 'cloudflared tunnel create dsh-maestro-webhook'), h('li', null, 'cloudflared tunnel route dns dsh-maestro-webhook <your-hostname>'), h('li', null, 'Paste the printed Tunnel ID, credentials file path and hostname below.')),
  )
}

// ---------------------------------------------------------------------------
// Main — DSH-native grouped settings (DisclosureRow per domain)
// ---------------------------------------------------------------------------
export function MaestroSettingsTab({ rpcCall, configRpcCall }: { rpcCall: any; configRpcCall?: any }) {
  const [status, setStatus] = useState<any>(null)
  const [proxyStatus, setProxyStatus] = useState<any>(null)
  const [config, setConfig] = useState<any>({ tunnelMode: 'quick', projectMappings: [] })
  const [catalog, setCatalog] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pin, setPin] = useState<string | null>(null)
  const [showPin, setShowPin] = useState(false)
  const [lanPinEnabled, setLanPinEnabled] = useState(false)
  const [lanPin, setLanPin] = useState<string | null>(null)
  const [showLanPin, setShowLanPin] = useState(false)
  const [guard, setGuard] = useState<any>({})
  const [patternsText, setPatternsText] = useState('')
  const [placeholdersText, setPlaceholdersText] = useState('')
  const [supervisorCfg, setSupervisorCfg] = useState<any>({})
  const [notifierCfg, setNotifierCfg] = useState<any>({})
  const [activeTab, setActiveTab] = useState('tunnel')
  // Mobile: inject responsive overrides once (mirrors dsh-maestro-mobile settings-sheet pill pattern + market catsWrap)
  useEffect(() => {
    const css = `
      /* Maestro nested tabs — market-like pill bar + mobile fixes */
      [data-maestro-tabs] { display:flex; gap:6px; overflow-x:auto; overflow-y:hidden; scrollbar-width:none; -webkit-overflow-scrolling:touch; overscroll-behavior-x:contain; touch-action:pan-x; padding-bottom:6px; margin-bottom:10px; border-bottom:1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)); }
      [data-maestro-tabs]::-webkit-scrollbar { display:none; width:0; height:0; }
      [data-maestro-tab] { flex:none; height:32px; min-width:fit-content; padding:0 14px; border-radius:999px; border:1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); background:transparent; color:var(--dsw-alias-label-primary); font-size:13px; line-height:20px; white-space:nowrap; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; font-family:inherit; -webkit-tap-highlight-color:transparent; }
      [data-maestro-tab][data-active="true"] { background:var(--dsw-specific-sidebar-nav-item-active, #EBEEF2); border-color:var(--dsw-specific-sidebar-nav-item-active, #EBEEF2); color:var(--dsw-alias-label-primary); }
      [data-maestro-tab]:hover { background:var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)); }
      [data-maestro-tab][data-active="true"]:hover { background:var(--dsw-specific-sidebar-nav-item-active, #EBEEF2); }
      [data-maestro-tab]:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary, #4f6ef7); outline-offset:1px; }
      [data-maestro-panel] { width:100%; min-width:0; box-sizing:border-box; }
      /* label → input dính nhau fix: flex column gap + full width */
      [data-maestro-panel] label { gap:6px !important; }
      [data-maestro-row]:last-child { border-bottom:none !important; }
      [data-maestro-panel] label > span { width:100% !important; box-sizing:border-box !important; }
      @media (max-width: 640px) {
        [data-maestro-settings-card] { max-width:100% !important; gap:6px !important; padding:0 2px !important; }
        [data-maestro-tabs] { gap:6px !important; padding:0 0 6px !important; margin:0 -2px 10px !important; }
        [data-maestro-tab] { height:32px !important; padding:0 12px !important; font-size:13px !important; }
        [data-maestro-mapping-row] { flex-direction:column !important; align-items:stretch !important; gap:8px !important; }
        [data-maestro-mapping-row] > * { flex:1 1 100% !important; width:100% !important; max-width:100% !important; }
        [data-maestro-qr-row] { flex-direction:column !important; align-items:flex-start !important; }
        [data-maestro-trigger-wrap] { max-width:100% !important; }
        [data-maestro-menu] { min-width:0 !important; max-width:calc(100vw - 32px) !important; left:0 !important; right:auto !important; }
        [data-maestro-panel] label { gap:8px !important; }
        div[data-maestro-row] { flex-direction:column !important; align-items:stretch !important; padding:12px 0 !important; }
        [data-maestro-row-text] { padding-right:0 !important; }
        [data-maestro-control] { width:100% !important; justify-content:flex-start !important; }
        [data-maestro-control] > span { width:100% !important; }
        [data-maestro-control] select { width:100% !important; }
        [data-maestro-project-grid] { grid-template-columns:1fr !important; }
        [data-maestro-project-card] { padding:10px !important; }
        [data-maestro-project-profile-row] { flex-direction:column !important; align-items:stretch !important; }
        [data-maestro-project-profile-row] > label { flex:1 1 100% !important; width:100% !important; }
      }
      @media (max-width: 390px) {
        [data-maestro-tab] { height:30px !important; padding:0 10px !important; font-size:12px !important; }
      }
    `
    const tag = document.createElement('style')
    tag.dataset.plugin = '@ddtcorex/dsh-maestro-config'
    tag.dataset.pluginCss = 'maestro/mobile-tabs.css'
    tag.textContent = css
    document.head.appendChild(tag)
    return () => tag.remove()
  }, [])

  const call = async (endpoint: string, payload?: unknown) => {
    const res = await rpcCall(endpoint, payload)
    if (!res?.ok) throw new Error(res?.error?.message ?? 'RPC failed')
    return res.value
  }
  const unwrap = (res: any) => {
    if (res && typeof res === 'object' && 'ok' in res) {
      if (res.ok) return res.value
      throw new Error(res.error?.message ?? 'RPC failed')
    }
    return res
  }
  const cfgGet = async (domain: string) => {
    if (!configRpcCall) throw new Error('config RPC not available')
    const res = await configRpcCall('get', { domain })
    return unwrap(res)
  }
  const cfgSet = async (domain: string, patch: object) => {
    if (!configRpcCall) throw new Error('config RPC not available')
    const res = await configRpcCall('set', { domain, patch })
    return unwrap(res)
  }
  const saveGuard = async (patch: any) => {
    setError(null)
    const next = { ...guard, ...patch }
    if (patch.gitProtection && guard.gitProtection) next.gitProtection = { ...guard.gitProtection, ...patch.gitProtection }
    setGuard(next)
    try {
      await cfgSet('guard', patch)
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
  }
  const commitBlacklistPatterns = async (text: string) => {
    const patterns = text.split('\n').map((s) => s.trim()).filter(Boolean)
    setError(null)
    try {
      await cfgSet('guardBlacklist', { patterns })
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
  }
  const commitPlaceholders = async () => {
    setError(null)
    let obj: any = {}
    try {
      obj = placeholdersText.trim() ? JSON.parse(placeholdersText) : {}
      if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) throw new Error('placeholders must be JSON object')
    } catch (e: any) {
      setError(`placeholders JSON invalid: ${e.message ?? String(e)}`)
      return
    }
    try {
      await cfgSet('guardBlacklist', { placeholders: obj })
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
  }
  const saveSupervisorCfg = async (patch: any) => {
    setError(null)
    setSupervisorCfg((prev: any) => ({ ...prev, ...patch }))
    try {
      await cfgSet('supervisor', patch)
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
  }
  const saveNotifierCfg = async (patch: any) => {
    setError(null)
    setNotifierCfg((prev: any) => {
      const next = { ...prev }
      for (const [k, v] of Object.entries(patch)) {
        if (k === 'telegram' && typeof v === 'object' && v !== null) (next as any).telegram = { ...((prev as any).telegram ?? {}), ...(v as any) }
        else (next as any)[k] = v
      }
      return next
    })
    try {
      await cfgSet('notifier', patch)
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
  }
  const refresh = async () => {
    try {
      setStatus(await call(MAESTRO_ENDPOINTS.status, {}))
    } catch {}
    try {
      setProxyStatus(await call(MAESTRO_ENDPOINTS.proxyStatus, {}))
    } catch {}
  }
  useEffect(() => {
    call(MAESTRO_ENDPOINTS.getConfig, {})
      .then((saved) => setConfig((prev: any) => ({ ...prev, ...saved })))
      .catch(() => {})
    if (configRpcCall) {
      configRpcCall('get', { domain: 'supervisor' })
        .then((res: any) => {
          if (res?.ok && res.value?.model) setConfig((prev: any) => ({ ...prev, supervisorModel: res.value.model }))
        })
        .catch(() => {})
      Promise.all([cfgGet('guard').catch(() => ({})), cfgGet('guardBlacklist').catch(() => ({ patterns: [], placeholders: {} })), cfgGet('supervisor').catch(() => ({})), cfgGet('notifier').catch(() => ({}))])
        .then(([g, bl, sup, not]) => {
          setGuard(g ?? {})
          const pats = Array.isArray((bl as any)?.patterns) ? (bl as any).patterns : []
          const ph = (bl as any)?.placeholders && typeof (bl as any).placeholders === 'object' ? (bl as any).placeholders : {}
          setPatternsText(pats.join('\n'))
          setPlaceholdersText(JSON.stringify(ph, null, 2))
          setSupervisorCfg(sup ?? {})
          setNotifierCfg(not ?? {})
        })
        .catch(() => {})
    }
    call(MAESTRO_ENDPOINTS.lanPinStatus, {})
      .then((value: any) => {
        setLanPinEnabled(value.enabled)
        if (value.enabled) setLanPin(value.pin ?? null)
      })
      .catch(() => {})
    call(MAESTRO_ENDPOINTS.modelsList, {})
      .then((value) => setCatalog(value))
      .catch(() => {})
  }, [])
  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 3000)
    return () => clearInterval(t)
  }, [])
  const revealPin = async () => {
    if (pin === null) {
      try {
        setPin((await call(MAESTRO_ENDPOINTS.getPin, {})).pin)
      } catch (err: any) {
        setError(err.message)
      }
    }
    setShowPin(true)
  }
  const rotatePin = async () => {
    setError(null)
    try {
      const fresh = (await call(MAESTRO_ENDPOINTS.rotatePin, {})).pin
      setPin(fresh)
      setShowPin(true)
    } catch (err: any) {
      setError(err.message)
    }
  }
  const toggleLanPin = async (enabled: boolean) => {
    setError(null)
    const previous = lanPinEnabled
    setLanPinEnabled(enabled)
    try {
      await call(MAESTRO_ENDPOINTS.lanPinSetEnabled, { enabled })
      if (enabled) {
        const value = await call(MAESTRO_ENDPOINTS.lanPinStatus, {})
        setLanPin(value.pin ?? null)
        setShowLanPin(true)
      } else {
        setLanPin(null)
        setShowLanPin(false)
      }
    } catch (err: any) {
      setLanPinEnabled(previous)
      setError(err.message)
    }
  }
  const revealLanPin = async () => {
    if (lanPin === null) {
      try {
        setLanPin((await call(MAESTRO_ENDPOINTS.lanPinStatus, {})).pin ?? null)
      } catch (err: any) {
        setError(err.message)
      }
    }
    setShowLanPin(true)
  }
  const rotateLanPin = async () => {
    setError(null)
    try {
      const fresh = (await call(MAESTRO_ENDPOINTS.lanPinRotate, {})).pin
      setLanPin(fresh)
      setShowLanPin(true)
    } catch (err: any) {
      setError(err.message)
    }
  }
  const startTunnel = async () => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await call(MAESTRO_ENDPOINTS.tunnelStart, {}))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const stopTunnel = async () => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await call(MAESTRO_ENDPOINTS.tunnelStop, {}))
    } catch (err: any) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const saveField = async (field: string, value: unknown) => {
    setError(null)
    setConfig((prev: any) => ({ ...prev, [field]: value }))
    if (field === 'supervisorModel' && configRpcCall) {
      try {
        const res = await configRpcCall('set', { domain: 'supervisor', patch: { model: value } })
        if (res?.ok) return
      } catch {}
    }
    try {
      await call(MAESTRO_ENDPOINTS.saveConfig, { [field]: value })
    } catch (err: any) {
      setError(err.message)
    }
  }

  // Nested tabs like plugin marketplace — pill bar + single panel (market catsWrap catsRow pattern)
  const TABS = [
    { id: 'tunnel', label: 'Tunnel' },
    { id: 'notify', label: 'Notify' },
    { id: 'gitlab', label: 'GitLab' },
    { id: 'review', label: 'Review' },
    { id: 'guard', label: 'Guard' },
    { id: 'blacklist', label: 'Blacklist' },
    { id: 'supervisor', label: 'Supervisor' },
    { id: 'notifier', label: 'Notifier' },
  ] as const

  const tabContents: Record<string, unknown> = {
    tunnel: h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h(SettingRow as any, { title: 'Tunnel mode', description: 'Quick = ephemeral URL, Named = stable URL with Cloudflare setup.', control: h('select', { value: config.tunnelMode, onChange: (e: any) => saveField('tunnelMode', e.target.value), style: { height: 36, padding: '0 12px', border: `1px solid ${t.borderL2}`, borderRadius: 18, background: 'var(--dsw-alias-bg-module-platform, #F5F6F7)' as string, color: t.labelPrimary as string, font: 'inherit', fontSize: 13 } }, h('option', { value: 'quick' }, 'Quick'), h('option', { value: 'named' }, 'Named')) }),
        config.tunnelMode === 'named' ? h(NamedTunnelSetupNote as any, null) : null,
        config.tunnelMode === 'named'
          ? h('div', { style: { display: 'flex', flexDirection: 'column' } },
              h(SettingRow as any, { title: 'Tunnel ID', description: 'Cloudflare tunnel ID.', control: h(FieldInput as any, { placeholder: 'Tunnel ID', value: config.tunnelId ?? '', onChange: (e: any) => saveField('tunnelId', e.target.value), style: { width: 260 } as any }) }),
              h(SettingRow as any, { title: 'Credentials file', description: 'Path to tunnel credentials JSON.', control: h(FieldInput as any, { placeholder: '~/.cloudflared/<id>.json', value: config.tunnelCredentialsFile ?? '', onChange: (e: any) => saveField('tunnelCredentialsFile', e.target.value), style: { width: 260 } as any }) }),
              h(SettingRow as any, { title: 'Hostname', description: 'Public hostname for the tunnel.', control: h(FieldInput as any, { placeholder: 'dsh.example.com', value: config.tunnelHostname ?? '', onChange: (e: any) => saveField('tunnelHostname', e.target.value), style: { width: 260 } as any }) }),
            )
          : null,
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, padding: '12px 0', borderBottom: `1px solid ${t.borderL2}` } }, status?.running ? h(Button as any, { variant: 'outline', size: 'md', disabled: busy, onClick: stopTunnel }, 'Stop tunnel') : h(Button as any, { variant: 'primary', size: 'md', disabled: busy, onClick: startTunnel }, 'Start tunnel')),
        h('div', { style: { ...cardInsetStyle, marginTop: '12px' } }, h('div', { style: { fontSize: 13, fontWeight: 600, color: t.labelPrimary as string } }, 'Remote access — LAN'), h(LanAccess as any, { proxyStatus, lanPin: lanPinEnabled === null ? null : { enabled: lanPinEnabled, pin: lanPin, show: showLanPin, onShow: revealLanPin, onHide: () => setShowLanPin(false), onRotate: rotateLanPin, onToggle: toggleLanPin } })),
        h('div', { style: { ...cardInsetStyle, marginTop: '12px' } }, h('div', { style: { fontSize: 13, fontWeight: 600, color: t.labelPrimary as string } }, 'Public access'), h(PublicAccess as any, { status, pin, showPin, onRevealPin: revealPin, onHidePin: () => setShowPin(false), onRotatePin: rotatePin })),
      ),
    notify: h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h('div', { style: { padding: '12px 0', borderBottom: `1px solid ${t.borderL2}` } }, h('p', { style: captionStyle }, 'Sends one protected startup update with the current public-access PIN to a single chat. Leave either credential blank to disable.')),
        h(SettingRow as any, { title: 'Bot token', description: 'Telegram bot token from @BotFather.', control: h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } }, h(FieldInput as any, { placeholder: '123456:ABC-DEF...', type: 'password', autoComplete: 'off', value: config.hasTelegramBotToken ? '••••••••' : '', onChange: (e: any) => saveField('telegramBotToken', e.target.value), style: { width: 220 } as any }), config.hasTelegramBotToken ? h(Button as any, { variant: 'outline', size: 'md', onClick: () => saveField('telegramBotToken', '') }, 'Clear') : null) }),
        h(SettingRow as any, { title: 'Chat ID', description: 'Target chat, e.g. -1001234567890.', control: h(FieldInput as any, { placeholder: '-1001234567890', value: config.telegramChatId ?? '', onChange: (e: any) => saveField('telegramChatId', e.target.value), style: { width: 220 } as any }) }),
        h(ToggleRow as any, { title: 'Also notify about reviews', description: 'One message per review run with its outcome.', checked: config.telegramReviewNotifications === true, onChange: (v: boolean) => saveField('telegramReviewNotifications', v) }),
      ),
    gitlab: h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h(SettingRow as any, { title: 'GitLab base URL', description: 'e.g. https://gitlab.example.com', control: h(FieldInput as any, { placeholder: 'https://gitlab.example.com', value: config.gitlabBaseUrl ?? '', onChange: (e: any) => saveField('gitlabBaseUrl', e.target.value), style: { width: 260 } as any }) }),
        h(SettingRow as any, { title: 'GitLab token', description: 'Personal access token with api scope.', control: h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } }, h(FieldInput as any, { type: 'password', autoComplete: 'off', value: config.hasGitlabToken ? '••••••••' : '', placeholder: 'GitLab token', onChange: (e: any) => saveField('gitlabToken', e.target.value), style: { width: 200 } as any }), config.hasGitlabToken ? h(Button as any, { variant: 'outline', size: 'md', onClick: () => saveField('gitlabToken', '') }, 'Clear') : null) }),
        h(SettingRow as any, { title: 'Bot username', description: 'Username of the bot that posts reviews.', control: h(FieldInput as any, { placeholder: 'maestro-bot', value: config.botUsername ?? '', onChange: (e: any) => saveField('botUsername', e.target.value), style: { width: 220 } as any }) }),
        h(SettingRow as any, { title: 'Webhook secret', description: 'Secret token for GitLab webhooks.', control: h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } }, h(FieldInput as any, { type: 'password', autoComplete: 'off', value: config.hasWebhookSecret ? '••••••••' : '', placeholder: 'Webhook secret', onChange: (e: any) => saveField('webhookSecret', e.target.value), style: { width: 200 } as any }), h(Button as any, { variant: 'outline', size: 'md', onClick: () => saveField('webhookSecret', generateWebhookSecret()) }, 'Generate')) }),
        h('div', { style: { padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 6 } },
          h('p', { style: captionStyle }, 'In GitLab: Settings → Webhooks, Secret token = this value, enable Merge request events. Webhook URL:'),
          h('div', { style: { fontFamily: 'ui-monospace, monospace', fontSize: 12, color: t.labelPrimary as string, wordBreak: 'break-all', padding: '10px 12px', borderRadius: 8, background: t.bgLayer3 as string, border: `1px solid ${t.borderL2}`, overflowWrap:'anywhere' as any } }, gitlabWebhookUrl(config.tunnelHostname)),
        ),
      ),
    review: h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h(ToggleRow as any, { title: 'Re-review on push', description: 'When new commits are pushed, trigger an automatic re-review.', checked: config.autoRereviewOnPush === true, onChange: (v: boolean) => saveField('autoRereviewOnPush', v) }),
        h(SettingRow as any, { title: 'Global review model', description: 'Model for automated reviews. Empty = DSH default.', control: h(ReviewModelSelector as any, { value: config.reviewModel ?? null, catalog, fallbackValue: catalog?.current ?? null, fallbackLabel: 'Use DSH default', onChange: (v: any) => saveField('reviewModel', v), label: null }) }),
        h(SettingRow as any, { title: 'Supervisor model', description: 'Model for auto-fixing DSH Web crashes.', control: h(ReviewModelSelector as any, { value: config.supervisorModel ?? null, catalog, fallbackValue: catalog?.current ?? null, fallbackLabel: 'Use DSH default', onChange: (v: any) => saveField('supervisorModel', v), label: null }) }),
        h(ProjectMappingsEditor as any, { mappings: config.projectMappings ?? [], onChange: (mappings: any) => saveField('projectMappings', mappings), catalog, globalReviewModel: config.reviewModel ?? null }),
      ),
    guard: h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h(ToggleRow as any, { title: 'Block publish commands', description: 'Prevent publish-related commands when enabled.', checked: guard.publishBlocked === true, onChange: (v: boolean) => saveGuard({ publishBlocked: v }) }),
        h(ToggleRow as any, { title: 'Protect git branches', description: 'Block direct pushes to protected branches.', checked: guard.gitProtection?.enabled === true, onChange: (v: boolean) => saveGuard({ gitProtection: { enabled: v, branches: guard.gitProtection?.branches ?? ['master', 'main'] } }) }),
        h(SettingRow as any, { title: 'Protected branches', description: 'Comma-separated list, e.g. master, main.', control: h(FieldInput as any, { value: (guard.gitProtection?.branches ?? ['master', 'main']).join(', '), placeholder: 'master, main', onChange: (e: any) => saveGuard({ gitProtection: { enabled: guard.gitProtection?.enabled ?? true, branches: e.target.value.split(',').map((s: any) => s.trim()).filter(Boolean) } }), style: { width: 260 } as any }) }),
        h(ToggleRow as any, { title: 'Contain working directory', description: 'Restrict file operations to the session working directory.', checked: guard.cwdContainment === true, onChange: (v: boolean) => saveGuard({ cwdContainment: v }) }),
        h(SettingRow as any, { title: 'Credential file paths', description: 'Comma-separated paths to credential files.', control: h(FieldInput as any, { value: (guard.credentialPaths ?? []).join(', '), placeholder: '~/.config/credentials.yaml', onChange: (e: any) => saveGuard({ credentialPaths: e.target.value.split(',').map((s: any) => s.trim()).filter(Boolean) }), style: { width: 260 } as any }) }),
      ),
    blacklist: h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h('div', { style: { ...rowStyle, flexDirection:'column', alignItems:'stretch', gap: 8 } as any },
          h('div', { style: rowTitleStyle }, 'Blacklist patterns'),
          h('div', { style: rowDescStyle }, 'One pattern per line. Matching files are blocked from commit.'),
          h(TextareaField as any, { value: patternsText, placeholder: 'example-project\nacme-shop', onChange: (e: any) => setPatternsText(e.target.value), onBlur: (e: any) => commitBlacklistPatterns(e.target.value) }),
        ),
        h('div', { style: { ...rowStyle, flexDirection:'column', alignItems:'stretch', gap: 8, borderBottom:'none' } as any },
          h('div', { style: rowTitleStyle }, 'Placeholder mappings'),
          h('div', { style: rowDescStyle }, 'JSON object mapping blocked patterns to placeholder suggestions.'),
          h(TextareaField as any, { value: placeholdersText, placeholder: '{"example-project":"my-project"}', onChange: (e: any) => setPlaceholdersText(e.target.value), onBlur: () => commitPlaceholders(), style: { minHeight: 80 } as any }),
          h('div', { style: { marginTop: 8 } }, h(Button as any, { variant: 'outline', size: 'sm', onClick: () => { commitBlacklistPatterns(patternsText); commitPlaceholders() } }, 'Save Blacklist')),
        ),
      ),
    supervisor: h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h(SettingRow as any, { title: 'Check interval', description: 'Milliseconds between supervisor checks. Default 5000.', control: h(FieldInput as any, { type: 'number', value: supervisorCfg.intervalMs ?? '', placeholder: '5000', onChange: (e: any) => { const v = e.target.value === '' ? undefined : Number(e.target.value); saveSupervisorCfg({ intervalMs: v }) }, style: { width: 160 } as any }) }),
        h(SettingRow as any, { title: 'Down threshold', description: 'Consecutive failures before marking a session as down.', control: h(FieldInput as any, { type: 'number', value: supervisorCfg.downThreshold ?? '', placeholder: '3', onChange: (e: any) => { const v = e.target.value === '' ? undefined : Number(e.target.value); saveSupervisorCfg({ downThreshold: v }) }, style: { width: 160 } as any }) }),
        h(ToggleRow as any, { title: 'Auto-resume sessions', description: 'Automatically resume sessions marked as down.', checked: supervisorCfg.autoResumeEnabled === true, onChange: (v: boolean) => saveSupervisorCfg({ autoResumeEnabled: v }) }),
      ),
    notifier: h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h(SettingRow as any, { title: 'Bot token', description: 'Telegram bot token from @BotFather.', control: h(FieldInput as any, { type: 'password', autoComplete: 'off', value: notifierCfg.telegram?.botToken ?? '', placeholder: '123456:ABC-DEF...', onChange: (e: any) => saveNotifierCfg({ telegram: { botToken: e.target.value } }), style: { width: 260 } as any }) }),
        h(SettingRow as any, { title: 'Chat ID', description: 'Target chat, e.g. -1001234567890.', control: h(FieldInput as any, { value: notifierCfg.telegram?.chatId ?? '', placeholder: '-1001234567890', onChange: (e: any) => saveNotifierCfg({ telegram: { chatId: e.target.value } }), style: { width: 260 } as any }) }),
        h(ToggleRow as any, { title: 'Review notifications', description: 'Also notify about finished reviews.', checked: notifierCfg.telegram?.reviewNotifications === true || notifierCfg.policy?.reviewNotifications === true, onChange: (v: boolean) => saveNotifierCfg({ telegram: { reviewNotifications: v } }) }),
      ),
  }

  return h(
    'div',
    { 'data-maestro-settings-card': '', style: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 640, minWidth:0, boxSizing:'border-box' as any } },
    h(
      'div',
      { style: { padding: '2px 2px 8px' } },
      h('div', { style: { fontSize: 15, fontWeight: 600, color: t.labelPrimary as string, lineHeight: '22px' } }, 'Maestro'),
      h('div', { style: { fontSize: 12, color: t.labelSecondary as string, lineHeight: '16px', marginTop: 2 } }, 'Tunnel, access, review & guard — all via the shared Maestro store. Uses the same tokens and primitives as DSH settings.'),
    ),
    h('div', { 'data-maestro-tabs': '', role:'tablist', 'aria-label':'Maestro settings sections' },
      ...TABS.map(tab => h('button', { key: tab.id, 'data-maestro-tab':'', 'data-active': String(activeTab===tab.id), role:'tab', 'aria-selected': activeTab===tab.id, onClick: () => setActiveTab(tab.id) }, tab.label))
    ),
    h('div', { 'data-maestro-panel': activeTab, style: { display:'flex', flexDirection:'column', gap:10, minWidth:0 } }, tabContents[activeTab] as any),
    error ? h('p', { style: { color: t.stateError as string, fontSize: 12, margin: '8px 0 0', padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent)', border: `1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent)` } }, error) : null,
  )
}
