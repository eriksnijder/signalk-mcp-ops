// Synthetic credentials and native-hook fixture for unit tests only. Real
// Signal K routing/JWT/ACL checks run separately in integration/native-auth.cjs.
const { createAccess } = require('../dist/auth.js')
const token = 'synthetic-admin-token'
const securityStrategy = {
  isDummy: () => false,
  anyACLs: () => false,
  authorizeWS(connection) {
    if (connection.headers.authorization !== `Bearer ${token}`) throw Error('synthetic invalid token')
    connection.skIsAuthenticated = true
    connection.skPrincipal = { identifier: 'synthetic-admin', permissions: 'admin' }
  },
  checkACL: () => true
}
const adminAccess = () => createAccess({ securityStrategy }, `Bearer ${token}`)
const permitRouter = router => { router.access = () => router; return router }
module.exports = { securityStrategy, token, adminAccess, permitRouter }
