const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const factory = require('../dist/index.js')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js')

test('real MCP client handshake, tools, isolation, rejection and lifecycle', async t => {
  const previous = process.env.SIGNALK_MCP_OPS_KEY
  const key = 'test-only-'.repeat(5)
  process.env.SIGNALK_MCP_OPS_KEY = key
  t.after(() => { if (previous === undefined) delete process.env.SIGNALK_MCP_OPS_KEY; else process.env.SIGNALK_MCP_OPS_KEY = previous })
  const app = express(); const router = express.Router()
  const plugin = factory({ getSelfPath: p => p === 'navigation.speedOverGround' ? { value: 3 } : undefined,
    getFeatures: async () => ({ plugins: [{ id: 'sample', name: 'Sample Plugin', enabled: true, version: '1' }] }), setPluginStatus() {}, setPluginError() {} })
  plugin.registerWithRouter(router); app.use('/plugins/signalk-mcp-ops', router)
  const listener = app.listen(0, '127.0.0.1'); await new Promise(resolve => listener.once('listening', resolve))
  t.after(async () => { await plugin.stop(); listener.closeAllConnections(); await new Promise(resolve => listener.close(resolve)) })
  const host = `127.0.0.1:${listener.address().port}`
  const url = new URL(`http://${host}/plugins/signalk-mcp-ops/mcp`)
  const post = (headers = {}, body = '{}') => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body })
  assert.equal((await post()).status, 503)
  plugin.start({ allowedHosts: [host] })
  assert.equal((await post()).status, 401)
  assert.equal((await post({ 'X-MCP-Ops-Key': 'wrong' })).status, 401)
  assert.equal((await post({ 'X-MCP-Ops-Key': key, Origin: 'https://evil.test' })).status, 403)
  const rejectedHost = await new Promise((resolve, reject) => {
    const req = require('node:http').request(url, { method: 'POST', headers: { Host: 'evil.test', 'X-MCP-Ops-Key': key } }, res => { res.resume(); resolve(res.statusCode) })
    req.on('error', reject); req.end()
  })
  assert.equal(rejectedHost, 403)
  assert.equal((await fetch(url, { headers: { 'X-MCP-Ops-Key': key } })).status, 405)
  const client = new Client({ name: 'test', version: '1' })
  await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { 'X-MCP-Ops-Key': key } } }))
  t.after(() => client.close())
  const tools = await client.listTools()
  assert.equal(tools.tools.length, 9)
  assert.deepEqual(tools.tools.map(tool => tool.name).sort(), [
    'diagnose_missing_path', 'get_connection_status', 'get_security_status', 'get_server_info',
    'inspect_path_sources', 'list_connections', 'list_paths', 'list_plugins', 'read_path'
  ])
  assert.ok(tools.tools.every(t => t.annotations.readOnlyHint && !t.annotations.destructiveHint))
  const call = (name, args = {}) => client.callTool({ name, arguments: args })
  const read = await call('read_path', { path: 'navigation.speedOverGround' })
  assert.equal(read.structuredContent.data.value, 3)
  const inventory = (await call('list_plugins')).structuredContent.data.plugins
  assert.deepEqual(inventory[0], { id: 'sample', name: 'Sample Plugin', version: '1', enabled: true })
  assert.equal((await call('diagnose_missing_path', { path: 'navigation.missing' })).structuredContent.data.state, 'missing')
  for (const name of ['get_connection', 'get_plugin_status', 'get_plugin_config', 'get_recent_errors']) {
    assert.equal((await call(name, { id: 'sample' })).isError, true)
  }
  assert.equal((await call('read_path', { path: 'security.password' })).structuredContent.error.code, 'PATH_NOT_ALLOWED')
  assert.equal((await call('read_path', { path: '../config' })).isError, true)
  assert.equal((await call('restart_server')).isError, true)
  await plugin.stop()
  assert.equal((await post({ 'X-MCP-Ops-Key': key })).status, 503)
  plugin.start({ allowedHosts: [host] })
  assert.equal((await call('get_server_info')).structuredContent.data.readOnly, true)
  plugin.start({ allowedHosts: [] })
  assert.equal((await post({ 'X-MCP-Ops-Key': key })).status, 503)
  delete process.env.SIGNALK_MCP_OPS_KEY
  plugin.start({ allowedHosts: [host] })
  assert.equal((await post({ 'X-MCP-Ops-Key': key })).status, 503)
})
