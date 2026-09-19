import { getAuth } from '../auth'
import type { RealtimeChange } from './client'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
const isOnline = () => navigator.onLine !== false
const SILENCE_MS = 90_000 // Server heartbeat: 45 seconds.

export function subscribeToRealtimeChanges(onChange: (change: RealtimeChange) => void, onUnauthorized?: () => void) {
  let stopped = false
  let running = false
  let controller: AbortController | null = null
  let retryTimer: number | undefined
  let silenceTimer: number | undefined
  let failures = 0
  let restartRequested = false
  let lastActivity = Date.now()

  function clearTimers() {
    window.clearTimeout(retryTimer)
    window.clearTimeout(silenceTimer)
    retryTimer = undefined
    silenceTimer = undefined
  }
  function watchSilence() {
    window.clearTimeout(silenceTimer)
    silenceTimer = window.setTimeout(() => controller?.abort(), SILENCE_MS)
  }
  function dispose() {
    stopped = true
    clearTimers()
    controller?.abort()
    window.removeEventListener('online', online)
    window.removeEventListener('offline', offline)
    document.removeEventListener('visibilitychange', visible)
  }
  function restart() {
    if (stopped) return
    clearTimers()
    if (running) { restartRequested = true; controller?.abort() }
    else void connect()
  }
  function online() {
    if (stopped) return
    onChange({ type: 'refresh', packageId: null })
    failures = 0
    restart()
  }
  function offline() { clearTimers(); controller?.abort() }
  function visible() {
    if (document.visibilityState === 'visible' && Date.now() - lastActivity >= SILENCE_MS) restart()
  }
  async function connect() {
    if (stopped || running || !isOnline()) return
    running = true
    restartRequested = false
    controller = new AbortController()
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
    watchSilence()
    try {
      const token = getAuth()?.token
      const response = await fetch(`${API_URL}/api/realtime/events`, {
        headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: controller.signal,
      })
      if (response.status === 401 || response.status === 403) {
        dispose()
        onUnauthorized?.()
        return
      }
      if (!response.ok || !response.body) throw new Error('Flux indisponible')
      reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (!stopped) {
        const chunk = await reader.read()
        if (chunk.done) break
        lastActivity = Date.now()
        watchSilence()
        buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r/g, '')
        let boundary: number
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const message = buffer.slice(0, boundary)
          buffer = buffer.slice(boundary + 2)
          const data = message.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
          if (!data) continue
          let change: RealtimeChange
          try { change = JSON.parse(data) as RealtimeChange } catch { continue }
          if (!change || !['ready', 'ping', 'refresh', 'package'].includes(change.type)) continue
          failures = 0
          onChange(change)
        }
      }
    } catch {
      // A disconnected or silent stream is retried; only dispose stops it.
    } finally {
      window.clearTimeout(silenceTimer)
      if (reader) void reader.cancel().catch(() => {})
      controller?.abort()
      controller = null
      running = false
      if (!stopped && isOnline()) {
        const delay = restartRequested ? 0 : Math.min(30_000, 2_000 * 2 ** Math.min(failures++, 4))
        retryTimer = window.setTimeout(() => { void connect() }, delay)
      }
    }
  }
  window.addEventListener('online', online)
  window.addEventListener('offline', offline)
  document.addEventListener('visibilitychange', visible)
  void connect()
  return dispose
}
