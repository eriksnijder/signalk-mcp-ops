const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { createRequire } = require('node:module')

const root = path.resolve(__dirname, '..')
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-mcp-package-'))
function npm(args, cwd) {
  if (!process.env.npm_execpath) throw new Error('Run through npm run verify:package')
  const command = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024
  })
  if (command.error || command.status !== 0) throw new Error(`Package verification npm step failed: ${args[0]}`)
  return command.stdout
}
async function main() {
  const [packed] = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', temp], root))
  const paths = packed.files.map(file => file.path)
  assert.ok(paths.includes('dist/index.js') && paths.includes('dist/internal/signalK231Adapter.js'))
  assert.ok(paths.every(file => /^(dist\/|docs\/|icon\.png$|(?:README|SPEC|ARCHITECTURE|SECURITY|CONTRIBUTING|CHANGELOG)\.md$|LICENSE$|package\.json$)/.test(file)))
  assert.ok(!paths.some(file => /(?:^|\/)(?:\.env|node_modules|test|src)(?:[./]|$)|\.(?:pem|key|log)$/.test(file)))
  fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ name: 'package-consumer-check', private: true }))
  npm(['install', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', '--fetch-retries=0', '--fetch-timeout=30000', path.join(temp, packed.filename)], temp)
  const installed = createRequire(path.join(temp, 'package.json'))
  const pkg = installed('signalk-mcp-ops/package.json')
  assert.equal(pkg.version, require('../package.json').version)
  assert.equal(pkg.signalk.appIcon, './icon.png')
  assert.ok(paths.includes('icon.png'), 'Declared App Store icon must ship in the tarball')
  const icon = fs.readFileSync(path.join(temp, 'node_modules/signalk-mcp-ops/icon.png'))
  assert.equal(icon.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.equal(icon.readUInt32BE(16), icon.readUInt32BE(20))
  assert.ok(icon.readUInt32BE(16) >= 128 && icon.length < 1024 * 1024)
  for (const hook of ['preinstall', 'install', 'postinstall']) assert.equal(pkg.scripts[hook], undefined)
  const express = installed('express')
  const { Client } = installed('@modelcontextprotocol/sdk/client/index.js')
  const { StreamableHTTPClientTransport } = installed('@modelcontextprotocol/sdk/client/streamableHttp.js')
  const factory = installed('signalk-mcp-ops')
  const app = express(), router = express.Router()
  const plugin = factory({ getSelfPath: () => ({ value: 3 }), getFeatures: async () => ({ plugins: [] }), setPluginStatus() {}, setPluginError() {} })
  plugin.registerWithRouter(router)
  app.use('/plugins/signalk-mcp-ops', router)
  const listener = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { listener.once('listening', resolve); listener.once('error', reject) })
  const previousKey = process.env.SIGNALK_MCP_OPS_KEY
  const key = 'synthetic-package-test-'.repeat(3)
  process.env.SIGNALK_MCP_OPS_KEY = key
  const host = `127.0.0.1:${listener.address().port}`
  const url = new URL(`http://${host}/plugins/signalk-mcp-ops/mcp`)
  const client = new Client({ name: 'package-check', version: '1' })
  try {
    plugin.start({ allowedHosts: [host] })
    assert.equal((await fetch(url, { method: 'POST' })).status, 401)
    await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { 'X-MCP-Ops-Key': key } } }))
    assert.equal(client.getServerVersion().version, pkg.version)
    assert.equal((await client.listTools()).tools.length, 9)
    assert.equal((await client.callTool({ name: 'get_server_info', arguments: {} })).structuredContent.data.pluginVersion, pkg.version)
    assert.equal((await client.callTool({ name: 'read_path', arguments: { path: 'navigation.speedOverGround' } })).structuredContent.data.value, 3)
    assert.equal(plugin.getOpenApi().info.version, pkg.version)
    console.log(`Verified ${packed.filename}: ${packed.entryCount} files; clean consumer install; authenticated MCP handshake and 9 tools.`)
  } finally {
    await client.close()
    await plugin.stop()
    listener.closeAllConnections()
    await new Promise(resolve => listener.close(resolve))
    if (previousKey === undefined) delete process.env.SIGNALK_MCP_OPS_KEY
    else process.env.SIGNALK_MCP_OPS_KEY = previousKey
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => {
  // Only delete the specific directory created by mkdtemp above.
  const expectedParent = fs.realpathSync(os.tmpdir())
  if (fs.realpathSync(path.dirname(temp)) !== expectedParent || !path.basename(temp).startsWith('signalk-mcp-package-')) {
    throw new Error('Unexpected temporary directory; refusing cleanup')
  }
  fs.rmSync(temp, { recursive: true, force: true })
})
