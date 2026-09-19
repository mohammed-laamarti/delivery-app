import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAuth, saveAuth, clearAuth } from '../src/auth'
import { requestData } from '../src/api/http'
import { subscribeToRealtimeChanges } from '../src/api/realtime'
import { fetchAdminPackagesPage } from '../src/api/client'

beforeEach(() => { sessionStorage.clear(); vi.useFakeTimers(); vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const auth = { token: 'test-token', userId: 1, name: 'Test', role: 'DRIVER' as const }

describe('session storage', () => {
  it.each(['{bad', 'null', '{}', '{"token":1,"role":"ADMIN"}'])('recovers safely from %s', value => {
    sessionStorage.setItem('delivery-auth', value)
    expect(getAuth()).toBeNull()
    expect(sessionStorage.getItem('delivery-auth')).toBeNull()
  })
  it('preserves a valid tab session', () => { saveAuth(auth); expect(getAuth()).toEqual(auth); clearAuth(); expect(getAuth()).toBeNull() })
  it('explains blocked storage instead of a server failure', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
    expect(() => saveAuth(auth)).toThrow('enregistrer votre session')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
    expect(getAuth()).toBeNull()
  })
})

describe('bounded HTTP requests', () => {
  it('aborts a hanging login, releases its deadline, and never retries', async () => {
    const fetchMock = vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))))
    vi.stubGlobal('fetch', fetchMock)
    const result = requestData('/api/auth/login', { method: 'POST' }, r => r.json())
    const assertion = expect(result).rejects.toThrow('trop de temps')
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps the deadline active while the body is pending', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => ({ ok: true, json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))) })))
    const assertion = expect(requestData('/api/packages', {}, r => r.json())).rejects.toThrow('trop de temps')
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
  })
  it('never replays a write whose outcome is unknown', async () => {
    const mock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch')); vi.stubGlobal('fetch', mock)
    await expect(requestData('/api/packages/1', { method: 'PATCH' }, r => r.json())).rejects.toThrow('résultat de l’opération est incertain')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(mock).toHaveBeenCalledTimes(1)
  })
  it.each([401, 403, 500, 502])('keeps HTTP %s distinct from network errors', async status => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status })))
    await expect(requestData('/api/packages', {}, r => r.json())).rejects.toMatchObject({ status })
  })
  it('keeps a plain-text download error useful to the user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Export indisponible', {
      status: 503, headers: { 'Content-Type': 'text/plain' },
    })))
    await expect(requestData('/api/packages/export', { method: 'POST' }, r => r.blob())).rejects.toThrow('Export indisponible')
  })
  it('does not expose an HTML proxy error as application text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<h1>Bad gateway</h1>', {
      status: 502, headers: { 'Content-Type': 'text/html' },
    })))
    await expect(requestData('/api/packages', {}, r => r.json())).rejects.toThrow('erreur (502)')
  })
  it('respects caller cancellation', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))))))
    const request = requestData('/api/packages', { signal: controller.signal }, r => r.json())
    controller.abort()
    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('admin parcel search', () => {
  it('searches every day when the admin enters or scans a query', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], totalItems: 0, page: 0, totalPages: 0 }), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } })))

    await fetchAdminPackagesPage('2026-09-20', 0, 25, 'REP-42')

    const requestUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(requestUrl.searchParams.get('query')).toBe('REP-42')
    expect(requestUrl.searchParams.has('date')).toBe(false)
  })

  it('keeps day browsing when the admin has not entered a query', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], totalItems: 0, page: 0, totalPages: 0 }), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { headers: { 'Content-Type': 'application/json' } })))

    await fetchAdminPackagesPage('2026-09-20')

    const requestUrl = new URL(vi.mocked(fetch).mock.calls[0][0] as string)
    expect(requestUrl.searchParams.get('date')).toBe('2026-09-20')
    expect(requestUrl.searchParams.has('query')).toBe(false)
  })
})

describe('realtime recovery', () => {
  function streamServer() {
    const streams: ReadableStreamDefaultController<Uint8Array>[] = []
    const fetchMock = vi.fn(async (_url, options) => new Response(new ReadableStream<Uint8Array>({ start(controller) {
      streams.push(controller)
      controller.enqueue(new TextEncoder().encode('data: {"type":"ready","packageId":null}\n\n'))
      options.signal.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')) } catch { /* already closed */ } })
    } })))
    vi.stubGlobal('fetch', fetchMock)
    return { streams, fetchMock }
  }
  it('reconnects after a silent stream and delivers ready for resynchronization', async () => {
    const { fetchMock } = streamServer(); const change = vi.fn(); const stop = subscribeToRealtimeChanges(change)
    await vi.advanceTimersByTimeAsync(0)
    expect(change).toHaveBeenCalledWith({ type: 'ready', packageId: null })
    await vi.advanceTimersByTimeAsync(92_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(change).toHaveBeenCalledTimes(2)
    stop(); await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('waits offline, resumes online, and removes listeners on cleanup', async () => {
    const { fetchMock } = streamServer(); const change = vi.fn(); const stop = subscribeToRealtimeChanges(change)
    await vi.advanceTimersByTimeAsync(0)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    window.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(change).toHaveBeenCalledWith({ type: 'refresh', packageId: null })
    stop(); window.dispatchEvent(new Event('online')); await vi.advanceTimersByTimeAsync(120_000)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('does not reconnect forever with an unauthorized session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 403 })); vi.stubGlobal('fetch', fetchMock)
    const unauthorized = vi.fn(); const stop = subscribeToRealtimeChanges(vi.fn(), unauthorized)
    await vi.advanceTimersByTimeAsync(120_000)
    window.dispatchEvent(new Event('online'))
    expect(unauthorized).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    stop()
  })
  it('backs off repeated failures instead of flooding the server', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('network')); vi.stubGlobal('fetch', fetchMock)
    const stop = subscribeToRealtimeChanges(vi.fn())
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetchMock).toHaveBeenCalledTimes(5) // 0, 2, 6, 14, 30 seconds
    stop()
  })
})
