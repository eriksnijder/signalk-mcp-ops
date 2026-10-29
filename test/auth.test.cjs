const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createAccess } = require('../dist/auth.js')
const { SignalKAdapter } = require('../dist/adapter.js')
const { createServer } = require('../dist/tools.js')
const { settingsSchema } = require('../dist/safety.js')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js')

const settings = settingsSchema.parse({ allowedHosts: ['localhost'] })
function fixture() {
  const identities = new Map([
    ['reader-token', { identifier: 'reader', permissions: 'readonly' }],
    ['other-token', { identifier: 'other', permissions: 'readonly' }],
    ['writer-token', { identifier: 'writer', permissions: 'readwrite' }],
    ['admin-token', { identifier: 'admin', permissions: 'admin' }]
  ])
  const selected = { value: 3, $source: 'public', timestamp: '2026-10-29T12:00:00Z', meta: { units: 'm/s' }, values: { public: { value: 3 }, private: { value: 999 } } }
  const hidden = { value: 'hidden-value', $source: 'private', meta: { units: 'hidden-units' }, values: { private: {} } }
  const root = { speedOverGround: selected, hidden }
  const calls = []
  const app = {
    securityStrategy: {
      isDummy: () => false, anyACLs: () => true,
      authorizeWS(connection) {
        assert.deepEqual(Object.keys(connection), ['headers'])
        assert.deepEqual(Object.keys(connection.headers), ['authorization'])
        const principal = identities.get(connection.headers.authorization.slice(7))
        if (!principal) throw Error('synthetic-secret-not-for-output')
        connection.skIsAuthenticated = true
        connection.skPrincipal = principal
      },
      checkACL(id, context, path, source, operation) {
        calls.push({ id, context, path, source, operation })
        return context === 'vessels.self' && operation === 'read' && source === (id === 'other' ? 'private' : 'public')
      }
    },
    getSelfPath: p => p === 'navigation' ? root : root[p.replace(/^navigation\./, '')],
    getFeatures: async () => ({ plugins: [{ id: 'sensitive-plugin' }] })
  }
  return { app, identities, selected, root, calls, access: token => createAccess(app, `Bearer ${token}`) }
}
async function connect(t, app, access) {
  const server = createServer(app, settings, access)
  const client = new Client({ name: 'native-permission-unit-test', version: '1' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(a); await client.connect(b)
  t.after(async () => { await client.close(); await server.close() })
  return async (name, args = {}) => (await client.callTool({ name, arguments: args })).structuredContent
}

test('bearer identity is mandatory; unknown, guest, dummy and unsupported security fail closed', () => {
  const f = fixture()
  for (const token of [undefined, '', 'Basic abc', 'Bearer a b', 'Bearer\treader-token']) {
    assert.throws(() => createAccess(f.app, token), /BEARER_TOKEN_REQUIRED/)
  }
  assert.throws(() => f.access('invalid'), /INVALID_TOKEN/)
  for (const principal of [{ identifier: 'AUTO', permissions: 'readonly' }, { identifier: '', permissions: 'admin' }, { identifier: 'reader', permissions: 'owner' }]) {
    f.identities.set('invalid-role', principal)
    assert.throws(() => f.access('invalid-role'), /PERMISSION_DENIED/)
  }
  for (const securityStrategy of [undefined, {}, { ...f.app.securityStrategy, isDummy: () => true }, { ...f.app.securityStrategy, isDummy: () => 'false' }, { ...f.app.securityStrategy, checkACL: undefined }, { ...f.app.securityStrategy, anyACLs: undefined }]) {
    assert.throws(() => createAccess({ securityStrategy }, 'Bearer reader-token'), /SIGNALK_SECURITY_UNAVAILABLE/)
  }
  f.app.securityStrategy.authorizeWS = connection => { connection.skPrincipal = { identifier: 'reader', permissions: 'readonly' } }
  assert.throws(() => f.access('reader-token'), /PERMISSION_DENIED/)
  f.app.securityStrategy.authorizeWS = connection => {
    connection.skIsAuthenticated = true
    connection.skPrincipal = { identifier: 'reader', permissions: 'readonly' }
    return Promise.resolve()
  }
  assert.throws(() => f.access('reader-token'), /SIGNALK_SECURITY_UNAVAILABLE/)
})

test('native ACL grants must be literal true, and unknown source is denied with ACLs', () => {
  const f = fixture(), access = f.access('reader-token')
  for (const answer of [false, undefined, 'true', 1, {}, Promise.resolve(true)]) {
    f.app.securityStrategy.checkACL = () => answer
    assert.equal(access.canRead('navigation.speedOverGround', 'public'), false)
  }
  f.app.securityStrategy.checkACL = () => true
  assert.equal(access.canRead('navigation.speedOverGround'), false)
  f.app.securityStrategy.anyACLs = () => false
  assert.equal(access.canRead('navigation.speedOverGround'), true)
  f.app.securityStrategy.anyACLs = () => Promise.resolve(false)
  assert.equal(access.canRead('navigation.speedOverGround'), false)
  f.app.securityStrategy.checkACL = () => { throw Error('do-not-return-secret') }
  assert.throws(() => access.canRead('navigation.speedOverGround', 'public'), /SIGNALK_SECURITY_UNAVAILABLE/)
})

test('selected values, discovery and alternate sources use exact native path/source permissions', () => {
  const f = fixture(), adapter = new SignalKAdapter(f.app, settings, f.access('reader-token'))
  assert.equal(adapter.read('navigation.speedOverGround').value, 3)
  assert.throws(() => adapter.read('navigation.hidden'), /PATH_UNAVAILABLE/)
  assert.throws(() => adapter.read('navigation.absent'), /PATH_UNAVAILABLE/)
  assert.deepEqual(adapter.paths(undefined, 0, 1), { paths: ['navigation.speedOverGround'], nextOffset: null, truncated: false })
  assert.deepEqual(adapter.sources('navigation.speedOverGround'), { path: 'navigation.speedOverGround', selectedSource: 'public', sources: ['public'], truncated: false })
  assert.ok(f.calls.some(c => c.path === 'navigation.speedOverGround' && c.source === 'private'))
  assert.ok(f.calls.every(c => c.context === 'vessels.self' && c.operation === 'read'))
  delete f.selected.$source
  assert.throws(() => adapter.read('navigation.speedOverGround'), /PATH_UNAVAILABLE/)
  assert.deepEqual(adapter.paths(undefined, 0, 10).paths, [])
})

test('source discovery bounds work and does not reveal denied-source counts through truncation', () => {
  const f = fixture(), adapter = new SignalKAdapter(f.app, settings, f.access('reader-token'))
  f.selected.values = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`hidden-${i}`, {}]))
  assert.deepEqual(adapter.sources('navigation.speedOverGround').sources, [])
  assert.equal(adapter.sources('navigation.speedOverGround').truncated, false)
  f.selected.values = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`hidden-${i}`, {}]))
  assert.throws(() => adapter.sources('navigation.speedOverGround'), /RESULT_TOO_LARGE/)
})

