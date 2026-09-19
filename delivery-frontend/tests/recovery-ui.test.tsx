import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { lazy, Suspense } from 'react'
import { DriverPage } from '../src/components/DriverPage'
import { AppErrorBoundary } from '../src/components/AppErrorBoundary'
import { LoginPage } from '../src/components/LoginPage'
import App from '../src/App'
import { saveAuth } from '../src/auth'
import * as api from '../src/api/client'
import type { DeliveryPackage } from '../src/types'

vi.mock('../src/api/client', async importOriginal => ({
  ...await importOriginal<typeof api>(),
  login: vi.fn(),
  fetchDriverPackages: vi.fn(),
  fetchDriverWorkspaceSummary: vi.fn(),
  fetchDashboardData: vi.fn(),
  claimPackageConfirmation: vi.fn(),
  subscribeToRealtimeChanges: vi.fn(() => vi.fn()),
}))
const empty = { items: [], totalItems: 0, page: 0, totalPages: 0 }
beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.mocked(api.fetchDriverPackages).mockReset().mockResolvedValue(empty)
  vi.mocked(api.fetchDriverWorkspaceSummary).mockResolvedValue({ all: 0, distribution: 0, confirmed: 0, toDeliver: 0, delivered: 0, reportedToday: 0, reportedTomorrow: 0 })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function ready() {
  const callback = vi.mocked(api.subscribeToRealtimeChanges).mock.calls.at(-1)![0]
  act(() => callback({ type: 'ready', packageId: null }))
}
function driver() { return render(<DriverPage driverName="Test" onLogout={vi.fn()} onSessionExpired={vi.fn()} />) }

it('recovers on ready and clears only the synchronization error', async () => {
  vi.mocked(api.fetchDriverPackages).mockRejectedValueOnce(new Error('Réseau interrompu'))
  driver()
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Réseau interrompu'))
  ready()
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), { timeout: 2000 })
  expect(api.fetchDriverPackages).toHaveBeenCalledTimes(2)
  expect(api.fetchDriverWorkspaceSummary).toHaveBeenCalledTimes(2)
})

it('coalesces a burst of ready/refresh events into one page read', async () => {
  driver()
  await waitFor(() => expect(screen.queryByText('Chargement des colis...')).toBeNull())
  const callback = vi.mocked(api.subscribeToRealtimeChanges).mock.calls.at(-1)![0]
  act(() => { for (let i = 0; i < 15; i++) callback({ type: 'refresh', packageId: null }) })
  await waitFor(() => expect(api.fetchDriverPackages).toHaveBeenCalledTimes(2), { timeout: 2000 })
})

it('does not let a late old request overwrite a newer successful refresh', async () => {
  let rejectOld!: (error: Error) => void
  vi.mocked(api.fetchDriverPackages).mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
  driver(); ready()
  await waitFor(() => expect(api.fetchDriverPackages).toHaveBeenCalledTimes(2), { timeout: 2000 })
  await act(async () => { rejectOld(new Error('Ancienne erreur')) })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByText('Chargement des colis...')).toBeNull()
})

it('keeps a failed refresh retryable when the initial request is still pending', async () => {
  vi.mocked(api.fetchDriverPackages).mockImplementationOnce(() => new Promise(() => {})).mockRejectedValueOnce(new Error('Coupure'))
  driver(); ready()
  expect(await screen.findByRole('alert', {}, { timeout: 2000 })).toHaveProperty('textContent', expect.stringContaining('Coupure'))
  fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }))
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), { timeout: 2000 })
})

it('shows a reload action instead of a blank page when a lazy chunk fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const BrokenScreen = lazy(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module')))
  render(<AppErrorBoundary><Suspense fallback="Chargement"><BrokenScreen /></Suspense></AppErrorBoundary>)
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('Impossible d’afficher'))
  expect(screen.getByRole('button', { name: 'Recharger l’application' })).toBeTruthy()
})

it('shows login instead of crashing on corrupt storage', () => {
  sessionStorage.setItem('delivery-auth', '{broken')
  render(<App />)
  expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy()
})

it('allows another login attempt after an error without replaying it automatically', async () => {
  vi.mocked(api.login).mockRejectedValue(new Error('Le serveur met trop de temps à répondre.'))
  render(<LoginPage onLogin={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Telephone'), { target: { value: '0600000099' } })
  fireEvent.change(screen.getByLabelText(/Mot de passe/), { target: { value: 'test' } })
  fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }))
  await screen.findByText('Le serveur met trop de temps à répondre.')
  expect(screen.getByRole('button', { name: 'Se connecter' })).toHaveProperty('disabled', false)
  expect(api.login).toHaveBeenCalledTimes(1)
})

it('does not recreate the admin SSE subscription after ready refreshes', async () => {
  saveAuth({ token: 'fake', userId: 1, name: 'Admin', role: 'ADMIN' })
  vi.mocked(api.fetchDashboardData).mockImplementation(async () => ({ packages: [], drivers: [], overview: { date: '2026-09-19', totalPackages: 0, confirmedPackages: 0, deliveredPackages: 0, postponedPackages: 0, inProgressPackages: 0, returnedPackages: 0, drivers: [] } }))
  render(<App />)
  await screen.findByText('Bonjour, Admin')
  ready()
  await waitFor(() => expect(api.fetchDashboardData).toHaveBeenCalledTimes(2))
  expect(api.subscribeToRealtimeChanges).toHaveBeenCalledTimes(1)
  const onUnauthorized = vi.mocked(api.subscribeToRealtimeChanges).mock.calls[0][1]!
  act(() => onUnauthorized())
  expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('session a expiré'))
})

it('keeps a claimed today-report in the Reportés aujourd’hui card', async () => {
  const reported: DeliveryPackage = {
    id: 42, trackingCode: 'REP-42', recipient: 'Client reporté', phone: '0600000000', city: 'Casablanca',
    address: 'Adresse test', price: 100, driver: null, status: 'REPORTE', nextDeliveryDate: '2026-09-20',
    createdAt: '2026-09-19T09:00:00', updatedAt: '2026-09-20T09:00:00',
  }
  saveAuth({ token: 'fake', userId: 1, name: 'Livreur', role: 'DRIVER' })
  vi.mocked(api.fetchDriverPackages).mockResolvedValue({ items: [reported], totalItems: 1, page: 0, totalPages: 1 })
  vi.mocked(api.fetchDriverWorkspaceSummary).mockResolvedValue({
    all: 1, distribution: 0, confirmed: 0, toDeliver: 0, delivered: 0, reportedToday: 1, reportedTomorrow: 0,
  })
  vi.mocked(api.claimPackageConfirmation).mockResolvedValue({ ...reported, confirmationDriverId: 1 })
  driver()
  await screen.findAllByText('REP-42')
  fireEvent.click(screen.getByRole('button', { name: /Reportés aujourd’hui/ }))
  await waitFor(() => expect(vi.mocked(api.fetchDriverPackages)).toHaveBeenLastCalledWith(
    0, 25, expect.objectContaining({ filter: 'REPORTED_TODAY' }),
  ))
  fireEvent.click(screen.getByRole('button', { name: 'Prendre en charge la confirmation' }))
  await waitFor(() => expect(api.claimPackageConfirmation).toHaveBeenCalledWith(42))
  await waitFor(() => expect(vi.mocked(api.fetchDriverPackages)).toHaveBeenLastCalledWith(
    0, 25, expect.objectContaining({ filter: 'REPORTED_TODAY' }),
  ))
  expect(vi.mocked(api.fetchDriverPackages).mock.calls.map(([, , filters]) => filters.filter)).not.toContain('DISTRIBUTION')
})
