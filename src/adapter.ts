import type { ServerAPI } from '@signalk/server-api'
import { allowedPath, DiagnosticError, safeCopy, type Settings } from './safety.js'

export type ReadAPI = Pick<ServerAPI, 'getSelfPath' | 'getFeatures'>
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
export class SignalKAdapter {
  constructor(private app: ReadAPI, private settings: Settings) {}
  read(path: string) {
    if (!allowedPath(path, this.settings.pathPrefixes)) throw new DiagnosticError('PATH_NOT_ALLOWED')
    const node = this.app.getSelfPath(path)
    if (node === undefined || node === null) throw new DiagnosticError('NOT_FOUND')
    if (!isRecord(node) || !Object.hasOwn(node, 'value')) throw new DiagnosticError('NOT_A_VALUE_PATH')
    const timestamp = typeof node.timestamp === 'string' ? node.timestamp : null
    const ageSeconds = timestamp && Number.isFinite(Date.parse(timestamp)) ? Math.max(0, (Date.now() - Date.parse(timestamp)) / 1000) : null
    return { path, value: safeCopy(node.value), timestamp, ageSeconds,
      stale: ageSeconds === null ? null : ageSeconds > this.settings.staleAfterSeconds,
      source: typeof node.$source === 'string' ? node.$source.slice(0, 256) : null,
      units: isRecord(node.meta) && typeof node.meta.units === 'string' ? node.meta.units.slice(0, 64) : null }
  }
  sources(path: string) {
    this.read(path)
    const node = this.app.getSelfPath(path) as Record<string, unknown>
    return { path, selectedSource: typeof node.$source === 'string' ? node.$source.slice(0, 256) : null,
      sources: isRecord(node.values) ? Object.keys(node.values).slice(0, 100).map(s => s.slice(0, 256)) : [],
      truncated: isRecord(node.values) && Object.keys(node.values).length > 100 }
  }
  paths(prefix: string | undefined, offset: number, limit: number) {
    if (prefix && !allowedPath(prefix, this.settings.pathPrefixes)) throw new DiagnosticError('PATH_NOT_ALLOWED')
    const paths = new Set<string>(); let visited = 0; let truncated = false
    const walk = (node: unknown, path: string, depth: number) => {
      if (++visited > 10000 || depth > 20) { truncated = true; return }
      if (!isRecord(node)) return
      if (Object.hasOwn(node, 'value')) { paths.add(path); return }
      for (const key of Object.keys(node)) {
        if (visited > 10000) { truncated = true; break }
        if (!/^[A-Za-z0-9_-]+$/.test(key) || ['__proto__', 'prototype', 'constructor', 'meta', 'values'].includes(key)) continue
        walk(node[key], `${path}.${key}`, depth + 1)
      }
    }
    for (const root of prefix ? [prefix] : this.settings.pathPrefixes) walk(this.app.getSelfPath(root), root, 0)
    const sorted = [...paths].sort()
    return { paths: sorted.slice(offset, offset + limit), nextOffset: offset + limit < sorted.length ? offset + limit : null, truncated }
  }
  async plugins() {
    // FeatureInfo is projected to fields, never returned wholesale.
    const features: unknown = await this.app.getFeatures()
    if (!isRecord(features) || !Array.isArray(features.plugins) ||
      !features.plugins.every(p => isRecord(p) && typeof p.id === 'string')) throw new DiagnosticError('UNSUPPORTED')
    const entries = features.plugins
    return { plugins: entries.slice(0, 100).map(info => ({ id: info.id.slice(0, 256),
      version: isRecord(info) && typeof info.version === 'string' ? info.version.slice(0, 64) : null,
      enabled: isRecord(info) && typeof info.enabled === 'boolean' ? info.enabled : null })), truncated: entries.length > 100 }
  }
}
