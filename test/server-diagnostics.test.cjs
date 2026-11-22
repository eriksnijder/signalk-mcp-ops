const { adminAccess, securityStrategy, token } = require('./auth-fixture.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { cleanText } = require('../dist/redact.js')
const { ServerDiagnostics } = require('../dist/internal/serverDiagnostics.js')
const { createAccess } = require('../dist/auth.js')
const { createServer } = require('../dist/tools.js')
const { settingsSchema } = require('../dist/safety.js')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js')

const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImFkbWluIn0.c2lnbmF0dXJlLXZhbHVlLWhlcmU'
const mcpKey = 'synthetic-mcp-key-'.repeat(3)
const secrets = ['secret-pass-1', 'secret-token-2', 'secret-api-3', jwt, 'secret-cookie-4', 'MIIEvQIBADANsecretpem', 'a'.repeat(64), mcpKey]

// Synthetic log rows shaped like SignalK/signalk-server src/logging.js entries.
function logRows() {
  return [
    { ts: 'Nov 22 10:00:01', row: 'Signal K server version 2.31.0 running\nEnabled plugin signalk-mcp-ops\n' },
    { ts: 'Nov 22 10:00:02', row: '\x1b[31mError: connect ECONNREFUSED 192.168.1.50:1883\x1b[0m\n', isError: true },
    { ts: 'Nov 22 10:00:03', row: 'mqtt connecting to mqtt://boat:secret-pass-1@broker.local:1883\n' },
    { ts: 'Nov 22 10:00:04', row: 'request headers {"authorization":"Bearer secret-token-2","apiKey":"secret-api-3"}\n' },
    { ts: 'Nov 22 10:00:05', row: `token=${jwt} cookie: secret-cookie-4 url=/signalk?token=secret-token-2&x=1\n` },
    { ts: 'Nov 22 10:00:06', row: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANsecretpem\n-----END PRIVATE KEY-----\n', isError: true },
    { ts: 'Nov 22 10:00:07', row: `hash ${'a'.repeat(64)} key ${mcpKey}\n` },
    { ts: 'Nov 22 10:00:08', row: Buffer.from('binary chunk') },
    { ts: 'Nov 22 10:00:09', row: 'signalk-n2k: Failed to open can0: device not found\n' },
    { ts: 'Nov 22 10:00:10', row: '$GPRMC,123519,A,4807.038,N,01131.000,E,022.4,084.4,230394,003.1,W*6A\n' }
  ]
}
const runtime = (rows = logRows()) => ({ logging: { getLog: () => rows } })

test('redaction removes common secret shapes and keeps useful context', () => {
  const joined = logRows().filter(r => typeof r.row === 'string').map(r => cleanText(r.row, [mcpKey])).join('\n')
  for (const secret of secrets) assert.equal(joined.includes(secret), false, `leaked ${secret.slice(0, 12)}`)
  assert.match(joined, /ECONNREFUSED 192\.168\.1\.50:1883/)
  assert.match(joined, /mqtt:\/\/\[REDACTED\]@broker\.local/)
  assert.equal(cleanText('ws upgrade with Bearer abcdef123456 ok'), 'ws upgrade with Bearer [REDACTED] ok')
  assert.equal(joined.includes('[REDACTED]]'), false, 'no double redaction artefacts')
  // A realistic PEM body split over its own write chunk is still caught.
  assert.equal(cleanText('MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj'), '[REDACTED]')
  assert.match(joined, /\[REDACTED PRIVATE KEY\]/)
  assert.equal(joined.includes('\x1b'), false)
  assert.equal(cleanText('author: Erik, Enabled plugin, SOG 5.2 kn'), 'author: Erik, Enabled plugin, SOG 5.2 kn')
  assert.equal(cleanText('$GPRMC,123519,A,4807.038,N'), '$GPRMC,123519,A,4807.038,N')
})

test('logs split chunks, flag likely problems and never leak secrets', () => {
  const d = new ServerDiagnostics(runtime(), [mcpKey])
  const all = d.logs({ problemsOnly: false, limit: 100 })
  assert.equal(all.skippedBinaryChunks, 1)
  assert.equal(all.lines[0].text, 'Signal K server version 2.31.0 running')
  assert.equal(all.lines[1].looksLikeProblem, false, '"Enabled" must not look like an errno code')
  const serialized = JSON.stringify(all)
  for (const secret of secrets) assert.equal(serialized.includes(secret), false)
  const problems = d.logs({ problemsOnly: true, limit: 100 })
  assert.ok(problems.lines.some(l => /ECONNREFUSED/.test(l.text) && l.stderr))
  assert.ok(problems.lines.some(l => /Failed to open can0/.test(l.text) && !l.stderr))
  assert.equal(problems.lines.some(l => /GPRMC/.test(l.text)), false)
})

test('search runs on redacted text, limit keeps the newest lines', () => {
  const d = new ServerDiagnostics(runtime(), [mcpKey])
  assert.equal(d.logs({ problemsOnly: false, contains: 'secret-pass-1', limit: 10 }).matched, 0)
  assert.equal(d.logs({ problemsOnly: false, contains: 'CAN0', limit: 10 }).lines.length, 1)
  const two = d.logs({ problemsOnly: false, limit: 2 })
  assert.deepEqual(two.lines.map(l => l.time), ['Nov 22 10:00:09', 'Nov 22 10:00:10'])
  assert.equal(two.olderMatchesOmitted, true)
})

test('long lines and large buffers stay within output bounds; host buffer is untouched', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ ts: 'Nov 22 10:00:00', row: `line ${i} ` + 'x'.repeat(900) }))
  const before = JSON.stringify(rows)
  const r = new ServerDiagnostics(runtime(rows)).logs({ problemsOnly: false, limit: 100 })
  assert.ok(r.lines.every(l => l.text.length <= 501 && l.lineTruncated))
  assert.ok(r.lines.length < 100 && r.olderMatchesOmitted)
  assert.match(r.lines.at(-1).text, /^line 99 /)
  assert.ok(Buffer.byteLength(JSON.stringify(r)) < 32768)
  assert.equal(JSON.stringify(rows), before)
})

