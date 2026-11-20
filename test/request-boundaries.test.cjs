const { securityStrategy, token, permitRouter } = require('./auth-fixture.cjs')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const factory = require('../dist/index.js')

test('malformed, oversized and host-preparsed bodies return bounded generic responses', async t => {
  const previous = process.env.SIGNALK_MCP_OPS_KEY
  const key = 'synthetic-boundary-test-'.repeat(3)
  process.env.SIGNALK_MCP_OPS_KEY = key
  t.after(() => { if (previous === undefined) delete process.env.SIGNALK_MCP_OPS_KEY; else process.env.SIGNALK_MCP_OPS_KEY = previous })
  for (const preparsed of [false, true]) {
    const app = express(), router = permitRouter(express.Router())
    if (preparsed) app.use(express.json({ limit: '256kb' }))
    const plugin = factory({ securityStrategy, setPluginStatus() {}, setPluginError() {} })
    plugin.registerWithRouter(router); app.use('/plugins/signalk-mcp-ops', router)
    const listener = app.listen(0, '127.0.0.1')
    await new Promise(resolve => listener.once('listening', resolve))
    const host = `127.0.0.1:${listener.address().port}`
    const url = `http://${host}/plugins/signalk-mcp-ops/mcp`
    plugin.start({ allowedHosts: [host] })
    try {
      const post = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-MCP-Ops-Key': key, Authorization: `Bearer ${token}` }, body })
      const oversized = await post(JSON.stringify({ value: 'x'.repeat(70000) }))
      assert.equal(oversized.status, 413)
      assert.ok((await oversized.text()).length < 100)
      if (!preparsed) {
        const malformed = await post('{"secret":"do-not-echo",')
        assert.equal(malformed.status, 400)
        assert.deepEqual(await malformed.json(), { error: 'INVALID_JSON' })
      }
      // Signal K can reject input before the plugin; only plugin-owned parsing is covered above.
    } finally {
      await plugin.stop(); listener.closeAllConnections()
      await new Promise(resolve => listener.close(resolve))
    }
  }
})
