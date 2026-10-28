const { test } = require('node:test')
const assert = require('node:assert/strict')
const { WebSocketServer } = require('ws')
const { verifyLogAccess } = require('../scripts/verify-server-logs.cjs')

async function fixture(t, connected) {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 })
  await new Promise(resolve => server.once('listening', resolve))
  t.after(() => new Promise(resolve => { for (const client of server.clients) client.terminate(); server.close(resolve) }))
  server.on('connection', connected)
  return `ws://127.0.0.1:${server.address().port}/signalk/v1/stream`
}
test('log probe verifies subscription without returning log contents or credentials', async t => {
  const url = await fixture(t, (ws, request) => {
    assert.equal(request.headers.authorization, 'Bearer synthetic-test-token')
    assert.equal(request.url, '/signalk/v1/stream?subscribe=none')
    assert.equal(request.headers['x-mcp-ops-key'], undefined)
    ws.on('message', bytes => {
      assert.deepEqual(JSON.parse(bytes), { context: 'vessels.self', subscribe: [{ path: 'log' }] })
      ws.send(JSON.stringify({ type: 'LOG', data: { ts: 'Oct 26 12:00:00', row: 'password=never-print-this', isError: true } }))
    })
  })
  const result = await verifyLogAccess({ url, token: 'synthetic-test-token' })
  assert.equal(result.logAccessVerified, true)
  assert.equal(result.observedStderrChunks, 1)
  assert.equal(result.logContentReturned, false)
  assert.ok(!JSON.stringify(result).includes('never-print-this'))
  assert.ok(!JSON.stringify(result).includes('synthetic-test-token'))
})
test('log probe distinguishes rejected access from an empty observation', async t => {
  const denied = await fixture(t, ws => ws.on('message', () => ws.send(JSON.stringify({ errorMessage: 'secret-bearing rejection' }))))
  const result = await verifyLogAccess({ url: denied, token: 'test' })
  assert.equal(result.status, 'denied')
  assert.ok(!JSON.stringify(result).includes('secret-bearing'))
  const quiet = await fixture(t, () => {})
  assert.equal((await verifyLogAccess({ url: quiet, token: 'test', timeoutMs: 100 })).status, 'inconclusive')
})
test('log probe rejects unsafe configuration before connecting', async () => {
  for (const url of ['ws://example.test/signalk/v1/stream', 'wss://user:pass@example.test/signalk/v1/stream',
    'wss://example.test/signalk/v1/stream?token=secret', 'wss://example.test/wrong']) {
    assert.equal((await verifyLogAccess({ url, token: 'test' })).code, 'INVALID_CONFIGURATION')
  }
  assert.equal((await verifyLogAccess({ url: 'wss://example.test/signalk/v1/stream', token: 'a\nb' })).code, 'INVALID_CONFIGURATION')
})
test('log probe refuses redirects without sending credentials to a second server', async t => {
  const http = require('node:http')
  const server = http.createServer()
  let attempts = 0
  server.on('upgrade', (_request, socket) => {
    attempts++
    socket.end('HTTP/1.1 302 Found\r\nLocation: ws://127.0.0.1:1/signalk/v1/stream\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const result = await verifyLogAccess({ url: `ws://127.0.0.1:${server.address().port}/signalk/v1/stream`, token: 'test' })
  assert.equal(result.code, 'HTTP_UPGRADE_REJECTED')
  assert.equal(attempts, 1)
})
test('log probe bounds oversized and excessive messages without exposing payloads', async t => {
  const oversized = await fixture(t, ws => ws.on('message', () => ws.send('secret'.repeat(12000))))
  const result = await verifyLogAccess({ url: oversized, token: 'test' })
  assert.equal(result.status, 'failed')
  assert.ok(!JSON.stringify(result).includes('secret'))
  const noisy = await fixture(t, ws => ws.on('message', () => {
    for (let i = 0; i < 201; i++) ws.send('{}')
  }))
  assert.equal((await verifyLogAccess({ url: noisy, token: 'test' })).code, 'MESSAGE_LIMIT')
})
