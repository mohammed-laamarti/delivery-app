export type AuthUser = { userId: number; name: string; role: 'ADMIN' | 'DRIVER'; token: string }

const authKey = 'delivery-auth'

export function getAuth(): AuthUser | null {
  const value = sessionStorage.getItem(authKey)
  return value ? JSON.parse(value) as AuthUser : null
}

// Each browser tab keeps its own authenticated user. This avoids replacing an
// active user's session when another person signs in from a second tab.
export function saveAuth(value: AuthUser) { sessionStorage.setItem(authKey, JSON.stringify(value)) }
export function clearAuth() { sessionStorage.removeItem(authKey) }
