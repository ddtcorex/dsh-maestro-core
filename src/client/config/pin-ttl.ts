/**
 * PIN login-cookie lifetimes offered by the Settings card.
 * `0` = session cookie (expires when the browser closes); an absent setting
 * means the dsh-maestro-remote default of 24 hours.
 */
export const PIN_TTL_PRESETS: ReadonlyArray<{ hours: number; label: string }> = [
  { hours: 0, label: 'Session only' },
  { hours: 1, label: '1 hour' },
  { hours: 8, label: '8 hours' },
  { hours: 24, label: '1 day (default)' },
  { hours: 168, label: '7 days' },
  { hours: 720, label: '30 days' },
]

/** Mirrors DEFAULT_PIN_SESSION_TTL_HOURS in dsh-maestro-remote. */
export const DEFAULT_PIN_TTL_HOURS = 24
/**
 * Mirrors MAX_PIN_SESSION_TTL_HOURS in dsh-maestro-remote. This bound only
 * hints the custom input — the host resolver and the settings RPC enforce it.
 */
export const MAX_PIN_TTL_HOURS = 8760

/**
 * The preset hours to show as selected, or `null` when the stored value is not
 * a preset (the caller then shows the "Custom…" option). An unset or unusable
 * value falls back to the product default.
 */
export function presetForTtlHours(hours: number | undefined): number | null {
  const value = hours === undefined || !Number.isFinite(hours) ? DEFAULT_PIN_TTL_HOURS : hours
  return PIN_TTL_PRESETS.some((preset) => preset.hours === value) ? value : null
}
