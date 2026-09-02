import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DOMAIN_KEY_MAP, RUNTIME_KEYS,
  splitLegacyPatch, writeLegacyPatch, readFlat, resetForTests,
} from '../src/index.ts'

let home: string
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'cfgadap-')); resetForTests() })
afterEach(async () => { await rm(home, { recursive: true, force: true }) })

describe('single-source key map', () => {
  it('covers the full MaestroUserConfig surface minus runtime keys', () => {
    for (const k of [
      'gitlabBaseUrl', 'gitlabToken', 'botUsername', 'webhookSecret', 'webhookPort',
      'projectMappings', 'autoRereviewOnPush', 'reviewModel', 'agentTimeoutMs',
      'reviewSessionRetentionDays', 'tunnelMode', 'quickTarget', 'tunnelId',
      'tunnelCredentialsFile', 'tunnelHostname', 'proxyPort', 'proxyHost',
      'lanPinEnabled', 'lanPort', 'lanHost', 'telegramBotToken', 'telegramChatId',
      'telegramReviewNotifications',
    ]) expect(DOMAIN_KEY_MAP[k], k).toBeTruthy()
    expect(RUNTIME_KEYS).toEqual(['lastTunnelRunning'])
    expect(DOMAIN_KEY_MAP.lastTunnelRunning).toBeUndefined()
  })
})

describe('splitLegacyPatch / writeLegacyPatch / readFlat round-trip', () => {
  it('routes each key to its owning domain and reads back flat', async () => {
    await writeLegacyPatch({
      gitlabBaseUrl: 'https://g',
      gitlabToken: 'tok',
      reviewModel: { provider: 'openai', model: 'gpt-x' },
      tunnelHostname: 'h.example.com',
      lanPort: 3080,
      lanHost: '0.0.0.0',
      telegramChatId: '42',
      webhookPort: 3000,
    }, { dshHome: home })
    const flat = await readFlat({ dshHome: home })
    expect(flat.gitlabBaseUrl).toBe('https://g')
    expect(flat.gitlabToken).toBe('tok')
    expect(flat.reviewModel).toEqual({ provider: 'openai', model: 'gpt-x' })
    expect(flat.tunnelHostname).toBe('h.example.com')
    expect(flat.lanPort).toBe(3080)
    expect(flat.lanHost).toBe('0.0.0.0')
    expect(flat.telegramChatId).toBe('42')
    expect(flat.webhookPort).toBe(3000)
  })

  it('splitLegacyPatch groups by domain without writing', () => {
    const groups = splitLegacyPatch({ gitlabToken: 'a', tunnelMode: 'named' })
    expect(groups).toContainEqual({ domain: 'gitlab', patch: { token: 'a' } })
    expect(groups).toContainEqual({ domain: 'tunnel', patch: { mode: 'named' } })
  })

  it('ignores runtime keys entirely (adapters own them)', async () => {
    await writeLegacyPatch({ lastTunnelRunning: true } as Record<string, unknown>, { dshHome: home })
    expect(await readFlat({ dshHome: home })).toEqual({})
  })
})
