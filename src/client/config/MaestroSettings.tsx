/**
 * Maestro Settings — DSH-native redesign.
 * Reuses DeepSeek Harness design tokens & primitive geometry maximally:
 *  - --dsw-alias-* color family (no hard-coded hex except QR tile #fff)
 *  - Button variants primary/ghost/outline (h36 capsule / h28 small) — same as @deepseek-ai/dsh-client-ui-primitives/Button
 *  - Input atom (h32, radius 8, bg-layer-1, focus border brand) — same as primitives/Input
 *  - DisclosureRow (24px row, 14px glyph, chevron hover) — same as primitives/DisclosureRow
 *  - Panel chroma: inner cards use bg-layer-2 / border-l2 / radius 12 / shadow lv3 where needed
 */

import { createElement as h, useEffect, useState } from 'react'
import { RULE_META, effectiveGuardView, ruleTierPatch } from './guard-view.js'
import type { GuardTier } from './guard-view.js'
import { BrandBadge } from './components/BrandMark.js'

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
// Nested pill tabs — unified with dsh-maestro-jobs (maestro-design: Minimalism & Swiss)
// Shared geometry: 40px min-height (44px jobs → 40px unified, touch-friendly ≥24px WCAG),
// 14px icon + 13px label gap 6, pill 999, border-l1, #EBEEF2 active, hover, focus ring.
// Icons: lucide-style 14px SVG, stroke 1.8, currentColor.
// ---------------------------------------------------------------------------
type TabIcon = 'shield' | 'cpu'
const TAB_ICON_PATHS: Record<TabIcon, string> = {
  shield: 'M12 2l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V6l7-4z',
  cpu: 'M5 12H2a2 2 0 0 1 2-2h2M12 5V2a2 2 0 0 1 2 2v2M19 12h2a2 2 0 0 1-2 2h-2M12 19v2a2 2 0 0 1-2-2v-2M8 8h8v8H8z',
}
function TabIcon({ name, size = 14 }: { name: TabIcon; size?: number }) {
  return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', style: { flex: 'none' } }, h('path', { d: TAB_ICON_PATHS[name] }))
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
function SettingRow({ title, description, control }: { title: string; description?: string; control: unknown }) {
  return h(
    'div',
    { 'data-maestro-row': '', style: rowStyle },
    h('div', { 'data-maestro-row-text': '', style: rowTextStyle }, h('div', { style: rowTitleStyle }, title), description ? h('div', { style: rowDescStyle }, description) : null),
    h('div', { 'data-maestro-control': '', style: { flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minHeight: '36px' } }, control as any),
  )
}
/**
 * A boolean settings row.
 *
 * `disabled` exists for one honest case: a value that an install-supplied
 * Cordis `config:` block pins at a higher precedence than this store, so the
 * checkbox would look interactive and silently do nothing. A locked row still
 * shows the *effective* value (not the store's shadowed one) and says why.
 */
function ToggleRow({ title, description, checked, onChange, disabled }: { title: string; description?: string; checked?: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const locked = disabled === true
  return h(
    'label',
    {
      'data-maestro-row': '',
      'data-maestro-locked': locked ? 'true' : undefined,
      style: { ...rowStyle, cursor: locked ? 'default' : 'pointer', alignItems: 'flex-start', opacity: locked ? 0.65 : 1 },
    },
    h('input', { type: 'checkbox', checked: checked === true, disabled: locked, 'aria-disabled': locked ? 'true' : undefined, onChange: (e: any) => { if (!locked) onChange(e.target.checked) }, style: { width: 16, height: 16, accentColor: t.primaryFill as string, marginTop: 4, flex: 'none' } }),
    h('div', { 'data-maestro-row-text': '', style: { ...rowTextStyle, paddingRight: '0' } }, h('div', { style: rowTitleStyle }, title), description ? h('div', { style: rowDescStyle }, description) : null),
  )
}

function deepMergeGuard(base: any, patch: any): any {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return patch
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return patch
  const out: any = { ...base }
  for (const key of Object.keys(patch)) out[key] = key in out ? deepMergeGuard(out[key], patch[key]) : patch[key]
  return out
}

// CommitField — a text input with a local draft committed on blur / Enter.
// Same no-per-keystroke contract as SecretField, for plain (non-secret)
// values: the store never sees a half-typed string.
function CommitField({ value, placeholder, onCommit, width, ariaLabel }: { value: string; placeholder: string; onCommit: (v: string) => void; width?: number; ariaLabel?: string }) {
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setDraft(value)
  }, [value, focused])
  return h(FieldInput as any, {
    value: draft,
    placeholder,
    onChange: (e: any) => setDraft(e.target.value),
    onFocus: () => setFocused(true),
    onBlur: (e: any) => {
      setFocused(false)
      if (e.target.value !== value) onCommit(e.target.value)
    },
    onKeyDown: (e: any) => {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
    },
    'aria-label': ariaLabel ?? placeholder,
    style: { width: width ?? 260 } as any,
  })
}

