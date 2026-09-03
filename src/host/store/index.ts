import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { mkdir, open, readFile, rename, unlink, stat, rm, writeFile } from 'node:fs/promises'

export interface SettingsDoc {
  version: 1
  domains: Record<string, unknown>
}

/** Minimal structural validator a domain owner supplies (schemastery/zod adapters fit). */
export interface DomainValidator {
  parse(value: unknown): { ok: true; value?: unknown } | { ok: false; error: string }
}

const EMPTY_DOC: SettingsDoc = { version: 1, domains: {} }

const domainValidators = new Map<string, DomainValidator>()
const changeCbs = new Set<(domain: string) => void>()

let cached: { key: string; doc: SettingsDoc } | null = null

function resolveDshHome(explicit?: string): string {
  return explicit ?? process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

function storePath(opts?: { dshHome?: string }): string {
  return join(resolveDshHome(opts?.dshHome), 'maestro', 'settings.json')
}

/** Register a validator for a domain you own. Writes to it are validated on every set(). */
export function defineDomain(name: string, validator: DomainValidator): void {
  domainValidators.set(name, validator)
}

/** Fire callbacks registered through this instance after a successful set(). */
export function onChange(cb: (domain: string) => void): () => void {
  changeCbs.add(cb)
  return () => {
    changeCbs.delete(cb)
  }
}

/** Test seam: drop the memoized document and listeners (schemas are kept). */
export function resetForTests(): void {
  cached = null
  changeCbs.clear()
}

// ---------------------------------------------------------------------------
// locking + io
// ---------------------------------------------------------------------------

async function withLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(path), { recursive: true }) // the store dir may not exist on first write
  const lockPath = `${path}.lock`
  const deadline = Date.now() + 5_000
  let handle: Awaited<ReturnType<typeof open>> | null = null
  for (;;) {
    try {
      handle = await open(lockPath, 'wx')
      break
    } catch (err: any) {
      if (err?.code !== 'EEXIST') throw err
      // Break stale locks left behind by a crashed writer.
      try {
        const st = await stat(lockPath)
        if (Date.now() - st.mtimeMs > 5_000) {
          await rm(lockPath, { force: true })
          continue
        }
      } catch {
        /* lock vanished between stat and now — just retry */
      }
      if (Date.now() > deadline) throw new Error(`config-lib: lock timeout at ${lockPath}`)
      await new Promise((r) => setTimeout(r, 20))
    }
  }
  try {
    return await fn()
  } finally {
    await unlink(lockPath).catch(() => {})
    void handle // closed fd via unlink; keep handle referenced for GC clarity
  }
}

function parseDoc(raw: string): SettingsDoc {
  const parsed = JSON.parse(raw) as Partial<SettingsDoc>
  if (typeof parsed !== 'object' || parsed === null || typeof parsed.version !== 'number') {
    throw new Error('config-lib: malformed settings document')
  }
  return { version: 1, domains: (parsed.domains as Record<string, unknown>) ?? {} }
}

async function readDoc(path: string): Promise<SettingsDoc> {
  let raw: string
  try {
    raw = await readFile(path, 'utf8')
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { ...EMPTY_DOC, domains: {} }
    throw err
  }
  return parseDoc(raw)
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (
    base !== null && typeof base === 'object' && !Array.isArray(base) &&
    patch !== null && typeof patch === 'object' && !Array.isArray(patch)
  ) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
      out[k] = k in out ? deepMerge(out[k], v) : v
    }
    return out
  }
  return patch
}

