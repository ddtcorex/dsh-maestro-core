import { load, set } from './index.js'

// ---------------------------------------------------------------------------
// flat-key adapter map (live: remote/review/supervisor read through readFlat)
// ---------------------------------------------------------------------------

export const DOMAIN_KEY_MAP: Record<string, string> = {
  gitlabBaseUrl: 'gitlab.baseUrl',
  gitlabToken: 'gitlab.token',
  botUsername: 'gitlab.botUsername',
  webhookSecret: 'gitlab.webhookSecret',
  webhookPort: 'gitlab.webhookPort',
  projectMappings: 'gitlab.projectMappings',
  autoRereviewOnPush: 'gitlab.autoRereviewOnPush',
  autoReviewOnAssign: 'gitlab.autoReviewOnAssign',
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
  /** Login-cookie lifetime in hours for the remote PIN gate (0 = session cookie). */
  pinSessionTtlHours: 'tunnel.pinSessionTtlHours',
  telegramBotToken: 'notifier.telegram.botToken',
  telegramChatId: 'notifier.telegram.chatId',
  telegramReviewNotifications: 'notifier.policy.reviewNotifications',
}

/** Machine runtime state — never settings; owning adapters persist these in their own sidecar. */
export const RUNTIME_KEYS: readonly string[] = ['lastTunnelRunning']

function setIn(obj: Record<string, unknown>, dotted: string, value: unknown): void {
  const parts = dotted.split('.')
  let cur = obj
  for (const part of parts.slice(0, -1)) {
    if (typeof cur[part] !== 'object' || cur[part] === null) cur[part] = {}
    cur = cur[part] as Record<string, unknown>
  }
  cur[parts[parts.length - 1]] = value
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
