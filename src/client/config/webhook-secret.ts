const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

/** Generate an opaque 256-bit secret suitable for GitLab's webhook token. */
export function generateWebhookSecret(randomValues = crypto.getRandomValues.bind(crypto)) {
  const bytes = randomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => BASE64URL_ALPHABET[byte & 0b00111111]).join('')
}

/** GitLab's Merge Request webhook endpoint for the configured public hostname. */
export function gitlabWebhookUrl(hostname?: string) {
  const authority = hostname?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || '<your-hostname>'
  return `https://${authority}/hooks/gitlab-mr`
}
