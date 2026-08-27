import type { ConfirmationOutcome, DeliveryAttempt, DeliveryPackage, DeliveryResult, Driver, PackageHistoryEntry, PackageStatus } from '../types'
import { getAuth } from '../auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

type UserResponse = { id: number; name: string; phone: string; role: 'ADMIN' | 'DRIVER'; active: boolean }
type PackageResponse = {
  id: number; trackingCode: string; recipient: string; phone: string; city: string; address: string; price: number
  importComment: string | null; confirmationComment: string | null; confirmationChannel: 'APPEL' | 'WHATSAPP' | null; confirmedAt: string | null; confirmedByDriverId: number | null; lastDeliveryResult: DeliveryResult | null; confirmationClaimedAt: string | null; nextConfirmationAt: string | null; status: string; driverId: number | null; lastDriverId: number | null; confirmationDriverId: number | null; agencyReceived: boolean; agencyReceiverDriverId: number | null; nextDeliveryDate: string | null; reportScheduledFor: string | null; reportedAt: string | null; returnedToDepotAt: string | null; depotDecisionAt: string | null; returnShipmentReference: string | null; returnedToCompanyAt: string | null; createdAt: string; updatedAt: string
}

export type DailyDashboardStats = {
  date: string
  totalPackagesImported: number
  attempts: number
  delivered: number
  unreachable: number
  postponed: number
  refused: number
  addressNotFound: number
}

export type DailyDriverStats = {
  driverId: number
  driverName: string
  processed: number
  delivered: number
  deliveredAmount: number
}

const statusFromApi: Record<string, PackageStatus> = {
  TO_CONFIRM: 'A CONFIRMER', TO_RECEIVE: 'A RECEPTIONNER', AT_AGENCY: 'EN AGENCE', TO_DELIVER: 'A LIVRER', ASSIGNED: 'AFFECTE', IN_DELIVERY: 'EN LIVRAISON', AT_DEPOT: 'AU DEPOT', DELIVERED: 'LIVRE', POSTPONED: 'REPORTE', RETURNED: 'RETOUR', RETURN_SHIPPED: 'RETOUR ENVOYE', CANCELLED: 'ANNULE',
}

const statusToApi: Record<PackageStatus, string> = {
  'A CONFIRMER': 'TO_CONFIRM', 'A RECEPTIONNER': 'TO_RECEIVE', 'EN AGENCE': 'AT_AGENCY', 'A LIVRER': 'TO_DELIVER', AFFECTE: 'ASSIGNED', 'EN LIVRAISON': 'IN_DELIVERY', 'AU DEPOT': 'AT_DEPOT', LIVRE: 'DELIVERED', REPORTE: 'POSTPONED', RETOUR: 'RETURNED', 'RETOUR ENVOYE': 'RETURN_SHIPPED', ANNULE: 'CANCELLED',
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(getAuth()?.token ? { Authorization: `Bearer ${getAuth()?.token}` } : {}), ...(options?.headers ?? {}) },
    ...options,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(body?.message || `Erreur API ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export async function fetchDashboardData() {
  const [rawPackages, users] = await Promise.all([
    request<PackageResponse[]>('/api/packages'),
    request<UserResponse[]>('/api/users'),
  ])
  const driversById = new Map(users.filter((user) => user.role === 'DRIVER').map((user) => [user.id, user]))
  const deliveryPackages: DeliveryPackage[] = rawPackages.map((item) => ({
    ...item,
    status: statusFromApi[item.status] ?? 'A LIVRER',
    driver: item.driverId ? driversById.get(item.driverId)?.name ?? `Livreur #${item.driverId}` : null,
    confirmationDriverName: item.confirmationDriverId ? driversById.get(item.confirmationDriverId)?.name ?? `Livreur #${item.confirmationDriverId}` : null,
  }))
  // Inactive drivers remain in `users` above so older parcels can still show
  // their name, but they must not appear in the active driver workspace.
  const drivers: Driver[] = users.filter((user) => user.role === 'DRIVER' && user.active).map((user) => {
    const driverPackages = rawPackages.filter((item) => item.driverId === user.id)
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      initials: user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      assigned: driverPackages.length,
      inProgress: driverPackages.filter((item) => item.status === 'IN_DELIVERY').length,
      delivered: driverPackages.filter((item) => item.status === 'DELIVERED').length,
      confirmed: rawPackages.filter((item) => item.confirmedByDriverId === user.id).length,
      earned: driverPackages.filter((item) => item.status === 'DELIVERED')
        .reduce((total, item) => total + Number(item.price ?? 0), 0),
      undelivered: driverPackages.filter((item) => item.status === 'AT_DEPOT' || item.status === 'RETURNED').length,
      returns: driverPackages.filter((item) => item.returnedToDepotAt != null).length,
      active: user.active,
    }
  })
  return { packages: deliveryPackages, drivers }
}

export async function fetchDailyDashboardStats(date: string) {
  return request<DailyDashboardStats>(`/api/dashboard/stats?date=${encodeURIComponent(date)}`)
}

export async function fetchDailyDriverStats(date: string) {
  return request<DailyDriverStats[]>(`/api/dashboard/driver-stats?date=${encodeURIComponent(date)}`)
}

export async function fetchDriverPackages() {
  const rawPackages = await request<PackageResponse[]>('/api/packages/driver-view')
  return rawPackages.map((item) => ({ ...item, status: statusFromApi[item.status] ?? 'A LIVRER', driver: null }))
}

