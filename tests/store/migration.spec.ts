import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { load, resetForTests } from '../src/index.ts'

let home: string
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), 'cfgmig-')); resetForTests() })
afterEach(async () => { await rm(home, { recursive: true, force: true }) })

const LEGACY_DIR = () => join(home, 'dsh-maestro-review')
const LEGACY = () => join(LEGACY_DIR(), 'config.json')
const STORE = () => join(home, 'maestro', 'settings.json')

const LEGACY_15 = {
  gitlabBaseUrl: 'https://gitlab.example.com',
  gitlabToken: 'glpat-SECRET',
  botUsername: 'maestro-bot',
  webhookSecret: 'wh-SECRET',
  projectMappings: { 'group/proj': 'session-x' },
  autoRereviewOnPush: true,
  reviewModel: 'deepseek-chat',
  tunnelHostname: 'tunnel.example.com',
  tunnelCredentialsFile: '/home/k/.cloudflared/cert.json',
  tunnelId: 'cf-123',
  tunnelMode: 'quick',
  lastTunnelRunning: true,
  telegramBotToken: 'tg-SECRET',
  telegramChatId: '42',
  telegramReviewNotifications: false,
}

async function seedLegacy(doc: unknown): Promise<void> {
  await mkdir(LEGACY_DIR(), { recursive: true })
  await writeFile(LEGACY(), JSON.stringify(doc), 'utf8')
}

describe('legacy migration', () => {
  it('maps the 15 legacy keys to namespaced domains on first load', async () => {
    await seedLegacy(LEGACY_15)
    const doc = await load({ dshHome: home })
    expect(doc.domains.gitlab).toEqual({
      baseUrl: 'https://gitlab.example.com', token: 'glpat-SECRET', botUsername: 'maestro-bot',
      webhookSecret: 'wh-SECRET', projectMappings: { 'group/proj': 'session-x' }, autoRereviewOnPush: true,
    })
    expect(doc.domains.review).toEqual({ model: 'deepseek-chat' })
    expect(doc.domains.tunnel).toEqual({
      hostname: 'tunnel.example.com', credentialsFile: '/home/k/.cloudflared/cert.json',
      id: 'cf-123', mode: 'quick',
    })
    expect((doc.domains.notifier as any).telegram).toEqual({ botToken: 'tg-SECRET', chatId: '42' })
    expect((doc.domains.notifier as any).policy).toEqual({ reviewNotifications: false })
    expect(doc.domains.notify).toBeUndefined()
    // lastTunnelRunning is runtime state — dropped per spec
    expect(JSON.stringify(doc)).not.toContain('lastTunnelRunning')
  })

  it('keeps the legacy file in place and snapshots a .bak copy (owners may still read it)', async () => {
    await seedLegacy(LEGACY_15)
    await load({ dshHome: home })
    // The legacy OWNER plugin may not have adopted the lib yet — the original
    // file must stay exactly where it is, byte-identical.
    const orig = JSON.parse(await readFile(LEGACY(), 'utf8'))
    expect(orig.gitlabToken).toBe('glpat-SECRET')
    const bak = JSON.parse(await readFile(LEGACY() + '.maestro-migrated.bak', 'utf8'))
    expect(bak).toEqual(orig)
  })

  it('new store file is created with mode 600', async () => {
    await seedLegacy(LEGACY_15)
    await load({ dshHome: home })
    const { stat } = await import('node:fs/promises')
    const st = await stat(STORE())
    expect(st.mode & 0o777).toBe(0o600)
  })

  it('skips migration when the new store already exists', async () => {
    await mkdir(join(home, 'maestro'), { recursive: true })
    await writeFile(STORE(), JSON.stringify({ version: 1, domains: { mine: { a: 1 } } }), { mode: 0o600 })
    await seedLegacy(LEGACY_15)
    const doc = await load({ dshHome: home })
    expect(doc.domains.mine).toEqual({ a: 1 })
    expect(doc.domains.gitlab).toBeUndefined()
    await expect(access(LEGACY())).resolves.toBeUndefined() // untouched
  })

  it('never crashes on corrupt legacy JSON — leaves everything untouched', async () => {
    await mkdir(LEGACY_DIR(), { recursive: true })
    await writeFile(LEGACY(), '{not-json', 'utf8')
    const doc = await load({ dshHome: home })
    expect(doc.domains).toEqual({})
    await expect(access(LEGACY())).resolves.toBeUndefined()
    await expect(access(STORE())).rejects.toThrow()
  })

  it('unknown legacy keys land in the _legacy bucket', async () => {
    await seedLegacy({ ...LEGACY_15, someFutureKey: 'x' })
    const doc = await load({ dshHome: home })
    expect(doc.domains._legacy).toEqual({ someFutureKey: 'x' })
  })

  it('merges multiple legacy sources when present (review, as last source, wins conflicts)', async () => {
    const remoteDir = join(home, 'dsh-maestro-remote')
    await mkdir(remoteDir, { recursive: true })
    await writeFile(join(remoteDir, 'config.json'),
      JSON.stringify({ tunnelHostname: 'remote-wins.example.com' }), 'utf8')
    await seedLegacy(LEGACY_15) // dsh-maestro-review/config.json — last in LEGACY_SOURCES
    const doc = await load({ dshHome: home })
    expect((doc.domains.tunnel as any).hostname).toBe('tunnel.example.com')
  })
})

