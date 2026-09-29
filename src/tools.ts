import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { SignalK231Adapter } from './internal/signalK231Adapter.js'
import { SignalKAdapter, type ReadAPI } from './adapter.js'
import { DiagnosticError, pathSchema, safeCopy, type Settings } from './safety.js'

export function createServer(app: ReadAPI, settings: Settings) {
  const server = new McpServer({ name: 'signalk-mcp-ops', version: '0.1.0' })
  const adapter = new SignalKAdapter(app, settings)
  const providers = new SignalK231Adapter(app)
  const register = (name: string, description: string, schema: z.ZodRawShape, run: (args: any) => unknown) => {
    server.registerTool(name, { description, inputSchema: schema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
    async args => {
      try {
        const envelope = { ok: true, data: safeCopy(await run(args)) }
        return { content: [{ type: 'text' as const, text: JSON.stringify(envelope) }], structuredContent: envelope }
      } catch (error) {
        const envelope = { ok: false, error: { code: error instanceof DiagnosticError ? error.code : 'INTERNAL_ERROR' } }
        return { isError: true, content: [{ type: 'text' as const, text: JSON.stringify(envelope) }], structuredContent: envelope }
      }
    })
  }
  register('get_server_info', 'Plugin capabilities and adapter compatibility; no host identity.', {}, () => ({
    pluginVersion: '0.1.0', transport: 'streamable-http', readOnly: true, context: 'vessels.self',
    serverVersion: null, publicApiAvailable: typeof app.getSelfPath === 'function' && typeof app.getFeatures === 'function',
    internalAdapter: providers.compatibility(), pathPrefixes: settings.pathPrefixes }))
  register('list_connections', 'Read projected Data Connection inventory; version-sensitive Signal K 2.31 adapter.', {}, () => ({ connections: providers.connections() }))
  register('get_connection_status', 'Read bounded provider status; arbitrary message text is withheld.', { id: z.string().min(1).max(256) }, a => providers.connectionStatus(a.id))
  register('list_plugins', 'Bounded plugin inventory from Signal K FeatureInfo.', {}, () => adapter.plugins())
  register('read_path', 'Read one permitted self-context value in native Signal K units.', { path: pathSchema }, a => adapter.read(a.path))
  register('list_paths', 'Discover permitted value paths. Pagination is not a stable snapshot.', {
    prefix: pathSchema.optional(), offset: z.number().int().min(0).max(10000).default(0), limit: z.number().int().min(1).max(100).default(50)
  }, a => adapter.paths(a.prefix, a.offset, a.limit))
  register('inspect_path_sources', 'Inspect selected and available source identifiers.', { path: pathSchema }, a => adapter.sources(a.path))
  register('diagnose_missing_path', 'Report missing, stale, fresh or unknown timestamp; does not infer hardware failure.', { path: pathSchema }, a => {
    try {
      const reading = adapter.read(a.path)
      const sources = adapter.sources(a.path)
      const sourceIds = [...new Set([...(sources.selectedSource ? [sources.selectedSource] : []), ...sources.sources])]
      return { state: reading.stale === null ? 'unknown_freshness' : reading.stale ? 'stale' : 'fresh', reading, sources, providerContext: providers.context(sourceIds) }
    }
    catch (e) { if (e instanceof DiagnosticError && e.code === 'NOT_FOUND') return { state: 'missing', providerContext: providers.context(), suggestion: 'Check the source connection and path spelling in Signal K Admin UI.' }; throw e }
  })
  register('get_security_status', 'Report MCP policy only; host security cannot be inferred.', {}, () => ({
    pluginKeyRequired: true, hostPolicy: 'exact-allowlist', originPolicy: 'exact-allowlist-or-absent',
    signalKSecurityEnabled: 'unknown', tls: 'deployment-dependent', rawConfigAndLogs: false }))
  return server
}