// ListEditor — one input row per value with add/remove, for multi-value
// fields (branches, paths). A comma-joined single input would split a path
// that legitimately contains a comma or spaces, and gives no per-item
// affordance; rows commit the whole list at once, never per keystroke.
function ListEditor({ values, placeholder, onCommit, ariaLabel, emptyHint }: { values: string[]; placeholder: string; onCommit: (v: string[]) => void; ariaLabel: string; emptyHint?: string }) {
  const [drafts, setDrafts] = useState(values)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setDrafts(values)
  }, [values, editing])
  const keyOf = (ds: string[]) => ds.join('\n')
  const commitRows = (rows: string[]) => {
    const cleaned = rows.map((s) => s.trim()).filter((s) => s !== '')
    if (keyOf(cleaned) !== keyOf(values)) onCommit(cleaned)
    setDrafts(cleaned.length > 0 ? cleaned : [])
    setEditing(false)
  }
  return h(
    'div',
    { 'data-maestro-list': '', style: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', minWidth: 0 } },
    drafts.length === 0
      ? h('p', { style: { ...captionStyle, margin: 0 } }, emptyHint ?? 'No entries.')
      : null,
    ...drafts.map((draft, i) =>
      h(
        'div',
        { key: `${i}`, style: { display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 } },
        h(FieldInput as any, {
          value: draft,
          placeholder,
          onChange: (e: any) => {
            setEditing(true)
            setDrafts((prev: string[]) => prev.map((d, j) => (j === i ? e.target.value : d)))
          },
          onFocus: () => setEditing(true),
          onBlur: () => commitRows(drafts),
          onKeyDown: (e: any) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          },
          'aria-label': `${ariaLabel} ${i + 1}`,
          style: { flex: '1 1 auto', minWidth: 0 } as any,
        }),
        h(
          Button as any,
          {
            variant: 'outline', size: 'sm',
            onClick: () => commitRows(drafts.filter((_, j) => j !== i)),
            'aria-label': `Remove ${ariaLabel} ${i + 1}`, title: 'Remove entry',
          },
          '✕',
        ),
      ),
    ),
    h(
      'div',
      null,
      h(Button as any, { variant: 'outline', size: 'sm', onClick: () => { setEditing(true); setDrafts((prev: string[]) => [...prev, '']) } }, '+ Add entry'),
    ),
  )
}

