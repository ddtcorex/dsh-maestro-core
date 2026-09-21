/**
 * Settings nav order for every Maestro section.
 *
 * The shell sorts `settings.section` rows by `order` alone, so two registrants
 * sharing a number have no defined relative order. Upstream's
 * `archived-sessions` page occupies 25, which is exactly where this plugin used
 * to register: the Maestro tabs and Archived sessions swapped places between
 * loads. The Maestro block therefore starts at 26, and the sibling tabs in
 * dsh-maestro-jobs / -sync / -gateway continue from here — keep them ahead of
 * later upstream sections and never reuse 25.
 */
export const MAESTRO_SETTINGS_ORDER = 26

// DSH-native redesign — reuses DSH tokens & primitive geometry maximally (see MaestroSettings.tsx).
import { MaestroSettingsTab } from './MaestroSettings.js'
import { MAESTRO_RPC_CHANNEL } from './api.js'
import { registerSettingsNavIcon, SETTINGS_NAV_MARKER } from './settings-nav-icon.js'

/**
 * DSH 0.1.x gives external settings sections a generic gear and exposes no
 * icon field in the settings.section contract (mirrors dsh-better-sidebar):
 * the marker only claims this plugin's localized row and this CSS paints the
 * Maestro M-logo glyph as a currentColor mask so it follows native nav
 * hover/active colors at the shell's 16px icon rhythm. The path matches the
 * sidebar MaestroTrigger (trigger.tsx#MaestroLogo) — M2 11 L5 4 L8 9 L11 4 L14 11.
 */
const SETTINGS_NAV_CSS = `

/* maestro: replace the settings-nav fallback gear with the Maestro M-logo glyph — same mark as sidebar/popup BrandMark */
[${SETTINGS_NAV_MARKER}] > svg:first-child,
[${SETTINGS_NAV_MARKER}] > svg.zWKi1a_navIcon {
  display: none !important;
}

[${SETTINGS_NAV_MARKER}]::before {
  content: '';
  flex: none;
  width: 16px;
  height: 16px;
  display: inline-block;
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 11 L5 4 L8 9 L11 4 L14 11'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 11 L5 4 L8 9 L11 4 L14 11'/%3E%3C/svg%3E") center / contain no-repeat;
}
`

type SlotsApi = {
  inject(name: string, factory: () => unknown): void
  register(
    options: Record<string, unknown>,
    render: (props: { rpcCall: RpcCall }) => unknown,
  ): unknown
}
type RpcCall = (endpoint: string, payload?: unknown, signal?: AbortSignal) => Promise<unknown>

interface ClientCtx {
  get?(name: string): unknown
  effect(fn: () => () => void, label?: string): unknown
}

export const inject = ['slots', 'connection'] as const

function installNavIconStyle(): () => void {
  const tag = document.createElement('style')
  tag.dataset.plugin = '@ddtcorex/dsh-maestro-config'
  tag.dataset.pluginCss = 'maestro/settings-nav.css'
  tag.textContent = SETTINGS_NAV_CSS
  document.head.appendChild(tag)
  return () => {
    document.querySelector('style[data-plugin-css="maestro/settings-nav.css"]')?.remove()
  }
}

export function apply(ctx: ClientCtx): void {
  const slots = ctx.get?.('slots') as SlotsApi | undefined
  if (slots === undefined) return

  // The card speaks the granular dsh-maestro-review settings-rpc surface.
  const rpcCall: RpcCall = (endpoint, payload, signal) => {
    const connection = ctx.get?.('connection') as
      | { rpc: { call(ch: string, ep: string, p?: unknown, s?: AbortSignal): Promise<unknown> } }
      | undefined
    if (!connection?.rpc?.call) return Promise.reject(new Error('RPC not available'))
    return connection.rpc.call(MAESTRO_RPC_CHANNEL, endpoint, payload, signal)
  }
  // Generic config RPC for supervisor (independent of review — works when review not installed)
  const configRpcCall: RpcCall = (endpoint, payload, signal) => {
    const connection = ctx.get?.('connection') as
      | { rpc: { call(ch: string, ep: string, p?: unknown, s?: AbortSignal): Promise<unknown> } }
      | undefined
    if (!connection?.rpc?.call) return Promise.reject(new Error('RPC not available'))
    return connection.rpc.call('/dsh-maestro-config', endpoint, payload, signal)
  }
  // Supervisor's own loopback channel — used only to read the EFFECTIVE
  // auto-resume state (`status`), so the toggle can render locked when an
  // install-supplied Cordis config pins the value. Absent plugin → absent
  // service → the caller falls back to the unlocked toggle.
  const supervisorRpcCall: RpcCall = (endpoint, payload, signal) => {
    const connection = ctx.get?.('connection') as
      | { rpc: { call(ch: string, ep: string, p?: unknown, s?: AbortSignal): Promise<unknown> } }
      | undefined
    if (!connection?.rpc?.call) return Promise.reject(new Error('RPC not available'))
    return connection.rpc.call('/dsh-maestro-supervisor-resume', endpoint, payload, signal)
  }

  // Reversible effects: nav-row marker observer + owned style tag.
  ctx.effect(() => registerSettingsNavIcon(() => 'Maestro'), 'maestro: settings nav icon')
  ctx.effect(installNavIconStyle, 'maestro: settings nav css')

  slots.inject('settings.section', () =>
    slots.register(
      { name: 'settings.section', id: 'maestro', order: MAESTRO_SETTINGS_ORDER, label: () => 'Maestro', inject: () => ({ rpcCall, configRpcCall, supervisorRpcCall }) },
      MaestroSettingsTab as unknown as (props: { rpcCall: RpcCall }) => unknown,
    ),
  )
}
