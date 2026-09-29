const { test } = require('node:test')
const assert = require('node:assert/strict')
const { SignalK231Adapter } = require('../dist/internal/signalK231Adapter.js')
const { createServer } = require('../dist/tools.js')
const { settingsSchema } = require('../dist/safety.js')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js')
// Synthetic fixtures model v2.31.0 interfaces/providers.ts and index.ts.
function fixture() {
  return { config: { settings: { pipedProviders: [
    { id: 'input', enabled: true, pipeElements: [{ type: 'providers/simple', options: { type: 'NMEA0183', subOptions: { password: 'secret-password', token: 'secret-token', apiKey: 'secret-api-key', username: 'secret-user', host: 'private-host', path: '/private/path' } } }] },
    { id: 'disabled', enabled: false, pipeElements: [{ type: 'providers/simple', options: { type: 'SignalK' } }] },
    { id: 'implicit', pipeElements: [{ type: 'providers/custom' }] }
  ] } }, getProviderStatus() { return [
    { id: 'input', type: 'error', statusType: 'provider', message: 'password=secret-password token=secret-token', timeStamp: '2026-09-25T10:00:00.000Z', lastError: 'secret-user secret-api-key', lastErrorTimeStamp: '2026-09-25T09:00:00.000Z' },
    { id: 'disabled', type: 'status', statusType: 'provider', message: 'Stopped' },
    { id: 'implicit', type: 'status', statusType: 'plugin', message: 'Connected' }
  ] } }
}
test('2.31 inventory allowlist, enabled defaults, error/history and unknown status', () => {
  const a = new SignalK231Adapter(fixture())
  assert.deepEqual(a.connections(), [{ id: 'input', enabled: true, type: 'NMEA0183' }, { id: 'disabled', enabled: false, type: 'SignalK' }, { id: 'implicit', enabled: true, type: 'providers/custom' }])
  const status = a.connectionStatus('input')
  assert.equal(status.status, 'error'); assert.equal(status.type, 'error')
  assert.equal(status.timeStamp, '2026-09-25T10:00:00.000Z')
  assert.equal(status.lastErrorTimeStamp, '2026-09-25T09:00:00.000Z')
  assert.match(status.lastError, /withheld/)
  assert.equal(a.connectionStatus('disabled').message, 'Stopped')
  assert.equal(a.connectionStatus('disabled').status, 'reported')
  assert.equal(a.connectionStatus('implicit').status, 'unknown')
  assert.throws(() => a.connectionStatus('absent'), /NOT_FOUND/)
  assert.equal(a.compatibility().compatible, true)
})
test('missing/malformed internals fail closed without invoking getters', () => {
  for (const runtime of [{}, { config: { settings: { pipedProviders: {} } } }, { ...fixture(), getProviderStatus: undefined }, { ...fixture(), getProviderStatus: () => ({}) }, { ...fixture(), getProviderStatus: () => [{ id: 'input', type: 'healthy', statusType: 'provider' }] }]) {
    const a = new SignalK231Adapter(runtime)
    assert.equal(a.compatibility().compatible, false)
    assert.throws(() => a.connectionStatus('input'), /UNSUPPORTED/)
    assert.equal(a.context().available, false)
  }
  const f = fixture(); let invoked = false
  Object.defineProperty(f.config.settings.pipedProviders[0], 'id', { get() { invoked = true; return 'input' } })
  assert.throws(() => new SignalK231Adapter(f).connections(), /UNSUPPORTED/)
  assert.equal(invoked, false)
  for (const mutate of [
    f => { f.config.settings.pipedProviders[0].enabled = 'yes' },
    f => { f.config.settings.pipedProviders.push(f.config.settings.pipedProviders[0]) },
    f => { f.config.settings.pipedProviders[0].pipeElements = [] },
    f => { f.getProviderStatus = () => [{ id: 'input', type: 'status', statusType: 'provider', message: {} }] },
    f => { f.getProviderStatus = () => { throw Error('secret-token') } }
  ]) { const f = fixture(); mutate(f); assert.equal(new SignalK231Adapter(f).compatibility().code, 'UNSUPPORTED') }
})
test('bounds reject oversized inventories/identities and withhold long arbitrary messages', () => {
  const f = fixture(); f.config.settings.pipedProviders[0].id = 'x'.repeat(257)
  assert.throws(() => new SignalK231Adapter(f).connections(), /RESULT_TOO_LARGE/)
  f.config.settings.pipedProviders = Array(101).fill(null)
  assert.throws(() => new SignalK231Adapter(f).connections(), /RESULT_TOO_LARGE/)
  const g = fixture(); g.getProviderStatus = () => Array(1001).fill(null)
  assert.equal(new SignalK231Adapter(g).context().error.code, 'RESULT_TOO_LARGE')
  g.getProviderStatus = () => [{ id: 'input', statusType: 'provider', type: 'error', message: 'secret-token'.repeat(10000) }]
  assert.ok(new SignalK231Adapter(g).connectionStatus('input').message.length < 100)
})
test('MCP outputs exclude configuration and secrets; diagnoses preserve states and uncertainty', async t => {
  const f = fixture()
  f.getSelfPath = path => path.endsWith('missing') ? undefined : { value: 1, $source: 'input.II', values: { 'input.II': {} }, ...(path.endsWith('fresh') ? { timestamp: new Date().toISOString() } : path.endsWith('stale') ? { timestamp: '2020-01-01T00:00:00Z' } : {}) }
  f.getFeatures = async () => ({ plugins: [] })
  const server = createServer(f, settingsSchema.parse({ allowedHosts: ['localhost'] }))
  const client = new Client({ name: 'provider-test', version: '1' })
  const [a,b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b)
  t.after(async () => { await client.close(); await server.close() })
  const call = async (name, args = {}) => {
    const result = await client.callTool({ name, arguments: args })
    assert.doesNotMatch(JSON.stringify(result), /secret-password|secret-token|secret-api-key|secret-user|private-host|private\/path|subOptions|"options"/)
    return result.structuredContent
  }
  assert.equal((await client.listTools()).tools.length, 9)
  assert.equal((await call('list_connections')).data.connections.length, 3)
  assert.equal((await call('get_connection_status', { id: 'input' })).data.status, 'error')
  assert.equal((await call('get_server_info')).data.internalAdapter.compatible, true)
  for (const [suffix, state] of [['missing','missing'], ['fresh','fresh'], ['stale','stale'], ['unknown','unknown_freshness']]) {
    const result = (await call('diagnose_missing_path', { path: 'navigation.' + suffix })).data
    assert.equal(result.state, state)
    assert.equal(result.providerContext.assessment.enabledErrorCount, 1)
    if (suffix !== 'missing') {
      assert.equal(result.sources.selectedSource, 'input.II')
      assert.equal(result.providerContext.correlations[0].proven, false)
      assert.deepEqual(result.providerContext.correlations[0].candidateConnectionIds, ['input'])
    }
  }
  delete f.getProviderStatus
  assert.equal((await call('get_connection_status', { id: 'input' })).error.code, 'UNSUPPORTED')
  const unavailable = (await call('diagnose_missing_path', { path: 'navigation.missing' })).data
  assert.equal(unavailable.state, 'missing'); assert.equal(unavailable.providerContext.available, false)
  f.config.settings.pipedProviders = Array.from({length:100}, (_,i) => ({ id: String(i).padEnd(256,'x'), enabled:true, pipeElements:[{type:'y'.repeat(256)}] }))
  assert.equal((await call('list_connections')).error.code, 'RESULT_TOO_LARGE')
})
