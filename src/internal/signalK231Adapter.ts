import { DiagnosticError, safeCopy } from '../safety.js'

// Source contract: SignalK/signalk-server v2.31.0, src/index.ts,
// src/interfaces/providers.ts and src/pipedproviders.ts. No upstream code copied.
function field(value: unknown, key: string): unknown {
  if ((!value || typeof value !== 'object') && typeof value !== 'function') throw new DiagnosticError('UNSUPPORTED')
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor) return undefined
  if (!('value' in descriptor)) throw new DiagnosticError('UNSUPPORTED')
  return descriptor.value
}
function array(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value)) throw new DiagnosticError('UNSUPPORTED')
  if (value.length > limit) throw new DiagnosticError('RESULT_TOO_LARGE')
  return Array.from({ length: value.length }, (_, i) => field(value, String(i)))
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.:@/-]+$/.test(value) || ['__proto__', 'constructor', 'prototype'].includes(value)) throw new DiagnosticError('UNSUPPORTED')
  if (value.length > 256) throw new DiagnosticError('RESULT_TOO_LARGE')
  return value
}
function timestamp(value: unknown): string | null {
  if (value === undefined) return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new DiagnosticError('UNSUPPORTED')
  return value
}
// Free-form status text may echo options, URLs, usernames or arbitrary secrets.
// Only these complete generic messages are released; all other text is withheld.
const safeMessages = new Set(['Connected', 'Disconnected', 'Started', 'Stopped', 'Connecting', 'Connection closed'])
function message(value: unknown): string | null {
  if (value === undefined) return null
  if (typeof value !== 'string') throw new DiagnosticError('UNSUPPORTED')
  return safeMessages.has(value) ? value : '[withheld: untrusted provider text]'
}
export type Connection = { id: string; enabled: boolean; type: string }
type ProviderStatus = { id: string; type: 'status' | 'error'; statusType: 'provider'; message: string | null; timeStamp: string | null; lastError: string | null; lastErrorTimeStamp: string | null }
export class SignalK231Adapter {
  constructor(private runtime: unknown) {}
  private protect<T>(read: () => T): T {
    try { return read() } catch (e) {
      if (e instanceof DiagnosticError) throw e
      throw new DiagnosticError('UNSUPPORTED')
    }
  }
  connections(): Connection[] {
    return this.protect(() => {
      const raw = field(field(field(this.runtime, 'config'), 'settings'), 'pipedProviders')
      const ids = new Set<string>()
      return array(raw, 100).map(provider => {
        const id = identifier(field(provider, 'id'))
        if (ids.has(id)) throw new DiagnosticError('UNSUPPORTED')
        ids.add(id)
        const enabled = field(provider, 'enabled')
        if (enabled !== undefined && typeof enabled !== 'boolean') throw new DiagnosticError('UNSUPPORTED')
        const elements = array(field(provider, 'pipeElements'), 100)
        if (!elements.length) throw new DiagnosticError('UNSUPPORTED')
        const firstType = identifier(field(elements[0], 'type'))
        // Match the admin API's type selection, without copying its config export.
        const type = firstType === 'providers/simple' && elements.length === 1
          ? identifier(field(field(elements[0], 'options'), 'type')) : firstType
        return { id, enabled: enabled !== false, type }
      })
    })
  }
  private statuses(): ProviderStatus[] {
    return this.protect(() => {
      const fn = field(this.runtime, 'getProviderStatus')
      if (typeof fn !== 'function') throw new DiagnosticError('UNSUPPORTED')
      const rows = array(Reflect.apply(fn, this.runtime, []), 1000)
      const ids = new Set<string>(); const result: ProviderStatus[] = []
      for (const row of rows) {
        const id = identifier(field(row, 'id'))
        const category = field(row, 'statusType')
        // 2.31 also returns plugin statusMessage fallback rows without statusType.
        // Neither plugins nor ambiguous rows establish a connection's status.
        if (category === 'plugin' || category === undefined) continue
        if (category !== 'provider' || ids.has(id)) throw new DiagnosticError('UNSUPPORTED')
        ids.add(id)
        const type = field(row, 'type')
        if (type !== 'status' && type !== 'error') throw new DiagnosticError('UNSUPPORTED')
        result.push({ id, type, statusType: 'provider', message: message(field(row, 'message')),
          timeStamp: timestamp(field(row, 'timeStamp')), lastError: message(field(row, 'lastError')),
          lastErrorTimeStamp: timestamp(field(row, 'lastErrorTimeStamp')) })
      }
      return result
    })
  }
  private statusFor(connection: Connection, statuses: ProviderStatus[]) {
    const row = statuses.find(s => s.id === connection.id)
    return row ? { ...row, status: row.type === 'error' ? 'error' : 'reported' } : {
      id: connection.id, status: 'unknown', type: null, statusType: null,
      message: null, timeStamp: null, lastError: null, lastErrorTimeStamp: null }
  }
  connectionStatus(id: string) {
    const connections = this.connections()
    const statuses = this.statuses()
    const connection = connections.find(c => c.id === id)
    if (!connection) throw new DiagnosticError('NOT_FOUND')
    return this.statusFor(connection, statuses)
  }
  compatibility() {
    try { this.connections(); this.statuses(); return { referenceVersion: '2.31.0', compatible: true } }
    catch (e) { return { referenceVersion: '2.31.0', compatible: false, code: e instanceof DiagnosticError ? e.code : 'UNSUPPORTED' } }
  }
  context(sourceIds?: string[]) {
    try {
      const inventory = this.connections(); const statuses = this.statuses()
      const connections = inventory.map(c => ({ ...c, providerStatus: this.statusFor(c, statuses) }))
      const correlations = sourceIds?.map(source => ({ source, proven: false,
        candidateConnectionIds: inventory.filter(c => source === c.id || source.startsWith(c.id + '.')).map(c => c.id),
        basis: 'identifier namespace only; upstream source labels may be preserved' }))
      const enabledErrorCount = connections.filter(c => c.enabled && c.providerStatus.status === 'error').length
      const context = { available: true, connections, ...(correlations ? { correlations } : {}),
        assessment: { enabledErrorCount, text: 'Configured provider status is context only; it does not prove which connection should supply this path or a hardware root cause.' } }
      safeCopy(context)
      return context
    } catch (e) {
      return { available: false, error: { code: e instanceof DiagnosticError ? e.code : 'UNSUPPORTED' } }
    }
  }
}