export async function login(phone: string, password: string) {
  return request<{ token: string; userId: number; name: string; role: 'ADMIN' | 'DRIVER' }>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ phone, password }),
  })
}

export async function assignPackage(packageId: number, driverId: number) {
  return request<PackageResponse>(`/api/packages/${packageId}/assign/${driverId}`, { method: 'PATCH' })
}

export async function createPackage(packageData: {
  trackingCode: string
  recipient: string
  phone: string
  city: string
  address: string
  price: number
  importComment?: string
}) {
  return request<PackageResponse>('/api/packages', {
    method: 'POST',
    body: JSON.stringify({ ...packageData, driverId: null }),
  })
}

export async function updatePackage(packageId: number, packageData: {
  trackingCode: string
  recipient: string
  phone: string
  city: string
  address: string
  price: number
  importComment?: string
  driverId?: number | null
  status: PackageStatus
  nextDeliveryDate?: string | null
}) {
  return request<PackageResponse>(`/api/packages/${packageId}`, {
    method: 'PUT', body: JSON.stringify({ ...packageData, status: statusToApi[packageData.status] }),
  })
}

export async function deletePackage(packageId: number) {
  return request<void>(`/api/packages/${packageId}`, { method: 'DELETE' })
}

export async function createDriver(name: string, phone: string, password: string) {
  return request<UserResponse>('/api/users', {
    method: 'POST',
    body: JSON.stringify({ name, phone, password, role: 'DRIVER', active: true }),
  })
}

export async function updateDriver(id: number, name: string, phone: string, password: string, active: boolean) {
  return request<UserResponse>(`/api/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name, phone, password, role: 'DRIVER', active }),
  })
}

export async function fetchDriver(id: number) {
  return request<UserResponse>(`/api/users/${id}`)
}

export async function deleteDriver(id: number) {
  return request<void>(`/api/users/${id}`, { method: 'DELETE' })
}

export async function uploadExcel(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await fetch(`${API_URL}/api/packages/import`, {
    method: 'POST', body: formData,
    headers: getAuth()?.token ? { Authorization: `Bearer ${getAuth()?.token}` } : undefined,
  })
  if (!response.ok) throw new Error((await response.text()) || `Erreur API ${response.status}`)
  return response.json() as Promise<{ imported: number; skipped: number; errors: string[] }>
}

export async function updatePackageStatus(packageId: number, status: PackageStatus) {
  return request<PackageResponse>(`/api/packages/${packageId}/status?status=${encodeURIComponent(statusToApi[status])}`, { method: 'PATCH' })
}

export async function claimPackageConfirmation(packageId: number) {
  return request<PackageResponse>(`/api/packages/${packageId}/confirmation/claim`, { method: 'PATCH' })
}

export async function releasePackageConfirmation(packageId: number) {
  return request<PackageResponse>(`/api/packages/${packageId}/confirmation/release`, { method: 'PATCH' })
}

export async function confirmPackageCustomer(packageId: number, comment: string, channel: 'APPEL' | 'WHATSAPP') {
  return request<PackageResponse>(`/api/packages/${packageId}/confirmation`, {
    method: 'PATCH', body: JSON.stringify({ comment, channel }),
  })
}

export async function createConfirmationOutcome(packageId: number, outcome: ConfirmationOutcome, comment: string, nextContactAt?: string) {
  return request<PackageResponse>(`/api/packages/${packageId}/confirmation/outcomes`, {
    method: 'POST', body: JSON.stringify({ outcome, comment: comment || null, nextContactAt: nextContactAt ? `${nextContactAt}T00:00` : null }),
  })
}

export async function registerAgencyArrival(packageId: number) {
  return request<PackageResponse>(`/api/packages/${packageId}/agency-arrival`, { method: 'PATCH' })
}

// Kept for backward compatibility with already-open browser sessions.

export async function confirmDriverDeparture(driverId: number) {
  return request<void>(`/api/packages/drivers/${driverId}/departure`, { method: 'PATCH' })
}

export async function registerPackageReturn(packageId: number) {
  return request<PackageResponse>(`/api/packages/${packageId}/return`, { method: 'PATCH' })
}

export async function registerDepotArrival(packageId: number) {
  return request<PackageResponse>(`/api/packages/${packageId}/depot-arrival`, { method: 'PATCH' })
}

export async function decideDepotStatus(packageId: number, status: PackageStatus, nextDeliveryDate?: string) {
  const date = nextDeliveryDate ? `&nextDeliveryDate=${encodeURIComponent(nextDeliveryDate)}` : ''
  return request<PackageResponse>(`/api/packages/${packageId}/depot-decision?status=${encodeURIComponent(statusToApi[status])}${date}`, { method: 'PATCH' })
}

export async function shipReturns(packageIds: number[], reference?: string) {
  return request<PackageResponse[]>('/api/packages/return-shipments', {
    method: 'POST',
    body: JSON.stringify({ packageIds, reference: reference || null }),
  })
}

export async function createDeliveryAttempt(
  packageId: number,
  result: DeliveryResult,
  comment: string,
  nextDate?: string,
) {
  return request(`/api/packages/${packageId}/attempts`, {
    method: 'POST',
    body: JSON.stringify({ result, comment: comment || null, nextDate: nextDate || null }),
  })
}

export async function fetchPackageAttempts(packageId: number) {
  return request<DeliveryAttempt[]>(`/api/packages/${packageId}/attempts`)
}

export async function fetchPackageHistory(packageId: number) {
  return request<PackageHistoryEntry[]>(`/api/packages/${packageId}/history`)
}
