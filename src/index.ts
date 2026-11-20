import type { Plugin, ServerAPI } from '@signalk/server-api'
import { PLUGIN_VERSION } from './version.js'
import express, { type RequestHandler } from 'express'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from './tools.js'
import { AccessError, createAccess, requireSecurity, type ReadAccess } from './auth.js'
import { settingsSchema, tokenMatches, type Settings } from './safety.js'

function pluginFactory(app: ServerAPI): Plugin {
  let settings: Settings | undefined
  let token = ''
  let permissionRouter: boolean | undefined
  const active = new Set<ReturnType<typeof createServer>>()
  const jsonParser = express.json({ limit: '64kb' })
  const parseJson: RequestHandler = (req, res, next) => {
    jsonParser(req, res, (error?: { status?: number }) => {
      if (!error) { next(); return }
      const status = error.status === 413 ? 413 : error.status === 415 ? 415 : 400
      res.status(status).json({ error: status === 413 ? 'REQUEST_TOO_LARGE' : status === 415 ? 'UNSUPPORTED_ENCODING' : 'INVALID_JSON' })
    })
  }
  const guard: RequestHandler = (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    if (!settings || permissionRouter !== true) { res.status(503).json({ error: 'PLUGIN_DISABLED' }); return }
    if (!settings.allowedHosts.includes(req.headers.host ?? '') ||
      (req.headers.origin !== undefined && !settings.allowedOrigins.includes(req.headers.origin))) {
      res.status(403).json({ error: 'FORBIDDEN_ORIGIN_OR_HOST' }); return
    }
    if (!tokenMatches(req.get('X-MCP-Ops-Key'), token)) { res.status(401).json({ error: 'UNAUTHORIZED' }); return }
    const current = settings
    try {
      res.locals.mcpAccess = createAccess(app, req.get('authorization'), () => settings === current)
    } catch (error) {
      const status = error instanceof AccessError ? error.status : 503
      if (status === 401) res.setHeader('WWW-Authenticate', 'Bearer realm="Signal K MCP Operations"')
      res.status(status).json({ error: error instanceof AccessError ? error.code : 'SIGNALK_SECURITY_UNAVAILABLE' })
      return
    }
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
      try {
        // Native startup may invoke start() before registering the router.
        if (permissionRouter === false) throw new AccessError('PERMISSION_ROUTER_UNAVAILABLE', 503)
        requireSecurity(app)
      } catch {
        app.setPluginError('MCP disabled: native Signal K security and permission-aware plugin routing are required')
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
      // No fallback to an unclassified/public route. Unsupported hosts stay disabled.
      permissionRouter = typeof router.access === 'function'
      if (!permissionRouter) {
        settings = undefined; token = ''
        app.setPluginError('MCP disabled: permission-aware Signal K plugin routing is required')
      }
      const routes = permissionRouter ? router.access('readonly') : router
      routes.post('/mcp', guard, parseJson, async (req, res) => {
        if (!settings) { res.sendStatus(503); return }
        if (active.size >= 8) { res.status(429).json({ error: 'BUSY' }); return }
        if (Buffer.byteLength(JSON.stringify(req.body) ?? '') > 65536) { res.sendStatus(413); return }
        const server = createServer(app, settings, res.locals.mcpAccess as ReadAccess)
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
      routes.get('/mcp', guard, unsupported)
      routes.delete('/mcp', guard, unsupported)
    },
    getOpenApi: () => ({ openapi: '3.0.3', info: { title: 'Signal K MCP Operations', version: PLUGIN_VERSION },
      servers: [{ url: '/plugins/signalk-mcp-ops' }], paths: { '/mcp': { post: {
        summary: 'Read-only MCP with native Signal K identity and path/source permissions', security: [{ signalKBearer: [], mcpOpsKey: [] }],
        responses: { '200': { description: 'MCP response' }, '202': { description: 'Notification accepted' }, '401': { description: 'Authentication required' } }
      } } }, components: { securitySchemes: { signalKBearer: { type: 'http', scheme: 'bearer' }, mcpOpsKey: { type: 'apiKey', in: 'header', name: 'X-MCP-Ops-Key' } } } })
  }
}
export = pluginFactory
