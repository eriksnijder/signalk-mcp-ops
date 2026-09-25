import { createHash, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const pathSchema = z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/)
  .refine(p => !p.split('.').some(s => ['__proto__', 'prototype', 'constructor'].includes(s)), 'Unsafe path')
export const settingsSchema = z.object({
  allowedHosts: z.array(z.string().min(1).max(255)).min(1).max(20),
  allowedOrigins: z.array(z.string().url().max(512)).max(20).default([]),
  pathPrefixes: z.array(pathSchema).min(1).max(30).default(['navigation', 'environment', 'electrical', 'propulsion', 'tanks']),
  staleAfterSeconds: z.number().int().min(1).max(86400).default(300)
}).strict()
export type Settings = z.infer<typeof settingsSchema>
export function tokenMatches(actual: string | undefined, expected: string): boolean {
  if (!actual || actual.length > 1024) return false
  const hash = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(hash(actual), hash(expected))
}
export function allowedPath(path: string, prefixes: string[]): boolean {
  return prefixes.some(p => path === p || path.startsWith(p + '.'))
}
export class DiagnosticError extends Error {
  constructor(public code: string) { super(code) }
}
const sensitive = /password|passwd|secret|token|credential|authorization|cookie|private.?key|api.?key/i
/** Defense in depth for telemetry; never use this to authorize raw config or log export. */
export function safeCopy(value: unknown): unknown {
  let budget = 2000
  const seen = new WeakSet<object>()
  const copy = (v: unknown, depth: number): unknown => {
    if (--budget < 0 || depth > 12) throw new DiagnosticError('RESULT_TOO_LARGE')
    if (v === null || typeof v === 'number' || typeof v === 'boolean') return v
    if (typeof v === 'string') {
      if (v.length > 4096) throw new DiagnosticError('RESULT_TOO_LARGE')
      return v.replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    }
    if (typeof v !== 'object') return null
    if (seen.has(v)) throw new DiagnosticError('INVALID_DATA')
    seen.add(v)
    const out: unknown = Array.isArray(v) ? v.map(x => copy(x, depth + 1)) : Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, sensitive.test(k) ? '[REDACTED]' : copy(x, depth + 1)]))
    seen.delete(v)
    return out
  }
  const result = copy(value, 0)
  if (Buffer.byteLength(JSON.stringify(result)) > 32768) throw new DiagnosticError('RESULT_TOO_LARGE')
  return result
}
