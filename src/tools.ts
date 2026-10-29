import { PLUGIN_VERSION } from './version.js'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { SignalK231Adapter } from './internal/signalK231Adapter.js'
import { SignalKAdapter, type ReadAPI } from './adapter.js'
import type { ReadAccess } from './auth.js'
import { DiagnosticError, pathSchema, safeCopy, type Settings } from './safety.js'

export function createServer(app: ReadAPI, settings: Settings, access: ReadAccess) {
  const server = new McpServer({ name: 'signalk-mcp-ops', version: PLUGIN_VERSION })
  const adapter = new SignalKAdapter(app, settings, access)
  const providers = new SignalK231Adapter(app)
  const adminUnavailable = () => ({ available: false, error: { code: 'ADMIN_REQUIRED' } })
  const providerContext = (sources?: string[]) => access.isAdmin() ? providers.context(sources) : adminUnavailable()
  const register = (name: string, description: string, schema: z.ZodRawShape, run: (args: any) => unknown, adminOnly = false) => {
    server.registerTool(name, { description, inputSchema: schema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    async args => {
      try {
        access.check()
        if (adminOnly) access.requireAdmin()
        const result = run(args)
        // Telemetry reads stay synchronous through authorization/serialization.
        // Async host inventory calls must reauthorize after the await as well.
        const data = result instanceof Promise ? await result : result
        const envelope = { ok: true, data: safeCopy(data) }
        access.check()
        if (adminOnly) access.requireAdmin()
        return { content: [{ type: 'text' as const, text: JSON.stringify(envelope) }], structuredContent: envelope }
      } catch (error) {
        const envelope = { ok: false, error: { code: error instanceof DiagnosticError ? error.code : 'INTERNAL_ERROR' } }
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(envelope) }], structuredContent: envelope }
      }
    })
  }
  register('get_server_info', 'Plugin capabilities; provider compatibility is admin-only. No host identity.', {}, () => ({
    pluginVersion: PLUGIN_VERSION, transport: 'streamable-http', readOnly: true, context: 'vessels.self',
    serverVersion: null, publicApiAvailable: typeof app.getSelfPath === 'function' && typeof app.getFeatures === 'function',
    internalAdapter: access.isAdmin() ? providers.compatibility() : adminUnavailable(), pathPrefixes: settings.pathPrefixes }))
  register('list_connections', 'Admin-only projected Data Connection inventory; version-sensitive Signal K 2.31 adapter.', {}, () => ({ connections: providers.connections() }), true)
  register('get_connection_status', 'Admin-only bounded provider status; arbitrary message text is withheld.', { id: z.string().min(1).max(256) }, a => providers.connectionStatus(a.id), true)
  register('list_plugins', 'Admin-only bounded plugin inventory from Signal K FeatureInfo.', {}, () => adapter.plugins(), true)
  register('read_path', 'Read one allowed self-context value with native path/source permissions and units.', { path: pathSchema }, a => adapter.read(a.path))
  register('list_paths', 'Discover allowed and native-authorized value paths. Pagination is not a stable snapshot.', {
    prefix: pathSchema.optional(), offset: z.number().int().min(0).max(10000).default(0), limit: z.number().int().min(1).max(100).default(50)
  }, a => adapter.paths(a.prefix, a.offset, a.limit))
  register('inspect_path_sources', 'Inspect native-authorized source identifiers for an authorized selected value.', { path: pathSchema }, a => adapter.sources(a.path))
  register('diagnose_missing_path', 'Report missing, unavailable, stale, fresh or unknown freshness; provider context is admin-only.', { path: pathSchema }, a => {
    try {
      const reading = adapter.read(a.path)
      const sources = adapter.sources(a.path)
      const sourceIds = [...new Set([...(sources.selectedSource ? [sources.selectedSource] : []), ...sources.sources])]
      return { state: reading.stale === null ? 'unknown_freshness' : reading.stale ? 'stale' : 'fresh', reading, sources, providerContext: providerContext(sourceIds) }
    }
    catch (e) {
      if (e instanceof DiagnosticError && e.code === 'NOT_FOUND') return { state: 'missing', providerContext: providerContext(), suggestion: 'Check the source connection and path spelling in Signal K Admin UI.' }
      if (e instanceof DiagnosticError && e.code === 'PATH_UNAVAILABLE') return { state: 'unavailable', suggestion: 'The path is absent or native path/source permission could not be established.' }
      throw e
    }
  })
  register('get_security_status', 'Report MCP policy and verified native security availability; no credentials.', {}, () => ({
    pluginKeyRequired: true, hostPolicy: 'exact-allowlist', originPolicy: 'exact-allowlist-or-absent',
    signalKSecurityEnabled: true, telemetryPolicy: 'native-path-and-source', operationalDiagnostics: 'admin-only',
    tls: 'deployment-dependent', rawConfigAndLogs: false }))
  return server
}
