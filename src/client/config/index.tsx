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

/* maestro: replace the settings-nav fallback gear with the Maestro M-logo glyph */
[${SETTINGS_NAV_MARKER}] > svg:first-child {
  display: none;
}

[${SETTINGS_NAV_MARKER}]::before {
  content: '';
  flex: none;
  width: 16px;
  height: 16px;
  background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 11 L5 4 L8 9 L11 4 L14 11'/%3E%3C/svg%3E") center / contain no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M2 11 L5 4 L8 9 L11 4 L14 11'/%3E%3C/svg%3E") center / contain no-repeat;
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

  // Reversible effects: nav-row marker observer + owned style tag.
  ctx.effect(() => registerSettingsNavIcon(() => 'Maestro'), 'maestro: settings nav icon')
  ctx.effect(installNavIconStyle, 'maestro: settings nav css')

  slots.inject('settings.section', () =>
    slots.register(
      { name: 'settings.section', id: 'maestro', order: 25, label: () => 'Maestro', inject: () => ({ rpcCall, configRpcCall }) },
      MaestroSettingsTab as unknown as (props: { rpcCall: RpcCall }) => unknown,
    ),
  )
}
