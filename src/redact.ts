// Best-effort secret removal for free-form server text (log lines, plugin
// status messages). This reduces accidental disclosure; it cannot prove that
// arbitrary text is safe, so callers must still treat the output as sensitive.
const R = '[REDACTED]'
const sensitiveKey = String.raw`(?:pass(?:word|wd|phrase)?|pwd|secret|client[_-]?secret|token|access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|apikey|auth(?:orization)?|credentials?|private[_-]?key|session(?:[_-]?id)?|cookie|signature|sig)`
const rules: [RegExp, string][] = [
  // PEM blocks first, before line-oriented rules touch their contents.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[REDACTED PRIVATE KEY]'],
  // HTTP authorization schemes.
  [/\b(Bearer|Basic|Digest|JWT)\s+[A-Za-z0-9._~+/=-]{6,}/gi, `$1 ${R}`],
  // JSON Web Tokens anywhere.
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, R],
  // Credentials embedded in URLs: scheme://user:pass@host or scheme://token@host.
  [/(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, `$1${R}@`],
  // key=value, key: value, "key": "value", ?key=value for sensitive key names.
  [new RegExp(String.raw`((?:^|[^A-Za-z0-9])["']?${sensitiveKey}["']?\s*[:=]\s*)(["']?)(?!\[REDACTED)[^\s"',;&}\]]+`, 'gi'), `$1$2${R}`],
  // Long hex or base64-like runs typical of keys and tokens.
  [/\b[A-Fa-f0-9]{32,}\b/g, R],
  [/(?<![A-Za-z0-9+/])(?=[A-Za-z0-9+/_-]{40,})(?=[^\s]*[A-Z])(?=[^\s]*[a-z])(?=[^\s]*[0-9])[A-Za-z0-9+/_-]{40,}={0,2}/g, R]
]
// Terminal colour codes and other control characters (keep tab and newline,
// so multi-line chunks can be split after redaction).
const ansi = /\x1b\[[0-9;?]*[A-Za-z]/g
const control = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g

export function cleanText(text: string, knownSecrets: readonly string[] = []): string {
  let out = text.replace(ansi, '').replace(control, ' ')
  for (const secret of knownSecrets) if (secret.length >= 8) out = out.split(secret).join(R)
  for (const [pattern, replacement] of rules) out = out.replace(pattern, replacement)
  return out
}

export function truncate(text: string, max: number): { text: string; truncated: boolean } {
  return text.length > max ? { text: text.slice(0, max) + '…', truncated: true } : { text, truncated: false }
}