export function MaestroSettingsTab({ configRpcCall, supervisorRpcCall }: { configRpcCall?: any; supervisorRpcCall?: any }) {
  const [guard, setGuard] = useState<any>({})
  const [patterns, setPatterns] = useState<string[]>([])
  // Effective auto-resume state reported by the in-tree supervisor plugin
  // (`/dsh-maestro-supervisor-resume` → `status`). null = supervisor not
  // installed or not answering yet — the toggle then renders unlocked, which
  // is the pre-existing behavior.
  const [supervisorStatus, setSupervisorStatus] = useState<any>(null)
  const [supervisorCfg, setSupervisorCfg] = useState<any>({})
  const [activeTab, setActiveTab] = useState('guard')
  // Every save in this tab reports its failure here, and the render reads it
  // back. The declaration is load-bearing: without it the render raises
  // `ReferenceError` and the whole section mounts empty.
  const [error, setError] = useState<string | null>(null)
  // Mobile: inject responsive overrides once (mirrors dsh-maestro-mobile settings-sheet pill pattern + market catsWrap)
  useEffect(() => {
    const css = `
      /* Model override dropdown — prevent right-edge overlap */
      [data-maestro-control] [data-maestro-menu] { left:auto !important; right:0 !important; }
      [data-maestro-project-card] [data-maestro-menu] { left:auto !important; right:0 !important; }
      [data-maestro-trigger-wrap] { min-width:0; }
      /* Maestro nested tabs — unified with dsh-maestro-jobs (maestro-design pill bar) */
      [data-maestro-tabs] { display:flex; gap:6px; overflow-x:auto; overflow-y:hidden; scrollbar-width:none; -webkit-overflow-scrolling:touch; overscroll-behavior-x:contain; touch-action:pan-x; padding:2px 2px 8px; margin:0 -2px 4px; border-bottom:1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.08)); }
      [data-maestro-tabs]::-webkit-scrollbar { display:none; width:0; height:0; }
      [data-maestro-tab] { flex:none; min-width:fit-content; min-height:40px; padding:0 14px; border-radius:999px; border:1px solid var(--dsw-alias-border-l1, rgba(0,0,0,.12)); background:transparent; color:var(--dsw-alias-label-secondary); font-size:13px; line-height:20px; font-weight:500; font-family:inherit; white-space:nowrap; display:inline-flex; align-items:center; justify-content:center; gap:6px; cursor:pointer; -webkit-tap-highlight-color:transparent; transition: background 150ms ease, color 150ms ease, border-color 150ms ease; touch-action:manipulation; }
      [data-maestro-tab][data-active="true"] { background:var(--dsw-specific-sidebar-nav-item-active, #EBEEF2); border-color:var(--dsw-specific-sidebar-nav-item-active, #EBEEF2); color:var(--dsw-alias-label-primary); font-weight:600; }
      [data-maestro-tab]:hover { background:var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06)); }
      [data-maestro-tab][data-active="true"]:hover { background:var(--dsw-specific-sidebar-nav-item-active, #EBEEF2); }
      [data-maestro-tab]:focus-visible { outline:2px solid var(--dsw-alias-state-business-primary, #4f6ef7); outline-offset:1px; }
      [data-maestro-tab]:active { transform: scale(.97); }
      [data-maestro-panel] { width:100%; min-width:0; box-sizing:border-box; }
      /* label/input overlap fix: flex column gap + full width */
      [data-maestro-panel] label { gap:6px !important; }
      [data-maestro-row]:last-child { border-bottom:none !important; }
      [data-maestro-panel] label > span { width:100% !important; box-sizing:border-box !important; }
      @media (prefers-reduced-motion: reduce) {
        [data-maestro-tab] { transition: none !important; }
        [data-maestro-tab]:active { transform: none !important; }
      }
      @media (max-width: 640px) {
        [data-maestro-settings-card] { max-width:100% !important; gap:6px !important; padding:0 2px !important; }
        /* Guard status card: stack the summary above the Reset button — the
           DSH shell keeps its nav column beside the content on phones, so the
           panel is ~200px wide and a side-by-side row wraps the button. */
        [data-maestro-guard-status] { flex-direction:column !important; align-items:stretch !important; gap:8px !important; }
        [data-maestro-guard-status] button { align-self:stretch !important; white-space:normal !important; max-width:100% !important; box-sizing:border-box !important; }
        [data-maestro-tabs] { gap:6px !important; padding:2px 2px 8px !important; margin:0 -2px 8px !important; }
        [data-maestro-tab] { min-height:40px !important; height:auto !important; padding:0 12px !important; font-size:13px !important; }
        [data-maestro-qr-row] { flex-direction:column !important; align-items:flex-start !important; }
        [data-maestro-trigger-wrap] { max-width:100% !important; }
        [data-maestro-menu] { min-width:0 !important; max-width:calc(100vw - 32px) !important; left:0 !important; right:auto !important; }
        [data-maestro-control] [data-maestro-menu] { left:0 !important; right:auto !important; }
        [data-maestro-project-card] [data-maestro-menu] { left:0 !important; right:auto !important; }
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
        [data-maestro-tab] { min-height:38px !important; height:auto !important; padding:0 10px !important; font-size:12px !important; }
      }
      /* iOS 16px field floor hold (dsh-maestro-mobile zoom guard).
         Every text field on the page is held at 16px under
         html[data-mobile-nav-ios] inside this same predicate, because iOS WebKit
         magnifies the visual viewport for a focused field below 16px. An earlier
         revision of this panel opted its own fields back out to inherit for a
         compact scale - and every tap on those fields zoomed the page on
         iPhone, with modal sheets never blurring back. Function beats pixels:
         hold the same 16px here. The :not(#…) clause matches every element (no node
         carries that id) and exists purely for id-level specificity: the floor
         carries ten :not([type=…]) clauses, so an equal-specificity !important rule
         keeps winning over competing field rules. Android and desktop never carry
         the marker, so the compact scale they were designed with is untouched. */
      @media (max-width: 1023px) and (pointer: coarse) {
        html[data-mobile-nav-ios] [data-maestro-panel] input:not(#dsh-field-floor-opt-out),
        html[data-mobile-nav-ios] [data-maestro-panel] textarea:not(#dsh-field-floor-opt-out),
        html[data-mobile-nav-ios] [data-maestro-panel] select:not(#dsh-field-floor-opt-out) { font-size:16px !important; }
      }
    `
    const tag = document.createElement('style')
    tag.dataset.plugin = '@ddtcorex/dsh-maestro-config'
    tag.dataset.pluginCss = 'maestro/mobile-tabs.css'
    tag.textContent = css
    document.head.appendChild(tag)
    return () => tag.remove()
  }, [])

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
  // Deep-merge a guard patch into the local raw document (arrays replace, like
  // the store's own deepMerge). Text fields commit on blur/Enter through
  // CommitField below — never per keystroke, so a half-typed value is not
  // persisted and the RPC is not spammed.
  const saveGuard = async (patch: any) => {
    setError(null)
    setGuard((prev: any) => deepMergeGuard(prev ?? {}, patch))
    try {
      await cfgSet('guard', patch)
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
  }
  // One rule's tier. 'default' unsets the override (null patch — see
  // ruleTierPatch) so the row truly returns to the built-in tier instead of
  // storing an echo that would render "customized" forever.
  const saveGuardRule = async (ruleId: string, tier: GuardTier | 'default') => {
    await saveGuard({ rules: ruleTierPatch(ruleId, tier) })
  }
  // Reset everything the tab owns to the built-in behaviour. Deep-merge cannot
  // delete keys, so rule overrides are nulled (the runtime drops non-string
  // tiers at merge) and legacy booleans are neutralised to their inert values
  // (only `false` ever migrated).
  const resetGuardDefaults = async () => {
    const rules: Record<string, GuardTier | null> = {}
    for (const meta of RULE_META) rules[meta.id] = null
    await saveGuard({
      gitProtection: { enabled: true, branches: ['master', 'main'] },
      publishBlocked: true,
      cwdContainment: true,
      credentialPaths: [],
      rules,
      protectedBranches: ['master', 'main'],
      protectedPaths: [],
      workingDirContainment: { enabled: true, spillReads: true },
      journal: { enabled: true, allowCounters: true, retainDays: 30, retainFiles: 14 },
    })
  }
  const commitBlacklistPatterns = async (list: string[]) => {
    setError(null)
    setPatterns(list)
    try {
      await cfgSet('guardBlacklist', { patterns: list })
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
  }
  const saveSupervisorCfg = async (patch: any) => {
    setError(null)
    setSupervisorCfg((prev: any) => ({ ...prev, ...patch }))
    // Keep the effective-state view in step with an explicit write: without
    // this the toggle would snap back to the plugin's last-reported value
    // until the next status fetch.
    if (typeof patch?.autoResumeEnabled === 'boolean') {
      setSupervisorStatus((prev: any) => (prev ? { ...prev, autoResumeEnabled: patch.autoResumeEnabled } : prev))
    }
    try {
      await cfgSet('supervisor', patch)
    } catch (e: any) {
      setError(e.message ?? String(e))
    }
  }

  useEffect(() => {
    if (configRpcCall) {
      Promise.all([cfgGet('guard').catch(() => ({})), cfgGet('guardBlacklist').catch(() => ({ patterns: [] })), cfgGet('supervisor').catch(() => ({}))])
        .then(([g, bl, sup]) => {
          setGuard(g ?? {})
          const pats = Array.isArray((bl as any)?.patterns) ? (bl as any).patterns.filter((p: any) => typeof p === 'string') : []
          setPatterns(pats)
          setSupervisorCfg(sup ?? {})
        })
        .catch(() => {})
    }
    // Ask the supervisor for the EFFECTIVE auto-resume state: `autoResumePinned`
    // is true when an install-supplied Cordis `config:` block outranks this
    // store, so the toggle must render locked rather than lie. Absent service
    // (not installed) leaves the toggle interactive.
    if (supervisorRpcCall) {
      supervisorRpcCall('status', {})
        .then((res: any) => setSupervisorStatus(unwrap(res)))
        .catch(() => {})
    }
  }, [])
  // A pin means an install-supplied Cordis `config:` block outranks this store,
  // so a write here would be shadowed. Only claimed when the supervisor
  // actually answered — an absent/unresponsive service keeps the toggle live.
  const autoResumePinned = supervisorStatus?.autoResumePinned === true
  // When the plugin answers, its value is the EFFECTIVE one (store, env,
  // supervisor file and defaults folded together). Showing the raw store value
  // instead would render a fresh install's toggle as OFF while the documented
  // default keeps auto-resume ON.
  const autoResumeChecked = typeof supervisorStatus?.autoResumeEnabled === 'boolean'
    ? supervisorStatus.autoResumeEnabled === true
    : supervisorCfg.autoResumeEnabled === true

  // Nested tabs — unified pill bar with icons (maestro-design, matches dsh-maestro-jobs).
  // Blacklist has no pill of its own: it is an offline scan list, so it lives
  // as a section at the bottom of the Guard tab instead of beside it.
  const TABS: Array<{ id: string; label: string; icon: TabIcon }> = [
    { id: 'guard', label: 'Guard', icon: 'shield' },
    { id: 'supervisor', label: 'Supervisor', icon: 'cpu' },
  ]

  // Effective guard state: the stored document may still carry legacy v1 keys,
  // so the tab renders through the same precedence the runtime enforces.
  const guardView = effectiveGuardView(guard)
  const guardCustomCount = guardView.rules.filter((r) => r.source !== 'default').length

  const tabContents: Record<string, unknown> = {
    guard: h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        // Status summary — what the stored document amounts to, in one line.
        h(
          'div',
          { style: { ...cardInsetStyle, marginTop: '12px' } },
          h('div', { style: { fontSize: 13, fontWeight: 600, color: t.labelPrimary as string } }, 'Protection status'),
          h(
            'div',
            { 'data-maestro-guard-status': '', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' as const, marginTop: 4 } },
            h(
              'div',
              { style: { fontSize: 12, color: t.labelSecondary as string, lineHeight: '16px' } },
              `${guardCustomCount} of ${guardView.rules.length} rules customized · branches: ${guardView.protectedBranches.join(', ') || 'defaults'} · journal ${guardView.journal.enabled ? `on (${guardView.journal.retainDays}d / ${guardView.journal.retainFiles} files)` : 'off'}`,
            ),
            h(Button as any, { variant: 'outline', size: 'sm', onClick: resetGuardDefaults }, 'Reset to defaults'),
          ),
        ),
        // Per-rule tiers, grouped by boundary. The select writes one rule id;
        // 'Default' restores the built-in tier for that rule.
        ...(['Git', 'Publish', 'Filesystem', 'Network', 'Self-protection'] as const).map((group) =>
          h(
            'div',
            { key: group, style: { display: 'flex', flexDirection: 'column' } },
            h('div', { style: { fontSize: 13, fontWeight: 600, color: t.labelPrimary as string, padding: '12px 0 4px' } }, group),
            ...RULE_META.filter((meta) => meta.group === group).map((meta) => {
              const current = guardView.rules.find((r) => r.id === meta.id) ?? { ...meta, tier: meta.defaultTier, source: 'default' as const }
              const stateNote =
                current.source === 'stored' ? ' Currently customized.' : current.source === 'legacy' ? ' Currently from an older setting.' : ` Default: ${meta.defaultTier}.`
              return h(SettingRow as any, {
                title: meta.label,
                description: `${meta.hint}${stateNote}${meta.locked ? ' Locked: the guard never allows lowering this one.' : ''}`,
                control: h(
                  'select',
                  {
                    value: current.source === 'default' ? 'default' : current.tier,
                    disabled: meta.locked === true,
                    onChange: (e: any) => {
                      const next = e.target.value
                      void saveGuardRule(meta.id, next as GuardTier | 'default')
                    },
                    'aria-label': meta.label,
                    style: {
                      height: 36, padding: '0 12px', border: `1px solid ${t.borderL2}`, borderRadius: 18,
                      background: 'var(--dsw-alias-bg-module-platform, #F5F6F7)' as string, color: t.labelPrimary as string, font: 'inherit', fontSize: 13,
                    },
                  },
                  h('option', { value: 'default' }, `Default (${meta.defaultTier})`),
                  ...(meta.locked === true
                    ? [h('option', { value: 'deny' }, 'Deny')]
                    : [h('option', { value: 'allow' }, 'Allow — run silently'), h('option', { value: 'journal' }, 'Journal — run + record'), h('option', { value: 'ask' }, 'Ask — prompt first'), h('option', { value: 'deny' }, 'Deny — refuse')]),
                ),
              })
            }),
          ),
        ),
        // Lists + containment: live as soon as the next tool call runs.
        h('div', { style: { fontSize: 13, fontWeight: 600, color: t.labelPrimary as string, padding: '12px 0 4px' } }, 'Scope'),
        h('div', { style: { padding: '12px 0', borderBottom: `1px solid ${t.borderL2}`, display: 'flex', flexDirection: 'column', gap: 8 } },
          h('div', { style: rowTitleStyle }, 'Protected branches'),
          h('div', { style: rowDescStyle }, 'One branch per row. Empty restores the defaults (master, main). Each row commits on blur or Enter — never per keystroke.'),
          h(ListEditor as any, {
            values: guardView.protectedBranches, placeholder: 'main', ariaLabel: 'Protected branch',
            emptyHint: 'No branches listed — the defaults (master, main) apply.',
            onCommit: (list: string[]) => { void saveGuard({ protectedBranches: list }) },
          }),
        ),
        h('div', { style: { padding: '12px 0', borderBottom: `1px solid ${t.borderL2}`, display: 'flex', flexDirection: 'column', gap: 8 } },
          h('div', { style: rowTitleStyle }, 'Extra protected paths'),
          h('div', { style: rowDescStyle }, 'One path per row — paths may contain commas or spaces. These add to the built-in protected list — the defaults cannot be removed from here.'),
          h(ListEditor as any, {
            values: guardView.protectedPaths, placeholder: '~/.config/credentials.yaml', ariaLabel: 'Protected path',
            emptyHint: 'No extra paths — only the built-in list applies.',
            onCommit: (list: string[]) => { void saveGuard({ protectedPaths: list }) },
          }),
        ),
        h(ToggleRow as any, {
          title: 'Enforce working-directory containment',
          description: 'Keep file writes inside the session working directory (the OS temp dir stays exempt). Off turns the outside-writes rule off entirely.',
          checked: guardView.containment.enabled === true,
          onChange: (v: boolean) => { void saveGuard({ workingDirContainment: { ...guardView.containment, enabled: v } }) },
        }),
        h(ToggleRow as any, {
          title: 'Exempt runtime spill reads',
          description: 'Let agents read back their own oversized tool results from the OS temp dir — blocking those reads breaks the retrieval flow.',
          checked: guardView.containment.spillReads === true,
          onChange: (v: boolean) => { void saveGuard({ workingDirContainment: { ...guardView.containment, spillReads: v } }) },
        }),
        // Journal: boot-time knobs — the guard reads them once at startup.
        h('div', { style: { fontSize: 13, fontWeight: 600, color: t.labelPrimary as string, padding: '12px 0 4px' } }, 'Journal'),
        h('p', { style: { ...captionStyle, margin: '0 0 4px' } }, 'Journal settings apply after a host restart — the guard reads them once at boot, unlike the rules above.'),
        h(ToggleRow as any, {
          title: 'Keep a decision journal',
          description: 'Off stops all journal writes; the guard status tools go empty.',
          checked: guardView.journal.enabled === true,
          onChange: (v: boolean) => { void saveGuard({ journal: { ...guardView.journal, enabled: v } }) },
        }),
        h(ToggleRow as any, {
          title: 'Count silent allows',
          description: 'Fold allow decisions into one periodic aggregate line instead of dropping them.',
          checked: guardView.journal.allowCounters === true,
          onChange: (v: boolean) => { void saveGuard({ journal: { ...guardView.journal, allowCounters: v } }) },
        }),
        h(SettingRow as any, {
          title: 'Retain days',
          description: 'Keep journal archives newer than this many days.',
          control: h(CommitField as any, {
            value: String(guardView.journal.retainDays), placeholder: '30', width: 160, ariaLabel: 'Retain days',
            onCommit: (text: string) => {
              const n = Number(text)
              if (!Number.isInteger(n) || n <= 0) { setError('Retention must be a positive whole number.'); return }
              void saveGuard({ journal: { ...guardView.journal, retainDays: n } })
            },
          }),
        }),
        h(SettingRow as any, {
          title: 'Retain files',
          description: 'Keep at least this many newest archive files.',
          control: h(CommitField as any, {
            value: String(guardView.journal.retainFiles), placeholder: '14', width: 160, ariaLabel: 'Retain files',
            onCommit: (text: string) => {
              const n = Number(text)
              if (!Number.isInteger(n) || n <= 0) { setError('Retention must be a positive whole number.'); return }
              void saveGuard({ journal: { ...guardView.journal, retainFiles: n } })
            },
          }),
        }),
        // Merged from the former Blacklist pill: an offline scan list, not a
        // live gate — it belongs with the guard it is always confused with,
        // labelled for what it actually is.
        h('div', { style: { fontSize: 13, fontWeight: 600, color: t.labelPrimary as string, padding: '12px 0 4px' } }, 'Publish scan list (offline)'),
        h('div', { style: { ...rowStyle, flexDirection: 'column', alignItems: 'stretch', gap: 8, borderBottom: 'none' } as any },
          h('div', { style: rowTitleStyle }, 'Blacklist patterns'),
          h('div', { style: rowDescStyle }, 'One pattern per row. These do NOT gate any live tool call — the guard runtime never reads this list. It only feeds the offline scan a human runs by hand: node scripts/check-public-blacklist.mjs. Matching files are reported there, not blocked at runtime.'),
          h(ListEditor as any, {
            values: patterns, placeholder: 'example-project', ariaLabel: 'Blacklist pattern',
            emptyHint: 'No patterns — the offline scan reports nothing.',
            onCommit: (list: string[]) => { void commitBlacklistPatterns(list) },
          }),
        ),
      ),
    supervisor: h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h('div', { style: { padding: '12px 0', borderBottom: `1px solid ${t.borderL2}` } }, h('p', { style: captionStyle }, 'Check interval and Down threshold belong to the standalone dsh-web-supervisor daemon (systemd). They have no effect on the in-tree auto-resume plugin below unless that daemon is installed and running.')),
        h(SettingRow as any, { title: 'Check interval', description: 'Milliseconds between supervisor checks. Default 5000.', control: h(FieldInput as any, { type: 'number', value: supervisorCfg.intervalMs ?? '', placeholder: '5000', onChange: (e: any) => { const v = e.target.value === '' ? undefined : Number(e.target.value); saveSupervisorCfg({ intervalMs: v }) }, style: { width: 160 } as any }) }),
        h(SettingRow as any, { title: 'Down threshold', description: 'Consecutive failures before marking a session as down.', control: h(FieldInput as any, { type: 'number', value: supervisorCfg.downThreshold ?? '', placeholder: '3', onChange: (e: any) => { const v = e.target.value === '' ? undefined : Number(e.target.value); saveSupervisorCfg({ downThreshold: v }) }, style: { width: 160 } as any }) }),
        h(ToggleRow as any, {
          title: 'Auto-resume sessions',
          description: autoResumePinned
            ? 'Locked: this install pins auto-resume through its Cordis plugin config, which outranks this store. Change it where the supervisor row is mounted, not here.'
            : 'Automatically resume sessions interrupted by a DSH restart within the resume window. Shown as the supervisor reports it — plugin config, environment, and defaults folded together.',
          // Effective value from the plugin, not the (possibly shadowed) store.
          checked: autoResumeChecked,
          onChange: (v: boolean) => saveSupervisorCfg({ autoResumeEnabled: v }),
          disabled: autoResumePinned,
        }),
      ),
  }

  return h(
    'div',
    { 'data-maestro-settings-card': '', style: { display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 640, minWidth:0, boxSizing:'border-box' as any } },
    h(
      'div',
      { style: { padding: '2px 2px 8px', display: 'flex', gap: 10, alignItems: 'flex-start' } },
      // Shared BrandBadge — components/BrandMark.tsx, the workspace reference implementation
      h(BrandBadge as any, { style: { alignSelf: 'flex-start', marginTop: 2 } }),
      h('div', { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } },
        h('div', { style: { fontSize: 15, fontWeight: 600, color: t.labelPrimary as string, lineHeight: '22px' } }, 'Maestro'),
        h('div', { style: { fontSize: 12, color: t.labelSecondary as string, lineHeight: '16px', marginTop: 2 } }, 'Guard and supervisor settings, via the shared Maestro store. Uses the same tokens and primitives as DSH settings.'),
      )
    ),
    h('style', {}, '[data-maestro-logo]{background:#0A84FF !important; background-color:#0A84FF !important; color:#fff !important;}'),
    h('div', { 'data-maestro-tabs': '', role:'tablist', 'aria-label':'Maestro settings sections' },
      ...TABS.map(tab => h('button', { key: tab.id, 'data-maestro-tab':'', 'data-active': String(activeTab===tab.id), role:'tab', 'aria-selected': activeTab===tab.id, onClick: (e: any) => { setActiveTab(tab.id); try { e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }) } catch {} } }, h(TabIcon as any, { name: tab.icon }), tab.label))
    ),
    h('div', { 'data-maestro-panel': activeTab, style: { display:'flex', flexDirection:'column', gap:10, minWidth:0 } }, tabContents[activeTab] as any),
    error ? h('p', { style: { color: t.stateError as string, fontSize: 12, margin: '8px 0 0', padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent)', border: `1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent)` } }, error) : null,
  )
}
