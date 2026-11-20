import type { ServerAPI } from '@signalk/server-api'
import type { ReadAccess } from './auth.js'
import { toDisplay } from './units.js'
import { allowedPath, DiagnosticError, safeCopy, type Settings } from './safety.js'

export type ReadAPI = Pick<ServerAPI, 'getSelfPath' | 'getFeatures'>
export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const segment = /^[A-Za-z0-9_-]+$/
const blocked = ['__proto__', 'prototype', 'constructor', 'meta', 'values']
const skippable = ['NOT_FOUND', 'PATH_UNAVAILABLE', 'PATH_NOT_ALLOWED', 'NOT_A_VALUE_PATH']
const severity = ['emergency', 'alarm', 'warn', 'alert', 'nominal', 'normal']
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
  /** Bounded walk returning native-authorized value leaves under allowed prefixes. */
  private collect(prefix: string | undefined) {
    if (prefix && !allowedPath(prefix, this.settings.pathPrefixes)) throw new DiagnosticError('PATH_NOT_ALLOWED')
    const leaves = new Map<string, Record<string, unknown>>(); let visited = 0; let truncated = false
    const walk = (node: unknown, path: string, depth: number) => {
      if (++visited > 10000 || depth > 20) { truncated = true; return }
      if (!isRecord(node)) return
      if (Object.hasOwn(node, 'value')) {
        if (this.access.canRead(path, sourceOf(node))) leaves.set(path, node)
        return
      }
      for (const key of Object.keys(node)) {
        if (visited > 10000) { truncated = true; break }
        if (!segment.test(key) || blocked.includes(key)) continue
        walk(node[key], `${path}.${key}`, depth + 1)
      }
    }
    for (const root of prefix ? [prefix] : this.settings.pathPrefixes) walk(this.app.getSelfPath(root), root, 0)
    return { leaves, truncated }
  }
  paths(prefix: string | undefined, offset: number, limit: number) {
    const { leaves, truncated } = this.collect(prefix)
    const sorted = [...leaves.keys()].sort()
    return { paths: sorted.slice(offset, offset + limit), nextOffset: offset + limit < sorted.length ? offset + limit : null, truncated }
  }
  /** Case-insensitive search over authorized path names and their meta labels. */
  search(query: string, prefix: string | undefined, limit: number) {
    const terms = query.toLowerCase().split(/[\s.]+/).filter(Boolean).slice(0, 8)
    if (!terms.length) throw new DiagnosticError('INVALID_DATA')
    const { leaves, truncated } = this.collect(prefix)
    const matches: { path: string; displayName: string | null; description: string | null; units: string | null; score: number }[] = []
    for (const [path, node] of leaves) {
      const meta = isRecord(node.meta) ? node.meta : {}
      const text = (k: string, n: number) => typeof meta[k] === 'string' ? (meta[k] as string).slice(0, n) : null
      const displayName = text('displayName', 128) ?? text('shortName', 128)
      const description = text('description', 256)
      const lowerPath = path.toLowerCase()
      const haystack = `${lowerPath} ${displayName ?? ''} ${description ?? ''}`.toLowerCase()
      if (!terms.every(t => haystack.includes(t))) continue
      const segments = lowerPath.split('.')
      const score = terms.reduce((n, t) => n + (segments.includes(t) ? 3 : lowerPath.includes(t) ? 2 : 1), 0)
      matches.push({ path, displayName, description, units: text('units', 64), score })
    }
    matches.sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path))
    return { query, matches: matches.slice(0, limit).map(({ score: _score, ...m }) => m), total: matches.length, truncated }
  }
  /** Reads several paths; each entry succeeds or fails independently with an error code. */
  readMany(paths: string[], convertUnits: boolean) {
    return { readings: paths.map(path => {
      try {
        const reading = this.read(path)
        return convertUnits ? { ok: true, ...reading, display: toDisplay(path, reading.value, reading.units) } : { ok: true, ...reading }
      } catch (e) {
        return { ok: false, path, error: { code: e instanceof DiagnosticError ? e.code : 'INTERNAL_ERROR' } }
      }
    }) }
  }
  /** Child keys of an allowed container path; names are only used to attempt authorized reads. */
  private children(path: string, max: number): string[] {
    if (!allowedPath(path, this.settings.pathPrefixes)) return []
    const node = this.app.getSelfPath(path)
    if (!isRecord(node) || Object.hasOwn(node, 'value')) return []
    return Object.keys(node).filter(k => segment.test(k) && !blocked.includes(k)).sort().slice(0, max)
  }
  private tryRead(path: string) {
    try {
      const r = this.read(path)
      return { path, value: r.value, units: r.units, display: toDisplay(path, r.value, r.units), ageSeconds: r.ageSeconds, stale: r.stale }
    } catch (e) {
      if (e instanceof DiagnosticError && skippable.includes(e.code)) return undefined
      throw e
    }
  }
  private group(paths: Record<string, string>) {
    const out: Record<string, unknown> = {}
    for (const [key, path] of Object.entries(paths)) { const r = this.tryRead(path); if (r) out[key] = r }
    return out
  }
  private instances(container: string, fields: Record<string, string>, max: number) {
    const out: Record<string, unknown> = {}
    for (const id of this.children(container, max)) {
      const g = this.group(Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, `${container}.${id}.${f}`])))
      if (Object.keys(g).length) out[id] = g
    }
    return out
  }
  /** One-call vessel summary of well-known paths; unreadable or absent items are omitted. */
  overview() {
    const tanks: Record<string, unknown> = {}
    for (const type of this.children('tanks', 8)) {
      const t = this.instances(`tanks.${type}`, { level: 'currentLevel', volume: 'currentVolume', capacity: 'capacity' }, 8)
      if (Object.keys(t).length) tanks[type] = t
    }
    let alarms: unknown
    try {
      const { alarms: top, total, truncated } = this.alarms(false, 5)
      alarms = { available: true, active: total, highest: top[0]?.state ?? null, top, truncated }
    } catch (e) {
      if (!(e instanceof DiagnosticError) || e.code !== 'PATH_NOT_ALLOWED') throw e
      alarms = { available: false, error: { code: 'PATH_NOT_ALLOWED' } }
    }
    return {
      generatedAt: new Date().toISOString(),
      navigation: this.group({ position: 'navigation.position', speedOverGround: 'navigation.speedOverGround',
        courseOverGroundTrue: 'navigation.courseOverGroundTrue', headingTrue: 'navigation.headingTrue',
        headingMagnetic: 'navigation.headingMagnetic', speedThroughWater: 'navigation.speedThroughWater',
        rateOfTurn: 'navigation.rateOfTurn', state: 'navigation.state', log: 'navigation.log', datetime: 'navigation.datetime' }),
      environment: this.group({ depthBelowTransducer: 'environment.depth.belowTransducer', depthBelowKeel: 'environment.depth.belowKeel',
        windSpeedApparent: 'environment.wind.speedApparent', windAngleApparent: 'environment.wind.angleApparent',
        windSpeedTrue: 'environment.wind.speedTrue', windDirectionTrue: 'environment.wind.directionTrue',
        outsideTemperature: 'environment.outside.temperature', outsidePressure: 'environment.outside.pressure',
        waterTemperature: 'environment.water.temperature' }),
      batteries: this.instances('electrical.batteries', { voltage: 'voltage', current: 'current', stateOfCharge: 'capacity.stateOfCharge', temperature: 'temperature' }, 10),
      tanks,
      engines: this.instances('propulsion', { state: 'state', revolutions: 'revolutions', temperature: 'temperature', oilPressure: 'oilPressure', runTime: 'runTime' }, 6),
      alarms
    }
  }
  /** Notifications under `notifications`, most severe first; normal/nominal omitted unless requested. */
  alarms(includeNormal: boolean, limit: number) {
    const { leaves, truncated } = this.collect('notifications')
    const alarms: { path: string; state: string; message: string | null; method: string[]; timestamp: string | null }[] = []
    for (const [path, node] of leaves) {
      const v = node.value
      if (!isRecord(v) || typeof v.state !== 'string') continue
      const state = v.state.slice(0, 32)
      if (!includeNormal && (state === 'normal' || state === 'nominal')) continue
      alarms.push({ path, state, message: typeof v.message === 'string' ? v.message.slice(0, 512) : null,
        method: Array.isArray(v.method) ? v.method.filter((m): m is string => typeof m === 'string').slice(0, 4).map(m => m.slice(0, 16)) : [],
        timestamp: typeof node.timestamp === 'string' ? node.timestamp : null })
    }
    const rank = (s: string) => { const i = severity.indexOf(s); return i < 0 ? severity.length : i }
    alarms.sort((a, b) => rank(a.state) - rank(b.state) || (b.timestamp ?? '').localeCompare(a.timestamp ?? '') || a.path.localeCompare(b.path))
    return { alarms: alarms.slice(0, limit), total: alarms.length, truncated }
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