describe('cache invalidation after late migration', () => {
  it('a memoized empty load does not hide domains written by a later migration', async () => {
    // First load: nothing exists anywhere -> empty doc gets memoized.
    const first = await load({ dshHome: home })
    expect(first.domains).toEqual({})
    // Legacy appears afterwards (e.g. another tool wrote it), next load must see it.
    await seedLegacy({ reviewModel: 'late-model', tunnelMode: 'quick' })
    const second = await load({ dshHome: home })
    expect((second.domains.review as any)?.model).toBe('late-model')
    expect((second.domains.tunnel as any)?.mode).toBe('quick')
  })
})

describe('notify -> notifier domain migration', () => {
  async function seedStore(doc: unknown): Promise<void> {
    await mkdir(join(home, 'maestro'), { recursive: true })
    await writeFile(STORE(), JSON.stringify(doc), { mode: 0o600 })
  }

  it('copies notify telegram+policy into notifier, snapshots, and removes notify', async () => {
    const before = {
      version: 1,
      domains: {
        notify: { telegram: { botToken: 'tg-SECRET', chatId: '42' }, policy: { reviewNotifications: true }, strayKey: 'x' },
        tunnel: { mode: 'quick' },
      },
    }
    await seedStore(before)
    const doc = await load({ dshHome: home })
    expect(doc.domains.notifier).toEqual({ telegram: { botToken: 'tg-SECRET', chatId: '42' }, policy: { reviewNotifications: true } })
    expect(doc.domains.notify).toBeUndefined()
    expect(doc.domains.tunnel).toEqual({ mode: 'quick' })
    const bak = JSON.parse(await readFile(STORE() + '.maestro-notify-migrated.bak', 'utf8'))
    expect(bak).toEqual(before)
  })

  it('skips when notifier already has a full telegram pair (newer config wins)', async () => {
    await seedStore({
      version: 1,
      domains: {
        notify: { telegram: { botToken: 'old', chatId: '1' } },
        notifier: { telegram: { botToken: 'new', chatId: '2' } },
      },
    })
    const doc = await load({ dshHome: home })
    expect((doc.domains.notifier as any).telegram).toEqual({ botToken: 'new', chatId: '2' })
    expect(doc.domains.notify).toBeDefined()
    await expect(access(STORE() + '.maestro-notify-migrated.bak')).rejects.toThrow()
  })

  it('leaves the store untouched when notify has no telegram object', async () => {
    const before = { version: 1, domains: { notify: { strayKey: 'x' } } }
    await seedStore(before)
    const doc = await load({ dshHome: home })
    expect(doc.domains).toEqual(before.domains)
    await expect(access(STORE() + '.maestro-notify-migrated.bak')).rejects.toThrow()
  })

  it('runs at most once', async () => {
    await seedStore({ version: 1, domains: { notify: { telegram: { botToken: 't', chatId: 'c' } } } })
    await load({ dshHome: home })
    await load({ dshHome: home })
    const doc = await load({ dshHome: home })
    expect(doc.domains.notify).toBeUndefined()
    expect((doc.domains.notifier as any).telegram).toEqual({ botToken: 't', chatId: 'c' })
  })
})
