import type { Plugin, ServerAPI } from '@signalk/server-api'
import express, { type RequestHandler } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from './tools.js'
import { settingsSchema, tokenMatches, type Settings } from './safety.js'

function pluginFactory(app: ServerAPI): Plugin {
  let settings: Settings | undefined
  let token = ''
  const active = new Set<ReturnType<typeof createServer>>()
  const guard: RequestHandler = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!settings) { res.status(503).json({ error: 'PLUGIN_DISABLED' }); return }
    if (!settings.allowedHosts.includes(req.headers.host ?? '') ||
      (req.headers.origin !== undefined && !settings.allowedOrigins.includes(req.headers.origin))) {
      res.status(403).json({ error: 'FORBIDDEN_ORIGIN_OR_HOST' }); return
    }
    if (!tokenMatches(req.get('X-MCP-Ops-Key'), token)) { res.status(401).json({ error: 'UNAUTHORIZED' }); return }
    next()
  }
  return {
    id: 'signalk-mcp-ops', name: 'Signal K MCP Operations',
    description: 'Read-only operations and diagnostics over MCP',
    schema: { type: 'object', required: ['allowedHosts'], properties: {
      allowedHosts: { type: 'array', minItems: 1, items: { type: 'string' }, title: 'Exact Host headers including port' },
      allowedOrigins: { type: 'array', items: { type: 'string' }, default: [] },
      pathPrefixes: { type: 'array', minItems: 1, items: { type: 'string' }, default: ['navigation', 'environment', 'electrical', 'propulsion', 'tanks'] },
      staleAfterSeconds: { type: 'integer', minimum: 1, maximum: 86400, default: 300 }
    } },
    start(options) {
      settings = undefined; token = ''
      const parsed = settingsSchema.safeParse(options)
      const secret = process.env.SIGNALK_MCP_OPS_KEY ?? ''
      if (!parsed.success || secret.length < 32 || secret.length > 512) {
        app.setPluginError('MCP disabled: valid settings and SIGNALK_MCP_OPS_KEY (32-512 characters) required')
        return
      }
      settings = parsed.data; token = secret
      app.setPluginStatus('Read-only MCP ready')
    },
    async stop() {
      settings = undefined; token = ''
      await Promise.allSettled([...active].map(server => server.close()))
      active.clear()
    },
    registerWithRouter(router) {
      router.post('/mcp', guard, express.json({ limit: '64kb' }), async (req, res) => {
        if (!settings) { res.sendStatus(503); return }
        if (active.size >= 8) { res.status(429).json({ error: 'BUSY' }); return }
        if (Buffer.byteLength(JSON.stringify(req.body) ?? '') > 65536) { res.sendStatus(413); return }
        const server = createServer(app, settings)
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
        active.add(server)
        let cleaned = false
        const cleanup = async () => {
          if (cleaned) return
          cleaned = true; clearTimeout(timer); active.delete(server)
          await server.close().catch(() => undefined)
        }
        const timer = setTimeout(() => { res.destroy(); void cleanup() }, 15000)
        timer.unref()
        res.once('close', () => { void cleanup() })
        try { await server.connect(transport); await transport.handleRequest(req, res, req.body) }
        catch { if (!res.headersSent) res.status(500).json({ error: 'INTERNAL_ERROR' }); else res.end() }
        finally { await cleanup() }
      })
      const unsupported: RequestHandler = (_req, res) => { res.setHeader('Allow', 'POST'); res.sendStatus(405) }
      router.get('/mcp', guard, unsupported)
      router.delete('/mcp', guard, unsupported)
    },
    getOpenApi: () => ({ openapi: '3.0.3', info: { title: 'Signal K MCP Operations', version: '0.1.0' },
      servers: [{ url: '/plugins/signalk-mcp-ops' }], paths: { '/mcp': { post: {
        summary: 'MCP JSON-RPC over stateless Streamable HTTP', security: [{ mcpOpsKey: [] }],
        responses: { '200': { description: 'MCP response' }, '202': { description: 'Notification accepted' }, '401': { description: 'Authentication required' } }
      } } }, components: { securitySchemes: { mcpOpsKey: { type: 'apiKey', in: 'header', name: 'X-MCP-Ops-Key' } } } })
  }
}
export = pluginFactory
