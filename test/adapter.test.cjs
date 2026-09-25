const { test } = require('node:test')
const assert = require('node:assert/strict')
const { SignalKAdapter } = require('../dist/adapter.js')
const { settingsSchema, safeCopy, pathSchema } = require('../dist/safety.js')
const settings = settingsSchema.parse({ allowedHosts: ['localhost:3000'] })
test('native values, freshness, sources and path discovery', () => {
  const leaf = { value: 2, timestamp: new Date(Date.now() - 600000).toISOString(), $source: 'sensor', meta: { units: 'm/s' }, values: { sensor: { value: 2 } } }
  const app = { getSelfPath: p => ({ navigation: { speedOverGround: leaf }, 'navigation.speedOverGround': leaf })[p] }
  const a = new SignalKAdapter(app, settings)
  assert.equal(a.read('navigation.speedOverGround').stale, true)
  assert.equal(a.read('navigation.speedOverGround').units, 'm/s')
  assert.deepEqual(a.paths(undefined, 0, 10).paths, ['navigation.speedOverGround'])
  assert.deepEqual(a.sources('navigation.speedOverGround').sources, ['sensor'])
  assert.throws(() => a.read('navigation.missing'), /NOT_FOUND/)
  assert.throws(() => a.read('security.token'), /PATH_NOT_ALLOWED/)
})
test('missing timestamp remains unknown and null value is preserved', () => {
  const a = new SignalKAdapter({ getSelfPath: () => ({ value: null }) }, settings)
  assert.equal(a.read('navigation.speedOverGround').stale, null)
  assert.equal(a.read('navigation.speedOverGround').value, null)
})
test('async official plugin inventory is projected; config never escapes', async () => {
  const a = new SignalKAdapter({ getFeatures: async () => ({ plugins: [{ id: 'test', name: 'Test Plugin', enabled: false, version: '1.0', password: 'hidden' }] }) }, settings)
  assert.deepEqual(await a.plugins(), { plugins: [{ id: 'test', name: 'Test Plugin', enabled: false, version: '1.0' }], truncated: false })
  const b = new SignalKAdapter({ getFeatures: () => ({ plugins: {} }) }, settings)
  await assert.rejects(b.plugins(), /UNSUPPORTED/)
})
test('plugin names are nullable and bounded', async () => {
  const a = new SignalKAdapter({ getFeatures: async () => ({ plugins: [
    { id: 'missing' }, { id: 'invalid', name: 42 }, { id: 'long', name: 'x'.repeat(300) }
  ] }) }, settings)
  const { plugins } = await a.plugins()
  assert.equal(plugins[0].name, null)
  assert.equal(plugins[1].name, null)
  assert.equal(plugins[2].name, 'x'.repeat(256))
})
test('bounded redaction and hostile path handling', () => {
  assert.equal(safeCopy({ apiKey: 'hidden' }).apiKey, '[REDACTED]')
  assert.equal(safeCopy('https://user:pass@example.test'), 'https://[REDACTED]@example.test')
  const circular = {}; circular.loop = circular
  assert.throws(() => safeCopy(circular), /INVALID_DATA/)
  assert.throws(() => safeCopy('x'.repeat(4097)), /RESULT_TOO_LARGE/)
  assert.equal(pathSchema.safeParse('navigation.__proto__.x').success, false)
  assert.equal(pathSchema.safeParse('../config').success, false)
})
test('discovery caps cycles and paginates results', () => {
  const root = { a: { value: 1 }, b: { value: 2 } }; root.loop = root
  const a = new SignalKAdapter({ getSelfPath: () => root }, { ...settings, pathPrefixes: ['navigation'] })
  const result = a.paths(undefined, 0, 1)
  assert.equal(result.paths.length, 1)
  assert.equal(result.nextOffset, 1)
  assert.equal(result.truncated, true)
})
