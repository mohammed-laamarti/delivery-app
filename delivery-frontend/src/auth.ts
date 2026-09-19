export type AuthUser = { userId: number; name: string; role: 'ADMIN' | 'DRIVER'; token: string }

const authKey = 'delivery-auth'

export function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false
  const user = value as Partial<AuthUser>
  return Number.isSafeInteger(user.userId) && user.userId! > 0
    && typeof user.name === 'string' && typeof user.token === 'string' && user.token.length > 0
    && (user.role === 'ADMIN' || user.role === 'DRIVER')
}

export function getAuth(): AuthUser | null {
  try {
    const value = sessionStorage.getItem(authKey)
    if (!value) return null
    const user: unknown = JSON.parse(value)
    if (isAuthUser(user)) return user
  } catch { /* Invalid or unavailable storage must not crash the login page. */ }
  clearAuth()
  return null
}

// Each tab retains its own user; never fall back to shared localStorage.
export function saveAuth(value: AuthUser) {
  if (!isAuthUser(value)) throw new Error('La réponse de connexion est invalide. Réessayez.')
  try { sessionStorage.setItem(authKey, JSON.stringify(value)) }
  catch { throw new Error('Le navigateur ne peut pas enregistrer votre session. Autorisez le stockage du site puis réessayez.') }
}
export function clearAuth() {
  try { sessionStorage.removeItem(authKey) } catch { /* Storage can be disabled. */ }
}
