import type { ConfirmationOutcome, DeliveryAttempt, DeliveryPackage, DeliveryResult, Driver, PackageHistoryEntry, PackageStatus } from '../types'
import { getAuth } from '../auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

type UserResponse = { id: number; name: string; phone: string; role: 'ADMIN' | 'DRIVER'; active: boolean }
type PackageResponse = {
  id: number; trackingCode: string; storeName: string | null; recipient: string; phone: string; city: string; address: string; price: number
  importComment: string | null; confirmationComment: string | null; latestActionComment: string | null; confirmationChannel: 'APPEL' | 'WHATSAPP' | null; confirmedAt: string | null; confirmedByDriverId: number | null; lastDeliveryResult: DeliveryResult | null; confirmationClaimedAt: string | null; nextConfirmationAt: string | null; status: string; driverId: number | null; lastDriverId: number | null; confirmationDriverId: number | null; agencyReceived: boolean; agencyReceiverDriverId: number | null; nextDeliveryDate: string | null; reportScheduledFor: string | null; reportedAt: string | null; returnedToDepotAt: string | null; returnReceivedAtDepot: boolean; deliveryStartedAt: string | null; depotDecisionAt: string | null; returnShipmentReference: string | null; returnedToCompanyAt: string | null; createdAt: string; updatedAt: string
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

type DriverDailyActivityResponse = {
  packageData: PackageResponse
  activityStatus: string
  occurredAt: string
}

type DashboardData = { packages: DeliveryPackage[]; drivers: Driver[] }
let dashboardRequest: Promise<DashboardData> | null = null

const statusFromApi: Record<string, PackageStatus> = {
  TO_CONFIRM: 'MIS EN DISTRIBUTION', NO_ANSWER: 'PAS DE REPONSE', VOICEMAIL: 'BOITE VOCALE', OUT_OF_ZONE: 'HORS ZONE', TO_RECEIVE: 'A RECEPTIONNER', AT_AGENCY: 'EN AGENCE', TO_DELIVER: 'A LIVRER', ASSIGNED: 'AFFECTE', IN_DELIVERY: 'EN LIVRAISON', DELIVERED: 'LIVRE', POSTPONED: 'REPORTE', RETURNED: 'RETOUR', RETURN_SHIPPED: 'RETOUR ENVOYE', CANCELLED: 'ANNULE',
}

const statusToApi: Record<PackageStatus, string> = {
  'MIS EN DISTRIBUTION': 'TO_CONFIRM', 'PAS DE REPONSE': 'NO_ANSWER', 'BOITE VOCALE': 'VOICEMAIL', 'HORS ZONE': 'OUT_OF_ZONE', 'A RECEPTIONNER': 'TO_RECEIVE', 'EN AGENCE': 'AT_AGENCY', 'A LIVRER': 'TO_DELIVER', AFFECTE: 'ASSIGNED', 'EN LIVRAISON': 'IN_DELIVERY', LIVRE: 'DELIVERED', REPORTE: 'POSTPONED', RETOUR: 'RETURNED', 'RETOUR ENVOYE': 'RETURN_SHIPPED', ANNULE: 'CANCELLED',
}

function displayPackageStatus(status: string): PackageStatus {
  // Keep an unknown value visible instead of incorrectly presenting it as a
  // parcel ready for delivery. This also makes new server statuses obvious
  // until a client update is installed.
  return statusFromApi[status] ?? status as PackageStatus
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(getAuth()?.token ? { Authorization: `Bearer ${getAuth()?.token}` } : {}), ...(options?.headers ?? {}) },
    ...options,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null
    if (response.status === 401 || response.status === 403) {
      throw new Error(body?.message || 'Accès refusé. Déconnectez-vous puis reconnectez-vous.')
    }
    throw new Error(body?.message || `Erreur API ${response.status}`)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

async function loadDashboardData(): Promise<DashboardData> {
  const [rawPackages, users] = await Promise.all([
    request<PackageResponse[]>('/api/packages'),
    request<UserResponse[]>('/api/users'),
  ])
  const driversById = new Map(users.filter((user) => user.role === 'DRIVER').map((user) => [user.id, user]))
  const deliveryPackages: DeliveryPackage[] = rawPackages.map((item) => ({
    ...item,
    status: displayPackageStatus(item.status),
    driver: item.driverId ? driversById.get(item.driverId)?.name ?? `Livreur #${item.driverId}` : null,
    lastDriverName: item.lastDriverId ? driversById.get(item.lastDriverId)?.name ?? `Livreur #${item.lastDriverId}` : null,
    confirmationDriverName: item.confirmationDriverId ? driversById.get(item.confirmationDriverId)?.name ?? `Livreur #${item.confirmationDriverId}` : null,
  }))
  const packageStatsByDriver = new Map<number, {
    assigned: number; inProgress: number; delivered: number; earned: number; undelivered: number; returns: number
  }>()
  const confirmationsByDriver = new Map<number, number>()
  for (const item of rawPackages) {
    if (item.confirmedByDriverId != null) {
      confirmationsByDriver.set(item.confirmedByDriverId, (confirmationsByDriver.get(item.confirmedByDriverId) ?? 0) + 1)
    }
    if (item.driverId == null) continue
    const stats = packageStatsByDriver.get(item.driverId) ?? {
      assigned: 0, inProgress: 0, delivered: 0, earned: 0, undelivered: 0, returns: 0,
    }
    stats.assigned += 1
    if (item.status === 'IN_DELIVERY') stats.inProgress += 1
    if (item.status === 'DELIVERED') {
      stats.delivered += 1
      stats.earned += Number(item.price ?? 0)
    }
    if ((item.status === 'AT_AGENCY' && item.returnReceivedAtDepot) || item.status === 'RETURNED') stats.undelivered += 1
    if (item.returnReceivedAtDepot) stats.returns += 1
    packageStatsByDriver.set(item.driverId, stats)
  }
  // Inactive drivers remain in `users` above so older parcels can still show
  // their name, but they must not appear in the active driver workspace.
  const drivers: Driver[] = users.filter((user) => user.role === 'DRIVER' && user.active).map((user) => {
    const stats = packageStatsByDriver.get(user.id) ?? {
      assigned: 0, inProgress: 0, delivered: 0, earned: 0, undelivered: 0, returns: 0,
    }
    return {
      id: user.id,
      name: user.name,
      phone: user.phone,
      initials: user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      ...stats,
      confirmed: confirmationsByDriver.get(user.id) ?? 0,
      active: user.active,
    }
  })
  return { packages: deliveryPackages, drivers }
}

/** Shares one in-flight refresh between interval, focus and action listeners. */
export async function fetchDashboardData() {
  if (dashboardRequest) return dashboardRequest
  dashboardRequest = loadDashboardData()
  try {
    return await dashboardRequest
  } finally {
    dashboardRequest = null
  }
}

export async function fetchDailyDashboardStats(date: string) {
  return request<DailyDashboardStats>(`/api/dashboard/stats?date=${encodeURIComponent(date)}`)
}

export async function fetchDailyDriverStats(date: string) {
  return request<DailyDriverStats[]>(`/api/dashboard/driver-stats?date=${encodeURIComponent(date)}`)
}

export async function fetchDriverDailyActivities(driverId: number, date: string, driverName: string) {
  const activities = await request<DriverDailyActivityResponse[]>(
    `/api/packages/drivers/${driverId}/activities?date=${encodeURIComponent(date)}`,
  )
  return activities.map(({ packageData, activityStatus, occurredAt }) => ({
    ...packageData,
    status: displayPackageStatus(activityStatus),
    updatedAt: occurredAt,
    driver: driverName,
    lastDriverName: driverName,
  } satisfies DeliveryPackage))
}

export async function fetchDriverAssignedPackages(driverId: number, driverName: string) {
  const rawPackages = await request<PackageResponse[]>(`/api/packages/drivers/${driverId}`)
  return rawPackages.map((item) => ({
    ...item,
    status: displayPackageStatus(item.status),
    driver: item.driverId === driverId ? driverName : null,
    lastDriverName: item.lastDriverId === driverId ? driverName : null,
  } satisfies DeliveryPackage))
}

export async function fetchDriverPackages() {
  const rawPackages = await request<PackageResponse[]>('/api/packages/driver-view')
  return rawPackages.map((item) => ({ ...item, status: displayPackageStatus(item.status), driver: null }))
}

export async function login(phone: string, password: string) {
  return request<{ token: string; userId: number; name: string; role: 'ADMIN' | 'DRIVER' }>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ phone: normalizeLoginPhone(phone), password }),
  })
}

