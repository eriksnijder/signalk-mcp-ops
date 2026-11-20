// Run explicitly with SIGNALK_TEST_SERVER_DIR pointing to an isolated installed
// signalk-server package. All users, JWTs, model values and configuration are
// disposable synthetic fixtures; this never contacts an operational server.
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { createRequire } = require('node:module')
const { randomBytes } = require('node:crypto')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js')

test('native Signal K router, JWT identities and source/path ACLs enforce read-only MCP access', { timeout: 90000 }, async t => {
  assert.ok(process.env.SIGNALK_TEST_SERVER_DIR, 'Set SIGNALK_TEST_SERVER_DIR to an isolated installed Signal K package')
  const runtime = createRequire(path.join(path.resolve(process.env.SIGNALK_TEST_SERVER_DIR), 'package.json'))
  const version = runtime('./package.json').version
  assert.ok(['2.31.0', '2.35.1'].includes(version), `Unexpected Signal K fixture version: ${version}`)
  if (process.env.SIGNALK_TEST_SERVER_VERSION) assert.equal(version, process.env.SIGNALK_TEST_SERVER_VERSION)
  console.log(`Native authentication integration: Signal K ${version}; Node ${process.version}`)

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-native-auth-'))
  const clients = []
  let server
  const saved = Object.fromEntries(['SIGNALK_NODE_CONFIG_DIR', 'SIGNALK_DISABLE_SERVER_UPDATES', 'SIGNALK_MCP_OPS_KEY', 'HTTP_RATE_LIMITS'].map(key => [key, process.env[key]]))
  const key = randomBytes(32).toString('hex')
  Object.assign(process.env, { SIGNALK_NODE_CONFIG_DIR: temp, SIGNALK_DISABLE_SERVER_UPDATES: 'true', SIGNALK_MCP_OPS_KEY: key, HTTP_RATE_LIMITS: 'api=10000,login=1000,loginStatus=1000' })
  t.after(async () => {
    for (const client of clients) await client.close()
    if (server) await server.stop()
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    // Validate the resolved target before recursively deleting this mkdtemp fixture.
    const resolved = fs.realpathSync(temp)
    assert.equal(fs.realpathSync(path.dirname(resolved)), fs.realpathSync(os.tmpdir()))
    assert.ok(path.basename(resolved).startsWith('mcp-native-auth-'))
    fs.rmSync(resolved, { recursive: true, force: true })
  })
  const socket = net.createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const host = `127.0.0.1:${port}`
  const root = path.resolve(__dirname, '../..')
  fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ name: 'native-auth-test-config', private: true, dependencies: { 'signalk-mcp-ops': require('../../package.json').version } }))
  const pluginDirectory = path.join(temp, 'node_modules/signalk-mcp-ops')
  fs.mkdirSync(pluginDirectory, { recursive: true })
  fs.writeFileSync(path.join(pluginDirectory, 'package.json'), JSON.stringify({ ...require('../../package.json'), main: 'index.cjs' }))
  fs.writeFileSync(path.join(pluginDirectory, 'index.cjs'), `module.exports = require(${JSON.stringify(path.join(root, 'dist/index.js'))})\n`)
  fs.mkdirSync(path.join(temp, 'plugin-config-data'))
  fs.writeFileSync(path.join(temp, 'plugin-config-data/signalk-mcp-ops.json'), JSON.stringify({ enabled: true, configuration: { allowedHosts: [host] } }))

  const grants = subjects => subjects.map(subject => ({ subject, permission: 'read' }))
  const securityConfig = {
    secretKey: randomBytes(32).toString('hex'), allow_readonly: true,
    users: ['reader', 'other', 'admin', 'writer', 'revoked'].map(username => ({ username, type: username === 'admin' ? 'admin' : username === 'writer' ? 'readwrite' : 'readonly' })),
    devices: [{ clientId: 'reader-device', permissions: 'readonly' }],
    acls: [{ context: 'vessels.self', resources: [
      { sources: ['private.XX'], permissions: grants(['other', 'admin']) },
      { paths: ['navigation.allowed', 'navigation.multi'], permissions: grants(['reader', 'reader-device', 'admin', 'revoked', 'writer']) },
      { paths: ['navigation.*'], permissions: [] }
    ] }]
  }
  const Server = runtime('.')
  server = new Server({
    config: { configPath: temp, defaults: { vessels: { self: { uuid: 'urn:mrn:signalk:uuid:00000000-0000-4000-8000-000000000001' } } },
      settings: { port, mdns: false, pipedProviders: [], enforceDataTimeouts: false, interfaces: { plugins: true, wasm: false }, security: { strategy: './tokensecurity' } } },
    securityConfig
  })
  await server.start()
  const jwt = runtime('jsonwebtoken')
  const token = username => jwt.sign({ id: username }, securityConfig.secretKey, { expiresIn: '1h' })
  const url = new URL(`http://${host}/plugins/signalk-mcp-ops/mcp`)
  const adminToken = token('admin')
  const send = (authorization, headers = {}) => fetch(url, { method: 'POST', headers: {
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'X-MCP-Ops-Key': key,
    ...(authorization ? { Authorization: authorization } : {}), ...headers
  }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'native-auth-test', version: '1' } } }) })
  const emit = (source, values, when = new Date().toISOString()) => server.app.handleMessage(source, { context: 'vessels.self', updates: [{ timestamp: when, source: { label: source, type: 'test' }, values }] })
  emit('private', [{ path: 'navigation.multi', value: 999 }, { path: 'navigation.denied', value: 'private-value-sentinel' }], new Date(Date.now() - 1000).toISOString())
  emit('public', [{ path: 'navigation.allowed', value: 3 }, { path: 'navigation.multi', value: 4 }, { path: 'navigation.pathDenied', value: 'denied-path-sentinel' }])

  assert.equal((await send()).status, 401, 'guest reads must not authenticate MCP')
  assert.equal((await send('Bearer invalid')).status, 401)
  assert.equal((await send(`Bearer ${jwt.sign({ id: 'reader' }, securityConfig.secretKey, { expiresIn: -1 })}`)).status, 401)
  assert.equal((await send(`Bearer ${token('reader')}`, { 'X-MCP-Ops-Key': 'wrong' })).status, 401)
  assert.equal((await send(`Bearer ${token('reader')}`, { Origin: 'https://denied.example' })).status, 403)
  const queryUrl = new URL(url); queryUrl.searchParams.set('token', adminToken)
  assert.equal((await fetch(queryUrl, { method: 'POST', headers: { 'X-MCP-Ops-Key': key, Cookie: `JAUTHENTICATION=${adminToken}` } })).status, 401)

  async function clientFor(bearer) {
    const client = new Client({ name: 'native-auth-integration', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: {
      Authorization: `Bearer ${bearer}`, 'X-MCP-Ops-Key': key,
      // A privileged cookie must not elevate the explicit read-only bearer.
      Cookie: `JAUTHENTICATION=${adminToken}`
    } } }))
    clients.push(client)
    return { client, call: async (name, args = {}) => (await client.callTool({ name, arguments: args })).structuredContent }
  }
  const reader = await clientFor(token('reader'))
  const admin = await clientFor(adminToken)
  const other = await clientFor(token('other'))
  const writer = await clientFor(token('writer'))
  const device = await clientFor(jwt.sign({ device: 'reader-device' }, securityConfig.secretKey, { expiresIn: '1h' }))
  assert.equal((await reader.client.listTools()).tools.length, 9)
  assert.equal((await reader.call('read_path', { path: 'navigation.allowed' })).data.value, 3)
  assert.equal((await writer.call('read_path', { path: 'navigation.allowed' })).data.value, 3)
  assert.equal((await device.call('read_path', { path: 'navigation.allowed' })).data.value, 3)
  const otherReading = await other.call('read_path', { path: 'navigation.denied' })
  assert.equal(otherReading.ok, true, JSON.stringify({ result: otherReading, source: server.app.signalk.self.navigation?.denied?.$source }))
  assert.equal(otherReading.data.value, 'private-value-sentinel')
  for (const denied of ['navigation.denied', 'navigation.pathDenied', 'navigation.absent']) {
    assert.deepEqual(await reader.call('read_path', { path: denied }), { ok: false, error: { code: 'PATH_UNAVAILABLE' } })
  }
  assert.deepEqual((await reader.call('list_paths', { prefix: 'navigation' })).data.paths, ['navigation.allowed', 'navigation.multi'])
  const sources = await reader.call('inspect_path_sources', { path: 'navigation.multi' })
  assert.equal(sources.data.selectedSource, 'public.XX')
  assert.deepEqual(sources.data.sources, ['public.XX'])
  const deniedDiagnosis = await reader.call('diagnose_missing_path', { path: 'navigation.denied' })
  assert.deepEqual(deniedDiagnosis, await reader.call('diagnose_missing_path', { path: 'navigation.absent' }))
  assert.equal(deniedDiagnosis.data.state, 'unavailable')
  const allowedDiagnosis = await reader.call('diagnose_missing_path', { path: 'navigation.multi' })
  assert.deepEqual(allowedDiagnosis.data.providerContext, { available: false, error: { code: 'ADMIN_REQUIRED' } })
  for (const name of ['list_connections', 'list_plugins', 'get_connection_status']) {
    assert.equal((await reader.call(name, name === 'get_connection_status' ? { id: 'anything' } : {})).error.code, 'ADMIN_REQUIRED')
  }
  assert.equal((await admin.call('list_plugins')).ok, true)
  assert.equal((await admin.call('list_connections')).ok, true)
  assert.equal((await admin.call('read_path', { path: 'navigation.pathDenied' })).error.code, 'PATH_UNAVAILABLE', 'admin is not an ACL bypass')

  // Use the test server's in-memory configuration, never a deployment file.
  const nativeConfig = server.app.securityStrategy.getConfiguration()
  const revokedToken = token('revoked')
  assert.equal((await send(`Bearer ${revokedToken}`)).status, 200)
  nativeConfig.users = nativeConfig.users.filter(user => user.username !== 'revoked')
  assert.equal((await send(`Bearer ${revokedToken}`)).status, 401)
  nativeConfig.devices = []
  assert.notEqual((await send(`Bearer ${jwt.sign({ device: 'reader-device' }, securityConfig.secretKey)}`)).status, 200)
  nativeConfig.acls[0].resources[1].permissions = grants(['admin'])
  assert.equal((await reader.call('read_path', { path: 'navigation.allowed' })).error.code, 'PATH_UNAVAILABLE')
  assert.deepEqual((await reader.call('list_paths', { prefix: 'navigation' })).data.paths, [])
  console.log('PASS: real native route/user/device tokens, path/source ACLs, discovery, diagnosis, admin gates, revocation and caller isolation')
})
