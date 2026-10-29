import type { ServerAPI } from '@signalk/server-api'
import type { ReadAccess } from './auth.js'
import { allowedPath, DiagnosticError, safeCopy, type Settings } from './safety.js'

export type ReadAPI = Pick<ServerAPI, 'getSelfPath' | 'getFeatures'>
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const sourceOf = (node: unknown): string | undefined => isRecord(node) && typeof node.$source === 'string' ? node.$source : undefined

export class SignalKAdapter {
  constructor(private app: ReadAPI, private settings: Settings, private access: ReadAccess) {}
  read(path: string) {
    if (!allowedPath(path, this.settings.pathPrefixes)) throw new DiagnosticError('PATH_NOT_ALLOWED')
    const node = this.app.getSelfPath(path)
    if (!this.access.canRead(path, sourceOf(node))) throw new DiagnosticError('PATH_UNAVAILABLE')
    if (node === undefined || node === null) throw new DiagnosticError('NOT_FOUND')
    if (!isRecord(node) || !Object.hasOwn(node, 'value')) throw new DiagnosticError('NOT_A_VALUE_PATH')
    const timestamp = typeof node.timestamp === 'string' ? node.timestamp : null
    const ageSeconds = timestamp && Number.isFinite(Date.parse(timestamp)) ? Math.max(0, (Date.now() - Date.parse(timestamp)) / 1000) : null
    return { path, value: safeCopy(node.value), timestamp, ageSeconds,
      stale: ageSeconds === null ? null : ageSeconds > this.settings.staleAfterSeconds,
      source: sourceOf(node) ?? null,
      units: isRecord(node.meta) && typeof node.meta.units === 'string' ? node.meta.units.slice(0, 64) : null }
  }
  sources(path: string) {
    const reading = this.read(path)
    const node = this.app.getSelfPath(path)
    // Authorize the newly fetched node too; never inspect a replacement source
    // using an earlier selected-source grant.
    if (!this.access.canRead(path, sourceOf(node))) throw new DiagnosticError('PATH_UNAVAILABLE')
    const permitted = isRecord(node) && isRecord(node.values)
      ? this.permittedSources(path, node.values) : []
    return { path, selectedSource: reading.source, sources: permitted.slice(0, 100), truncated: permitted.length > 100 }
  }
  private permittedSources(path: string, values: Record<string, unknown>) {
    const sources = Object.keys(values)
    if (sources.length > 1000) throw new DiagnosticError('RESULT_TOO_LARGE')
    return sources.filter(source => this.access.canRead(path, source))
  }
  paths(prefix: string | undefined, offset: number, limit: number) {
    if (prefix && !allowedPath(prefix, this.settings.pathPrefixes)) throw new DiagnosticError('PATH_NOT_ALLOWED')
    const paths = new Set<string>(); let visited = 0; let truncated = false
    const walk = (node: unknown, path: string, depth: number) => {
      if (++visited > 10000 || depth > 20) { truncated = true; return }
      if (!isRecord(node)) return
      if (Object.hasOwn(node, 'value')) {
        if (this.access.canRead(path, sourceOf(node))) paths.add(path)
        return
      }
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
    this.access.requireAdmin()
    const features: unknown = await this.app.getFeatures()
    this.access.requireAdmin()
    if (!isRecord(features) || !Array.isArray(features.plugins) ||
      !features.plugins.every(p => isRecord(p) && typeof p.id === 'string')) throw new DiagnosticError('UNSUPPORTED')
    const entries = features.plugins
    return { plugins: entries.slice(0, 100).map(info => ({ id: info.id.slice(0, 256),
      name: isRecord(info) && typeof info.name === 'string' ? info.name.slice(0, 256) : null,
      version: isRecord(info) && typeof info.version === 'string' ? info.version.slice(0, 64) : null,
      enabled: isRecord(info) && typeof info.enabled === 'boolean' ? info.enabled : null })), truncated: entries.length > 100 }
  }
}
