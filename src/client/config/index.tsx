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

/**
 * The nav row keeps the shell's default gear. DSH 0.2.x paints a section row
 * through the settings.section.icon slot: the glyph sits inside a wrapping
 * span, so the 0.1.x marker + `::before` mask this plugin used to carry hid
 * nothing and painted a second glyph beside the gear. A custom row icon is a
 * slot registration, not a DOM rewrite, and no Maestro section asks for one.
 */

type SlotsApi = {
  inject(name: string, factory: () => unknown): void
  register(
    options: Record<string, unknown>,
    render: (props: { configRpcCall: RpcCall; supervisorRpcCall: RpcCall }) => unknown,
  ): unknown
}
type RpcCall = (endpoint: string, payload?: unknown, signal?: AbortSignal) => Promise<unknown>

interface ClientCtx {
  get?(name: string): unknown
}

export const inject = ['slots', 'connection'] as const

export function apply(ctx: ClientCtx): void {
  const slots = ctx.get?.('slots') as SlotsApi | undefined
  if (slots === undefined) return

  // Generic config RPC: guard, blacklist and supervisor documents
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

  slots.inject('settings.section', () =>
    slots.register(
      { name: 'settings.section', id: 'maestro', order: MAESTRO_SETTINGS_ORDER, label: () => 'Maestro', inject: () => ({ configRpcCall, supervisorRpcCall }) },
      MaestroSettingsTab as unknown as (props: { configRpcCall: RpcCall; supervisorRpcCall: RpcCall }) => unknown,
    ),
  )
}