function normalizeLoginPhone(phone: string) {
  let compact = phone.trim().replace(/[\s().-]/g, '')
  if (compact.startsWith('00212')) compact = compact.slice(5)
  else if (compact.startsWith('+212')) compact = compact.slice(4)
  else if (compact.startsWith('212') && compact.length === 12) compact = compact.slice(3)
  if (compact.length === 9 && !compact.startsWith('0')) compact = `0${compact}`
  return compact
}

export async function assignPackage(packageId: number, driverId: number) {
  return request<PackageResponse>(`/api/packages/${packageId}/assign/${driverId}`, { method: 'PATCH' })
}

export async function createPackage(packageData: {
  trackingCode: string
  storeName?: string
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
  storeName?: string
  recipient: string
  phone: string
  city: string
  address: string
  price: number
  importComment?: string
  driverId?: number | null
  status: PackageStatus
  nextDeliveryDate?: string | null
  confirmationComment?: string | null
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

export async function downloadPackagesExcel() {
  const response = await fetch(`${API_URL}/api/packages/export`, {
    headers: getAuth()?.token ? { Authorization: `Bearer ${getAuth()?.token}` } : undefined,
  })
  if (!response.ok) throw new Error((await response.text()) || `Erreur API ${response.status}`)
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  const now = new Date()
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}-${pad(now.getMilliseconds(), 3)}`
  link.download = `colis_${timestamp}.xlsx`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
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

export async function updateConfirmationComment(packageId: number, comment: string) {
  return request<PackageResponse>(`/api/packages/${packageId}/confirmation/comment`, {
    method: 'PATCH', body: JSON.stringify({ comment }),
  })
}

export async function reopenCancelledConfirmation(packageId: number) {
  return request<PackageResponse>(`/api/packages/${packageId}/confirmation/reopen`, { method: 'PATCH' })
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