test('missing or changed log internals fail closed', () => {
  for (const rt of [{}, { logging: {} }, { logging: { getLog: () => ({}) } }, { logging: { getLog: () => [{ ts: 5, row: 'x' }] } },
    { logging: { getLog: () => [{ ts: 'a', row: 'x', isError: 'yes' }] } }, { logging: { getLog: () => { throw Error('password=hidden') } } }]) {
    assert.throws(() => new ServerDiagnostics(rt).logs({ problemsOnly: false, limit: 5 }), /UNSUPPORTED/)
  }
  const getterRow = {}; let invoked = false
  Object.defineProperty(getterRow, 'row', { get() { invoked = true; return 'x' } }); getterRow.ts = 'a'
  assert.throws(() => new ServerDiagnostics({ logging: { getLog: () => [getterRow] } }).logs({ problemsOnly: false, limit: 5 }), /UNSUPPORTED/)
  assert.equal(invoked, false)
})

// Rows shaped like getProviderStatus() in Signal K 2.31.0 / 2.35.1 src/index.ts.
const inventory = [{ id: 'mqtt', name: 'MQTT Push', enabled: true }, { id: 'n2k', name: 'NMEA 2000', enabled: true }, { id: 'quiet', name: 'Quiet', enabled: false }]
const statusRows = () => [
  { id: 'mqtt', type: 'error', statusType: 'plugin', message: 'Cannot connect mqtt://u:secret-pass-1@broker', timeStamp: '2026-11-22T10:00:00.000Z',
    lastError: 'token=secret-token-2', lastErrorTimeStamp: '2026-11-22T09:00:00.000Z' },
  { id: 'n2k', type: 'status', message: 'Connected to can0' },
  { id: 'unknown-provider', type: 'status', message: 'not a plugin' },
  { id: 'serial0', type: 'error', statusType: 'provider', message: 'No such device' }
]

test('plugin status joins inventory, ignores connections and cleans text', () => {
  const d = new ServerDiagnostics({ getProviderStatus: statusRows })
  const r = d.pluginStatus(inventory, false)
  assert.deepEqual(r.plugins.map(p => [p.id, p.state]), [['mqtt', 'error'], ['n2k', 'ok'], ['quiet', 'no_status']])
  assert.equal(r.errorCount, 1)
  assert.equal(r.plugins[0].name, 'MQTT Push')
  assert.equal(r.plugins[0].message, 'Cannot connect mqtt://[REDACTED]@broker')
  assert.equal(r.plugins[0].previousError, 'token=[REDACTED]')
  assert.equal(r.plugins[1].message, 'Connected to can0')
  assert.deepEqual(d.pluginStatus(inventory, true).plugins.map(p => p.id), ['mqtt'])
  assert.throws(() => new ServerDiagnostics({ getProviderStatus: () => [{ id: 'mqtt', type: 'healthy', statusType: 'plugin' }] }).pluginStatus(inventory, false), /UNSUPPORTED/)
  assert.throws(() => new ServerDiagnostics({}).pluginStatus(inventory, false), /UNSUPPORTED/)
})

async function connect(t, app, settings, access) {
  const server = createServer(app, settings, access, [mcpKey])
  const client = new Client({ name: 'test', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b)
  t.after(async () => { await client.close(); await server.close() })
  return async (name, args = {}) => (await client.callTool({ name, arguments: args })).structuredContent
}

test('MCP: logs are opt-in and admin-only; plugin status is admin-only', async t => {
  const app = { ...runtime(), getProviderStatus: statusRows, getSelfPath: () => undefined,
    getFeatures: async () => ({ plugins: inventory }) }
  const base = { allowedHosts: ['localhost'] }
  const off = await connect(t, app, settingsSchema.parse(base), adminAccess())
  assert.equal((await off('get_server_logs')).error.code, 'LOGS_DISABLED')
  assert.equal((await off('get_security_status')).data.serverLogs, 'disabled')
  const status = await off('get_plugin_status', { problemsOnly: true })
  assert.equal(status.data.plugins[0].id, 'mqtt')

  const on = await connect(t, app, settingsSchema.parse({ ...base, allowServerLogs: true }), adminAccess())
  const logs = await on('get_server_logs', { problemsOnly: false, limit: 100 })
  assert.equal(logs.ok, true)
  const text = JSON.stringify(logs)
  for (const secret of secrets) assert.equal(text.includes(secret), false)
  assert.equal((await on('get_security_status')).data.serverLogs, 'admin-opt-in-redacted')

  const reader = { ...securityStrategy, authorizeWS(c) { securityStrategy.authorizeWS(c); c.skPrincipal = { identifier: 'crew', permissions: 'readonly' } } }
  const crew = await connect(t, app, settingsSchema.parse({ ...base, allowServerLogs: true }), createAccess({ securityStrategy: reader }, `Bearer ${token}`))
  assert.equal((await crew('get_server_logs')).error.code, 'ADMIN_REQUIRED')
  assert.equal((await crew('get_plugin_status')).error.code, 'ADMIN_REQUIRED')
})
