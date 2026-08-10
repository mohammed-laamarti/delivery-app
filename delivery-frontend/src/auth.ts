export type AuthUser = { userId: number; name: string; role: 'ADMIN' | 'DRIVER'; token: string }

const authKey = 'delivery-auth'

export function getAuth(): AuthUser | null {
  const value = localStorage.getItem(authKey)
  return value ? JSON.parse(value) as AuthUser : null
}

export function saveAuth(value: AuthUser) { localStorage.setItem(authKey, JSON.stringify(value)) }
export function clearAuth() { localStorage.removeItem(authKey) }