async function writeDocLocked(path: string, doc: SettingsDoc): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.tmp-${Math.random().toString(16).slice(2, 10)}`
  await writeFile(tmp, JSON.stringify(doc, null, 2) + '\n', { mode: 0o600 })
  await rename(tmp, path) // atomic on the same filesystem; rename carries the 600 mode
}

// ---------------------------------------------------------------------------
// legacy migration (one-shot, non-destructive)
// ---------------------------------------------------------------------------

const LEGACY_SOURCES = [
  'dsh-maestro-remote/config.json',
  'dsh-maestro-review/config.json',
]

export const DOMAIN_KEY_MAP: Record<string, string> = {
  gitlabBaseUrl: 'gitlab.baseUrl',
  gitlabToken: 'gitlab.token',
  botUsername: 'gitlab.botUsername',
  webhookSecret: 'gitlab.webhookSecret',
  webhookPort: 'gitlab.webhookPort',
  projectMappings: 'gitlab.projectMappings',
  autoRereviewOnPush: 'gitlab.autoRereviewOnPush',
  reviewModel: 'review.model',
  agentTimeoutMs: 'review.agentTimeoutMs',
  reviewSessionRetentionDays: 'review.sessionRetentionDays',
  tunnelHostname: 'tunnel.hostname',
  tunnelCredentialsFile: 'tunnel.credentialsFile',
  tunnelId: 'tunnel.id',
  tunnelMode: 'tunnel.mode',
  quickTarget: 'tunnel.quickTarget',
  proxyPort: 'tunnel.proxyPort',
  proxyHost: 'tunnel.proxyHost',
  lanPinEnabled: 'tunnel.lanPinEnabled',
  lanPort: 'tunnel.lanPort',
  lanHost: 'tunnel.lanHost',
  telegramBotToken: 'notifier.telegram.botToken',
  telegramChatId: 'notifier.telegram.chatId',
  telegramReviewNotifications: 'notifier.policy.reviewNotifications',
}

/** Machine runtime state — never settings; owning adapters persist these in their own sidecar. */
export const RUNTIME_KEYS: readonly string[] = ['lastTunnelRunning']

/** Runtime state, not settings — deliberately dropped during migration. */
const DROPPED_LEGACY_KEYS = new Set(['lastTunnelRunning'])

function setIn(obj: Record<string, unknown>, dotted: string, value: unknown): void {
  const parts = dotted.split('.')
  let cur = obj
  for (const part of parts.slice(0, -1)) {
    if (typeof cur[part] !== 'object' || cur[part] === null) cur[part] = {}
    cur = cur[part] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = value
}

/**
 * If the new store does not exist yet and any legacy per-package config.json is
 * present, transform them into one namespaced store (later sources override
 * earlier ones), rename every CONSUMED source to `.bak`, and report true.
 * Corrupt sources are skipped untouched; the function never deletes anything.
 */
async function migrateLegacyIfPresent(storeP: string, dshHome: string): Promise<boolean> {
  try {
    await stat(storeP)
    return false // modern store already exists — never migrate over it
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err
  }
  const domains: Record<string, unknown> = {}
  const legacyBucket: Record<string, unknown> = {}
  const consumed: string[] = []
  for (const rel of LEGACY_SOURCES) {
    const src = join(resolveDshHome(dshHome), rel)
    let raw: string
    let parsed: Record<string, unknown>
    try {
      raw = await readFile(src, 'utf8')
      parsed = JSON.parse(raw) as Record<string, unknown>
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object')
    } catch (err: any) {
      if (err?.code === 'ENOENT') continue
      continue // corrupt or wrong shape — leave it alone, never destructive
    }
    for (const [k, v] of Object.entries(parsed)) {
      if (DROPPED_LEGACY_KEYS.has(k)) continue
      const target = DOMAIN_KEY_MAP[k]
      if (target) setIn(domains, target, v)
      else legacyBucket[k] = v
    }
    consumed.push(src)
  }
  if (consumed.length === 0) return false
  if (Object.keys(legacyBucket).length > 0) domains._legacy = legacyBucket
  await writeDocLocked(storeP, { version: 1, domains })
  // Snapshot, do NOT rename: the legacy file's owner plugin may not have
  // adopted this lib yet and still reads the original path (a premature
  // rename silently broke tunnel auto-restore in production on 2026-08-26).
  for (const src of consumed) {
    const snapshot = await readFile(src, 'utf8')
    await writeFile(`${src}.maestro-migrated.bak`, snapshot, { mode: 0o600 }).catch(() => {})
  }
  return true
}

function hasFullTelegramPair(domain: unknown): boolean {
  if (typeof domain !== 'object' || domain === null) return false
  const telegram = (domain as Record<string, unknown>).telegram
  if (typeof telegram !== 'object' || telegram === null) return false
  const t = telegram as Record<string, unknown>
  return typeof t.botToken === 'string' && t.botToken !== '' &&
         typeof t.chatId === 'string' && t.chatId !== ''
}

/**
 * One-shot non-destructive in-store migration: copy `notify.telegram` /
 * `notify.policy` into the `notifier` domain, snapshot the pre-migration file
 * to *.maestro-notify-migrated.bak, then drop `notify`. Runs at most once
 * (`notify` no longer exists afterwards); skips when `notifier` already holds
 * a full telegram pair; never touches the file when there is nothing to copy.
 * Lock-free probe + check-under-lock write so load() stays lock-free in the
 * common case (change callbacks may call load() inside a set()'s lock).
 */
async function migrateNotifyIntoNotifier(path: string): Promise<SettingsDoc> {
  let doc: SettingsDoc
  try {
    doc = await readDoc(path)
  } catch (err: any) {
    if (err?.code === 'ENOENT') return { ...EMPTY_DOC, domains: {} }
    throw err
  }
  if (doc.domains.notify === undefined || hasFullTelegramPair(doc.domains.notifier)) return doc
  return withLock(path, async () => {
    const fresh = await readDoc(path)
    if (fresh.domains.notify === undefined || hasFullTelegramPair(fresh.domains.notifier)) return fresh
    const n = fresh.domains.notify as Record<string, unknown>
    const telegram = n.telegram
    if (typeof telegram !== 'object' || telegram === null) return fresh
    await writeFile(`${path}.maestro-notify-migrated.bak`, JSON.stringify(fresh, null, 2) + '\n', { mode: 0o600 })
    const next: SettingsDoc = { version: 1, domains: { ...fresh.domains } }
    const copy: Record<string, unknown> = { telegram: { ...(telegram as Record<string, unknown>) } }
    if (n.policy && typeof n.policy === 'object') copy.policy = { ...(n.policy as Record<string, unknown>) }
    next.domains.notifier = deepMerge(fresh.domains.notifier ?? {}, copy)
    delete next.domains.notify
    await writeDocLocked(path, next)
    return next
  })
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

export async function load(opts?: { dshHome?: string }): Promise<SettingsDoc> {
  const path = storePath(opts)
  const homeKey = resolveDshHome(opts?.dshHome)
  const migrated = await migrateLegacyIfPresent(path, homeKey)
  if (migrated) cached = null // the store file changed on disk — drop any memoized doc
  if (cached && cached.key === homeKey) return cached.doc
  const doc = await migrateNotifyIntoNotifier(path)
  cached = { key: homeKey, doc }
  return doc
}

export async function get(domain: string, opts?: { dshHome?: string }): Promise<unknown> {
  const doc = await load(opts)
  return doc.domains[domain]
}

export async function set(
  domain: string,
  patch: object,
  opts?: { dshHome?: string },
): Promise<void> {
  const path = storePath(opts)
  const key = resolveDshHome(opts?.dshHome)
  await withLock(path, async () => {
    const doc = await readDoc(path)
    const validator = domainValidators.get(domain)
    const merged = deepMerge(doc.domains[domain], patch)
    if (validator) {
      const res = validator.parse(merged)
      if (!res.ok) throw new Error(`config-lib: validation failed for '${domain}': ${res.error}`)
    }
    doc.domains[domain] = merged
    await writeDocLocked(path, doc)
    cached = { key, doc }
  })
  for (const cb of changeCbs) cb(domain)
}

/** Names of domains registered via defineDomain (schema owners). */
export function definedDomains(): string[] {
  return [...domainValidators.keys()]
}

// ---------------------------------------------------------------------------
// adapter helpers — one mapping source for consumer config-stores
// ---------------------------------------------------------------------------

export interface DomainWrite {
  domain: string
  patch: Record<string, unknown>
}

/** Route a flat legacy-keyed patch into per-domain writes; runtime keys are skipped. */
export function splitLegacyPatch(patch: Record<string, unknown>): DomainWrite[] {
  const byDomain = new Map<string, Record<string, unknown>>()
  for (const [key, value] of Object.entries(patch)) {
    if (RUNTIME_KEYS.includes(key)) continue
    const dotted = DOMAIN_KEY_MAP[key]
    if (!dotted) continue
    const domain = dotted.split('.')[0]
    const group = byDomain.get(domain) ?? {}
    setIn(group, dotted.slice(domain.length + 1), value)
    byDomain.set(domain, group)
  }
  return [...byDomain].map(([domain, patch]) => ({ domain, patch }))
}

/** Write a flat legacy-keyed patch through the domain store (multiple atomic set()s). */
export async function writeLegacyPatch(
  patch: Record<string, unknown>,
  opts?: { dshHome?: string },
): Promise<void> {
  for (const { domain, patch: group } of splitLegacyPatch(patch)) {
    await set(domain, group, opts)
  }
}

/** Inverse view: domains flattened back into legacy key names (undefined keys omitted). */
export async function readFlat(opts?: { dshHome?: string }): Promise<Record<string, unknown>> {
  const doc = await load(opts)
  const flat: Record<string, unknown> = {}
  for (const [key, dotted] of Object.entries(DOMAIN_KEY_MAP)) {
    let cur: unknown = doc.domains
    for (const part of dotted.split('.')) {
      if (cur !== null && typeof cur === 'object') cur = (cur as Record<string, unknown>)[part]
      else { cur = undefined; break }
    }
    if (cur !== undefined) flat[key] = cur
  }
  return flat
}

// --- Shared model validator for review (Phase 2) ---
const _modelValidator: DomainValidator = {
  parse(value: unknown) {
    if (value === null || value === undefined) return { ok: true }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return { ok: false, error: 'domain must be object' }
    const v = value as Record<string, unknown>
    // domain may contain other keys (e.g., review has agentTimeoutMs) — only validate `model` sub-object if present
    const m = (v as any).model
    if (m !== undefined) {
      // legacy string shorthand (e.g., reviewModel: "deepseek-chat") is still allowed
      if (typeof m === 'string') {
        if (!m.trim()) return { ok: false, error: 'model must be non-empty string' }
        return { ok: true }
      }
      if (typeof m !== 'object' || m === null || Array.isArray(m)) return { ok: false, error: 'model must be object or string' }
      const mm = m as Record<string, unknown>
      if (typeof mm.provider !== 'string' || !(mm.provider as string).trim()) return { ok: false, error: 'provider must be non-empty string' }
      if (typeof mm.model !== 'string' || !(mm.model as string).trim()) return { ok: false, error: 'model must be non-empty string' }
      if (mm.reasoningEffort !== undefined && typeof mm.reasoningEffort !== 'string') return { ok: false, error: 'reasoningEffort must be string' }
      if (typeof mm.reasoningEffort === 'string' && !(mm.reasoningEffort as string).trim()) return { ok: false, error: 'reasoningEffort must be non-empty when provided' }
    }
    return { ok: true }
  },
}
try { defineDomain('review', _modelValidator) } catch {}
const guardValidator: DomainValidator = {
  parse(v:any) {
    if (v==null) return {ok:true}
    if (typeof v!=='object' || Array.isArray(v)) return {ok:false, error:'guard must be object'}
    if (typeof v.publishBlocked!=='undefined' && typeof v.publishBlocked!=='boolean') return {ok:false, error:'publishBlocked boolean'}
    if (v.gitProtection) {
      const gp=v.gitProtection
      if (typeof gp.enabled!=='boolean') return {ok:false, error:'gitProtection.enabled boolean'}
      if (!Array.isArray(gp.branches) || gp.branches.some((b:any)=>typeof b!=='string' || !b.trim())) return {ok:false, error:'branches string[]'}
    }
    if (v.credentialPaths && (!Array.isArray(v.credentialPaths) || v.credentialPaths.some((p:any)=>typeof p!=='string'))) return {ok:false, error:'credentialPaths string[]'}
    if (v.cwdContainment!==undefined && typeof v.cwdContainment!=='boolean') return {ok:false, error:'cwdContainment boolean'}
    return {ok:true}
  }
}
try { defineDomain('guard', guardValidator) } catch {}
const guardBlacklistValidator: DomainValidator = {
  parse(v:any) {
    if (v==null) return {ok:true}
    if (typeof v!=='object') return {ok:false, error:'guardBlacklist object'}
    if (v.patterns && !Array.isArray(v.patterns)) return {ok:false, error:'patterns array'}
    if (v.placeholders && typeof v.placeholders!=='object') return {ok:false, error:'placeholders object'}
    return {ok:true}
  }
}
try { defineDomain('guardBlacklist', guardBlacklistValidator) } catch {}
const notifierValidator: DomainValidator = {
  parse(v:any) {
    if (v==null) return {ok:true}
    if (typeof v!=='object' || Array.isArray(v)) return {ok:false, error:'notifier must be object'}
    if (v.telegram !== undefined) {
      if (typeof v.telegram !== 'object' || v.telegram === null || Array.isArray(v.telegram)) return {ok:false, error:'telegram must be object'}
      if (v.telegram.botToken !== undefined && typeof v.telegram.botToken !== 'string') return {ok:false, error:'botToken string'}
      if (v.telegram.chatId !== undefined && typeof v.telegram.chatId !== 'string') return {ok:false, error:'chatId string'}
    }
    if (v.policy !== undefined) {
      if (typeof v.policy !== 'object' || v.policy === null || Array.isArray(v.policy)) return {ok:false, error:'policy must be object'}
      if (v.policy.reviewNotifications !== undefined && typeof v.policy.reviewNotifications !== 'boolean') return {ok:false, error:'reviewNotifications boolean'}
    }
    return {ok:true}
  }
}
try { defineDomain('notifier', notifierValidator) } catch {}
export { guardValidator, guardBlacklistValidator, notifierValidator }
