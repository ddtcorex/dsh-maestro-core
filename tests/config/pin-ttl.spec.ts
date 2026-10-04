import { describe, it, expect } from 'vitest'
import {
  PIN_TTL_PRESETS,
  DEFAULT_PIN_TTL_HOURS,
  MAX_PIN_TTL_HOURS,
  presetForTtlHours,
} from '../src/client/pin-ttl.ts'

describe('PIN TTL presets', () => {
  it('offers the agreed options in ascending order', () => {
    expect(PIN_TTL_PRESETS.map((p) => p.hours)).toEqual([0, 1, 8, 24, 168, 720])
    expect(PIN_TTL_PRESETS[0]?.label).toBe('Session only')
    expect(PIN_TTL_PRESETS[3]?.label).toBe('1 day (default)')
  })

  it('keeps the product default inside the table and every preset inside the bound', () => {
    expect(DEFAULT_PIN_TTL_HOURS).toBe(24)
    expect(MAX_PIN_TTL_HOURS).toBe(8760)
    expect(PIN_TTL_PRESETS.some((p) => p.hours === DEFAULT_PIN_TTL_HOURS)).toBe(true)
    for (const preset of PIN_TTL_PRESETS) expect(preset.hours).toBeLessThanOrEqual(MAX_PIN_TTL_HOURS)
  })

  it('selects the stored preset, or null to mean Custom…', () => {
    expect(presetForTtlHours(undefined)).toBe(24) // unset config shows the default
    expect(presetForTtlHours(0)).toBe(0)
    expect(presetForTtlHours(168)).toBe(168)
    expect(presetForTtlHours(12)).toBeNull()
    expect(presetForTtlHours(Number.NaN)).toBe(24)
    expect(presetForTtlHours(8760)).toBeNull()
  })
})
