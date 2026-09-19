export class ApiError extends Error {
  readonly status: number | undefined
  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export function errorMessage(error: unknown, fallback = 'Une erreur est survenue. Réessayez.') {
  return error instanceof Error ? error.message : fallback
}

async function responseMessage(response: Response) {
  const body = await response.text().catch(() => '')
  if (!body) return null
  try {
    const json: unknown = JSON.parse(body)
    if (json && typeof json === 'object' && 'message' in json && typeof json.message === 'string') return json.message
  } catch { /* Some download endpoints return plain text errors. */ }
  return response.headers.get('content-type')?.startsWith('text/plain') && body.length <= 500 ? body : null
}

/** One attempt only, including reading the body. Never replay a business write. */
export async function requestData<T>(url: string, options: RequestInit, read: (response: Response) => Promise<T>, timeoutMs = 30_000): Promise<T> {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort()
  if (options.signal?.aborted) abort()
  else options.signal?.addEventListener('abort', abort, { once: true })
  const timer = window.setTimeout(() => { timedOut = true; controller.abort() }, timeoutMs)
  const uncertainWrite = !['GET', 'HEAD'].includes(options.method ?? 'GET') && !url.endsWith('/api/auth/login')
  const suffix = uncertainWrite ? ' Le résultat de l’opération est incertain : vérifiez les données avant de recommencer.' : ''
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    if (!response.ok) {
      const message = await responseMessage(response)
      throw new ApiError(message || (response.status === 401 || response.status === 403
        ? 'Session expirée ou accès refusé. Reconnectez-vous ; si le problème persiste, contactez l’administrateur.'
        : `Le serveur a répondu avec une erreur (${response.status}).${suffix}`), response.status)
    }
    return await read(response)
  } catch (error) {
    if (options.signal?.aborted) throw error
    if (timedOut) throw new ApiError(`Le serveur met trop de temps à répondre. Réessayez dans un instant.${suffix}`)
    if (error instanceof TypeError) {
      throw new ApiError((navigator.onLine === false
        ? 'Votre navigateur signale une absence de connexion. Vérifiez le réseau.'
        : 'Impossible de joindre le service ou de lire sa réponse. Vérifiez la connexion puis réessayez.') + suffix)
    }
    if (error instanceof SyntaxError) throw new ApiError(`La réponse du serveur est illisible. Réessayez dans un instant.${suffix}`)
    throw error
  } finally {
    window.clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}
