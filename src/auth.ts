import { DiagnosticError } from './safety.js'

type Principal = Readonly<{ identifier: string; permissions: 'readonly' | 'readwrite' | 'admin' }>
type Connection = { headers: { authorization: string }; skIsAuthenticated?: boolean; skPrincipal?: Principal }
type NativeSecurity = {
  isDummy(): boolean
  authorizeWS(connection: Connection): void
  checkACL(identifier: string, context: string, path: string, source: string, operation: string): boolean
  anyACLs(): boolean
}

export class AccessError extends DiagnosticError {
  constructor(code: string, public readonly status: number) { super(code) }
}

// Signal K has no public per-call bearer/telemetry-ACL API. Keep the tested,
// version-sensitive bridge here; never read security configuration or sign JWTs.
function security(app: object): NativeSecurity {
  try {
    const candidate = (app as { securityStrategy?: Partial<NativeSecurity> }).securityStrategy
    if (candidate && typeof candidate.isDummy === 'function' && candidate.isDummy() === false &&
      typeof candidate.authorizeWS === 'function' && typeof candidate.checkACL === 'function' &&
      typeof candidate.anyACLs === 'function') return candidate as NativeSecurity
  } catch { /* Unknown host security must not grant access. */ }
  throw new AccessError('SIGNALK_SECURITY_UNAVAILABLE', 503)
}

export function requireSecurity(app: object): void { security(app) }

function authenticate(app: object, authorization: string | undefined): Principal {
  const strategy = security(app)
  if (!authorization || !/^Bearer [^\s]+$/.test(authorization)) throw new AccessError('BEARER_TOKEN_REQUIRED', 401)
  // A new object containing only this header excludes cookies, query tokens and
  // principals cached by HTTP middleware. Signal K verifies/revokes the identity.
  const connection: Connection = { headers: { authorization } }
  let outcome: unknown
  try { outcome = strategy.authorizeWS(connection) } catch { throw new AccessError('INVALID_TOKEN', 401) }
  if (outcome !== undefined) {
    // The supported native hook is synchronous and returns void. A future
    // async/changed contract must not grant access using a partial principal.
    if (outcome instanceof Promise) void outcome.catch(() => undefined)
    throw new AccessError('SIGNALK_SECURITY_UNAVAILABLE', 503)
  }
  const principal = connection.skPrincipal
  if (connection.skIsAuthenticated !== true || !principal || typeof principal.identifier !== 'string' ||
    !principal.identifier || principal.identifier === 'AUTO' || !['readonly', 'readwrite', 'admin'].includes(principal.permissions)) {
    throw new AccessError('PERMISSION_DENIED', 403)
  }
  return Object.freeze({ identifier: principal.identifier, permissions: principal.permissions })
}

export interface ReadAccess {
  check(): Principal
  requireAdmin(): void
  isAdmin(): boolean
  canRead(path: string, source?: string): boolean
}

export function createAccess(app: object, authorization: string | undefined, running: () => boolean = () => true): ReadAccess {
  const identity = authenticate(app, authorization).identifier
  const check = () => {
    if (!running()) throw new AccessError('PLUGIN_DISABLED', 503)
    const principal = authenticate(app, authorization)
    if (principal.identifier !== identity) throw new AccessError('PERMISSION_DENIED', 403)
    return principal
  }
  return {
    check,
    isAdmin: () => check().permissions === 'admin',
    requireAdmin: () => { if (check().permissions !== 'admin') throw new AccessError('ADMIN_REQUIRED', 403) },
    canRead(path, source) {
      const principal = check()
      const strategy = security(app)
      try {
        // An unknown source cannot establish a source-specific grant. Only an
        // explicit no-ACL result permits source-less data/missing-path checks.
        if (source === undefined && strategy.anyACLs() !== false) return false
        if (source !== undefined && (!source || source.length > 256)) return false
        return strategy.checkACL(principal.identifier, 'vessels.self', path, source ?? '', 'read') === true
      } catch { throw new AccessError('SIGNALK_SECURITY_UNAVAILABLE', 503) }
    }
  }
}
