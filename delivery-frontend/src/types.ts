export type Page = 'dashboard' | 'packages' | 'assignment' | 'scanner' | 'drivers' | 'returns'

export type PackageStatus = 'A LIVRER' | 'AFFECTE' | 'EN LIVRAISON' | 'LIVRE' | 'REPORTE' | 'RETOUR'

export type DeliveryResult =
  | 'CLIENT_CONFIRMED'
  | 'CLIENT_UNREACHABLE'
  | 'ADDRESS_NOT_FOUND'
  | 'CLIENT_REQUESTED_POSTPONEMENT'
  | 'DELIVERED'
  | 'REFUSED'

export type DeliveryPackage = {
  id: number
  trackingCode: string
  recipient: string
  phone?: string
  city: string
  address: string
  price: number
  driver: string | null
  driverId?: number | null
  status: PackageStatus
  updatedAt: string
}

export type Driver = {
  id: number
  name: string
  initials: string
  assigned: number
  delivered: number
  returns: number
  active: boolean
}
