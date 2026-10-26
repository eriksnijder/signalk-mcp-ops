const WebSocket = require('ws')

// Developer/operator probe only. Never output server text, tokens, URLs or errors.
async function verifyLogAccess({ url, token, timeoutMs = 5000 }) {
  const result = (status, code, count = 0, stderr = 0) => ({
    status, code, logAccessVerified: status === 'verified',
    observedLogChunks: count, observedStderrChunks: stderr, logContentReturned: false
  })
  let endpoint
  try {
    endpoint = new URL(url)
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
    if (!(endpoint.protocol === 'wss:' || (local && endpoint.protocol === 'ws:')) ||
        endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
        endpoint.pathname !== '/signalk/v1/stream' ||
        typeof token !== 'string' || !token.trim() || /[\r\n]/.test(token) || token.length > 16384 ||
        !Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 15000) throw new Error()
  } catch { return result('failed', 'INVALID_CONFIGURATION') }
  endpoint.search = '?subscribe=none'
  return new Promise(resolve => {
    let ws, timer, settled = false, messages = 0
    const finish = value => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (ws && ws.readyState !== WebSocket.CLOSED) ws.terminate()
      resolve(value)
    }
    try {
      ws = new WebSocket(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
        followRedirects: false, handshakeTimeout: timeoutMs,
        maxPayload: 65536, perMessageDeflate: false
      })
    } catch { finish(result('failed', 'CONNECTION_FAILED')); return }
    timer = setTimeout(() => finish(result('inconclusive', 'NO_LOG_ENTRY_OBSERVED')), timeoutMs)
    ws.on('error', () => finish(result('failed', 'CONNECTION_OR_PROTOCOL_ERROR')))
    ws.on('unexpected-response', (_request, response) => {
      const status = response.statusCode
      response.destroy()
      finish(result(status === 401 || status === 403 ? 'denied' : 'failed',
        status === 401 || status === 403 ? 'HTTP_AUTH_DENIED' : 'HTTP_UPGRADE_REJECTED'))
    })
    ws.on('open', () => ws.send(JSON.stringify({ context: 'vessels.self', subscribe: [{ path: 'log' }] })))
    ws.on('message', bytes => {
      if (++messages > 200) { finish(result('inconclusive', 'MESSAGE_LIMIT')); return }
      let message
      try { message = JSON.parse(bytes.toString()) } catch { return }
      if (!message || typeof message !== 'object') return
      if (typeof message.errorMessage === 'string') { finish(result('denied', 'SUBSCRIPTION_REJECTED')); return }
      if (message.type === 'LOG' && message.data && typeof message.data.ts === 'string' && typeof message.data.row === 'string') {
        finish(result('verified', 'LOG_ENTRY_OBSERVED', 1, message.data.isError === true ? 1 : 0))
      }
    })
    ws.on('close', () => finish(result('inconclusive', 'CONNECTION_CLOSED')))
  })
}

module.exports = { verifyLogAccess }
if (require.main === module) {
  verifyLogAccess({ url: process.env.SIGNALK_LOG_PROBE_URL, token: process.env.SIGNALK_ADMIN_TOKEN })
    .then(result => { console.log(JSON.stringify(result, null, 2)); process.exitCode = result.logAccessVerified ? 0 : 1 })
    .catch(() => { console.error('Log verification failed; details withheld.'); process.exitCode = 1 })
}
