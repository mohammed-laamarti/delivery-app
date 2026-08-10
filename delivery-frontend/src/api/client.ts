import type { DeliveryAttempt, DeliveryPackage, DeliveryResult, Driver, PackageStatus } from '../types'
import { getAuth } from '../auth'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080'

type UserResponse = { id: number; name: string; phone: string; role: 'ADMIN' | 'DRIVER'; active: boolean }
type PackageResponse = {
  id: number; trackingCode: string; recipient: string; phone: string; city: string; address: string; price: number
  importComment: string | null; status: string; driverId: number | null; createdAt: string; updatedAt: string
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

const statusFromApi: Record<string, PackageStatus> = {
  TO_DELIVER: 'A LIVRER', ASSIGNED: 'AFFECTE', IN_DELIVERY: 'EN LIVRAISON', AT_DEPOT: 'AU DEPOT', DELIVERED: 'LIVRE', POSTPONED: 'REPORTE', RETURNED: 'RETOUR',
}

const statusToApi: Record<PackageStatus, string> = {
  'A LIVRER': 'TO_DELIVER', AFFECTE: 'ASSIGNED', 'EN LIVRAISON': 'IN_DELIVERY', 'AU DEPOT': 'AT_DEPOT', LIVRE: 'DELIVERED', REPORTE: 'POSTPONED', RETOUR: 'RETURNED',
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
  }))
  const drivers: Driver[] = users.filter((user) => user.role === 'DRIVER').map((user) => {
    const assignedPackages = rawPackages.filter((item) => item.driverId === user.id)
    return {
      id: user.id,
      name: user.name,
      initials: user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase(),
      assigned: assignedPackages.length,
      delivered: assignedPackages.filter((item) => item.status === 'DELIVERED').length,
      earned: assignedPackages.filter((item) => item.status === 'DELIVERED')
        .reduce((total, item) => total + Number(item.price ?? 0), 0),
      returns: assignedPackages.filter((item) => item.status === 'RETURNED').length,
      active: user.active,
    }
  })
  return { packages: deliveryPackages, drivers }
}

export async function fetchDailyDashboardStats(date: string) {
  return request<DailyDashboardStats>(`/api/dashboard/stats?date=${encodeURIComponent(date)}`)
}

export async function fetchDriverPackages() {
  const rawPackages = await request<PackageResponse[]>('/api/packages/my')
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

export async function registerPackageReturn(packageId: number) {
  return request<PackageResponse>(`/api/packages/${packageId}/return`, { method: 'PATCH' })
}

export async function registerDepotArrival(packageId: number) {
  return request<PackageResponse>(`/api/packages/${packageId}/depot-arrival`, { method: 'PATCH' })
}

export async function decideDepotStatus(packageId: number, status: PackageStatus) {
  return request<PackageResponse>(`/api/packages/${packageId}/depot-decision?status=${encodeURIComponent(statusToApi[status])}`, { method: 'PATCH' })
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
