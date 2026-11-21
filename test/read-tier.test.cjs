const { adminAccess, securityStrategy, token } = require('./auth-fixture.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { SignalKAdapter } = require('../dist/adapter.js')
const { createAccess } = require('../dist/auth.js')
const { settingsSchema } = require('../dist/safety.js')
const { toDisplay } = require('../dist/units.js')
const { USAGE_GUIDE } = require('../dist/guide.js')
const { createServer } = require('../dist/tools.js')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { InMemoryTransport } = require('@modelcontextprotocol/sdk/inMemory.js')

const settings = settingsSchema.parse({ allowedHosts: ['localhost:3000'] })
const now = () => new Date().toISOString()
const leaf = (value, units, extra = {}) => ({ value, timestamp: now(), $source: 'n2k.1', meta: units ? { units, ...extra } : extra })
const tree = {
  navigation: {
    speedOverGround: leaf(3, 'm/s', { displayName: 'SOG' }),
    headingTrue: leaf(Math.PI / 2, 'rad'),
    position: leaf({ latitude: 52.1, longitude: 4.3 })
  },
  environment: { depth: { belowTransducer: leaf(4.2, 'm') }, outside: { pressure: leaf(101325, 'Pa') } },
  electrical: { batteries: {
    house: { voltage: leaf(12.8, 'V', { displayName: 'House battery voltage' }), capacity: { stateOfCharge: leaf(0.83, 'ratio') } },
    start: { voltage: leaf(12.6, 'V') }
  } },
  tanks: { freshWater: { '0': { currentLevel: leaf(0.4, 'ratio'), capacity: leaf(0.2, 'm3') } } },
  propulsion: { port: { revolutions: leaf(30, 'Hz'), temperature: leaf(353.15, 'K') } },
  notifications: {
    navigation: { anchor: leaf({ state: 'alarm', method: ['visual', 'sound'], message: 'Anchor drag' }) },
    tanks: { low: leaf({ state: 'warn', method: ['visual'], message: 'Low fuel' }) },
    engine: { ok: leaf({ state: 'normal', method: [], message: 'Fine' }) },
    emergency: { mob: leaf({ state: 'emergency', method: ['sound'], message: 'MOB' }) }
  }
}
const getSelfPath = p => p.split('.').reduce((n, k) => n && Object.hasOwn(n, k) ? n[k] : undefined, tree)
const app = { getSelfPath }

test('display conversions cover common marine units and leave native unknowns alone', () => {
  assert.deepEqual(toDisplay('navigation.speedOverGround', 1, 'm/s'), { value: 1.94, units: 'kn' })
  assert.deepEqual(toDisplay('navigation.headingTrue', Math.PI, 'rad'), { value: 180, units: '°' })
  assert.deepEqual(toDisplay('environment.water.temperature', 293.15, 'K'), { value: 20, units: '°C' })
  assert.deepEqual(toDisplay('environment.outside.pressure', 101325, 'Pa'), { value: 1013.3, units: 'hPa' })
  assert.deepEqual(toDisplay('propulsion.port.oilPressure', 300000, 'Pa'), { value: 3, units: 'bar' })
  assert.deepEqual(toDisplay('propulsion.port.revolutions', 30, 'Hz'), { value: 1800, units: 'rpm' })
  assert.deepEqual(toDisplay('navigation.log', 1852, 'm'), { value: 1, units: 'nm' })
  assert.equal(toDisplay('environment.depth.belowKeel', 3, 'm'), null)
  assert.equal(toDisplay('navigation.position', { latitude: 1 }, null), null)
  assert.equal(toDisplay('x', Number.NaN, 'm/s'), null)
})

test('search matches path segments and meta labels, ranked and bounded', () => {
  const a = new SignalKAdapter(app, settings, adminAccess())
  const r = a.search('battery voltage', undefined, 10)
  assert.equal(r.matches[0].path, 'electrical.batteries.house.voltage')
  assert.equal(r.matches[0].displayName, 'House battery voltage')
  assert.equal(a.search('SOG', undefined, 10).matches[0].path, 'navigation.speedOverGround')
  assert.equal(a.search('voltage', undefined, 1).matches.length, 1)
  assert.equal(a.search('voltage', undefined, 1).total, 2)
  assert.throws(() => a.search('voltage', 'security', 5), /PATH_NOT_ALLOWED/)
  assert.throws(() => a.search('  ', undefined, 5), /INVALID_DATA/)
})

test('read_paths returns per-entry results and optional display values', () => {
  const a = new SignalKAdapter(app, settings, adminAccess())
  const { readings } = a.readMany(['navigation.speedOverGround', 'navigation.missing', 'security.token'], true)
  assert.equal(readings[0].ok, true)
  assert.deepEqual(readings[0].display, { value: 5.83, units: 'kn' })
  assert.deepEqual(readings[1], { ok: false, path: 'navigation.missing', error: { code: 'NOT_FOUND' } })
  assert.deepEqual(readings[2].error, { code: 'PATH_NOT_ALLOWED' })
  assert.equal(Object.hasOwn(a.readMany(['navigation.speedOverGround'], false).readings[0], 'display'), false)
})

test('alarms are sorted by severity and normal states are filtered', () => {
  const a = new SignalKAdapter(app, settings, adminAccess())
  const r = a.alarms(false, 50)
  assert.deepEqual(r.alarms.map(x => x.state), ['emergency', 'alarm', 'warn'])
  assert.equal(r.alarms[1].message, 'Anchor drag')
  assert.equal(a.alarms(true, 50).total, 4)
  const noNotifications = new SignalKAdapter(app, { ...settings, pathPrefixes: ['navigation'] }, adminAccess())
  assert.throws(() => noNotifications.alarms(false, 5), /PATH_NOT_ALLOWED/)
})

test('overview groups well-known paths and discovers instances', () => {
  const o = new SignalKAdapter(app, settings, adminAccess()).overview()
  assert.deepEqual(o.navigation.speedOverGround.display, { value: 5.83, units: 'kn' })
  assert.deepEqual(o.navigation.position.value, { latitude: 52.1, longitude: 4.3 })
  assert.equal(o.environment.depthBelowTransducer.value, 4.2)
  assert.equal(o.batteries.house.stateOfCharge.display.value, 83)
  assert.equal(o.batteries.start.voltage.value, 12.6)
  assert.equal(o.tanks.freshWater['0'].level.display.value, 40)
  assert.equal(o.engines.port.revolutions.display.value, 1800)
  assert.equal(o.alarms.active, 3)
  assert.equal(o.alarms.highest, 'emergency')
  assert.equal(Object.hasOwn(o.navigation, 'headingMagnetic'), false)
  const narrow = new SignalKAdapter(app, { ...settings, pathPrefixes: ['navigation'] }, adminAccess()).overview()
  assert.deepEqual(narrow.batteries, {})
  assert.equal(narrow.alarms.available, false)
})

test('new tools respect native path ACLs for non-admin users', () => {
  const strategy = { ...securityStrategy,
    anyACLs: () => true,
    authorizeWS(c) { securityStrategy.authorizeWS(c); c.skPrincipal = { identifier: 'crew', permissions: 'readonly' } },
    checkACL: (_id, _ctx, path) => !path.startsWith('electrical') && path !== 'notifications.emergency.mob' }
  const a = new SignalKAdapter(app, settings, createAccess({ securityStrategy: strategy }, `Bearer ${token}`))
  assert.equal(a.search('voltage', undefined, 10).total, 0)
  assert.deepEqual(a.overview().batteries, {})
  assert.deepEqual(a.alarms(false, 10).alarms.map(x => x.path), ['notifications.navigation.anchor', 'notifications.tanks.low'])
  assert.equal(a.readMany(['electrical.batteries.house.voltage'], false).readings[0].error.code, 'PATH_UNAVAILABLE')
})

test('guide fits the string bound and is served as tool and resource', async t => {
  assert.ok(USAGE_GUIDE.length < 4096)
  const server = createServer(app, settings, adminAccess())
  const client = new Client({ name: 'test', version: '1' })
  const [x, y] = InMemoryTransport.createLinkedPair(); await server.connect(x); await client.connect(y)
  t.after(async () => { await client.close(); await server.close() })
  assert.match(client.getInstructions(), /get_vessel_overview/)
  const tools = (await client.listTools()).tools
  assert.ok(tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.destructiveHint))
  assert.equal((await client.callTool({ name: 'get_usage_guide', arguments: {} })).structuredContent.data.guide, USAGE_GUIDE)
  const resource = await client.readResource({ uri: 'signalk-mcp-ops://guide' })
  assert.equal(resource.contents[0].text, USAGE_GUIDE)
  const overview = (await client.callTool({ name: 'get_vessel_overview', arguments: {} })).structuredContent
  assert.equal(overview.ok, true)
  const batch = (await client.callTool({ name: 'read_paths', arguments: { paths: ['navigation.speedOverGround', 'navigation.speedOverGround'] } })).structuredContent
  assert.equal(batch.data.readings.length, 1)
  assert.equal((await client.callTool({ name: 'read_paths', arguments: { paths: Array(26).fill('navigation.x') } })).isError, true)
})