test('read-only MCP users cannot inspect host inventories or infer hidden paths through diagnosis', async t => {
  const f = fixture()
  Object.defineProperty(f.app, 'config', { get() { throw Error('host configuration touched') } })
  f.app.getProviderStatus = () => { throw Error('provider inventory touched') }
  f.app.getFeatures = () => { throw Error('plugin inventory touched') }
  const call = await connect(t, f.app, f.access('reader-token'))
  for (const name of ['list_connections', 'get_connection_status', 'list_plugins']) {
    assert.deepEqual(await call(name, name === 'get_connection_status' ? { id: 'hidden' } : {}), { ok: false, error: { code: 'ADMIN_REQUIRED' } })
  }
  assert.deepEqual((await call('get_server_info')).data.internalAdapter, { available: false, error: { code: 'ADMIN_REQUIRED' } })
  const allowed = await call('diagnose_missing_path', { path: 'navigation.speedOverGround' })
  assert.equal(allowed.ok, true)
  assert.deepEqual(allowed.data.providerContext, { available: false, error: { code: 'ADMIN_REQUIRED' } })
  const denied = await call('diagnose_missing_path', { path: 'navigation.hidden' })
  assert.deepEqual(denied, await call('diagnose_missing_path', { path: 'navigation.absent' }))
  assert.equal(denied.data.state, 'unavailable')
  assert.doesNotMatch(JSON.stringify(denied), /hidden-value|hidden-units|private|sensitive-plugin/)
  assert.equal((await call('get_security_status')).data.telemetryPolicy, 'native-path-and-source')
})

test('concurrent identities are isolated; role, identity, ACL and token changes apply to later calls', async t => {
  const f = fixture()
  const reader = await connect(t, f.app, f.access('reader-token'))
  const other = await connect(t, f.app, f.access('other-token'))
  const results = await Promise.all([
    reader('read_path', { path: 'navigation.speedOverGround' }),
    other('read_path', { path: 'navigation.speedOverGround' }),
    other('read_path', { path: 'navigation.hidden' })
  ])
  assert.equal(results[0].data.value, 3)
  assert.equal(results[1].error.code, 'PATH_UNAVAILABLE')
  assert.equal(results[2].data.value, 'hidden-value')
  f.app.securityStrategy.checkACL = () => false
  assert.equal((await reader('read_path', { path: 'navigation.speedOverGround' })).error.code, 'PATH_UNAVAILABLE')
  f.identities.set('reader-token', { identifier: 'another-user', permissions: 'admin' })
  assert.equal((await reader('get_server_info')).error.code, 'PERMISSION_DENIED')
  f.identities.delete('other-token')
  assert.equal((await other('get_server_info')).error.code, 'INVALID_TOKEN')
})

test('admin role does not bypass telemetry ACLs; pending admin inventory rechecks identity and role', async t => {
  const f = fixture(), call = await connect(t, f.app, f.access('admin-token'))
  assert.equal((await call('read_path', { path: 'navigation.hidden' })).error.code, 'PATH_UNAVAILABLE')
  let release, started
  const waiting = new Promise(resolve => { started = resolve })
  f.app.getFeatures = () => { started(); return new Promise(resolve => { release = resolve }) }
  const result = call('list_plugins')
  await waiting
  f.identities.set('admin-token', { identifier: 'admin', permissions: 'readonly' })
  release({ plugins: [{ id: 'must-not-leak' }] })
  assert.deepEqual(await result, { ok: false, error: { code: 'ADMIN_REQUIRED' } })
})

test('captured access expires on plugin lifecycle change', () => {
  const f = fixture(); let running = true
  const access = createAccess(f.app, 'Bearer reader-token', () => running)
  assert.equal(access.check().permissions, 'readonly')
  running = false
  assert.throws(() => access.canRead('navigation.speedOverGround', 'public'), /PLUGIN_DISABLED/)
})
