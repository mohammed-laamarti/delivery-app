export type Page = 'dashboard' | 'packages' | 'reception' | 'scanner' | 'drivers' | 'driver-details' | 'returns'

export type PackageStatus = 'A CONFIRMER' | 'A RECEPTIONNER' | 'EN AGENCE' | 'A LIVRER' | 'AFFECTE' | 'EN LIVRAISON' | 'AU DEPOT' | 'LIVRE' | 'REPORTE' | 'RETOUR'

export type DeliveryResult =
  | 'CLIENT_CONFIRMED'
  | 'CLIENT_UNREACHABLE'
  | 'ADDRESS_NOT_FOUND'
  | 'CLIENT_REQUESTED_POSTPONEMENT'
  | 'DELIVERED'
  | 'REFUSED'

export type DeliveryAttempt = {
  id: number
  packageId: number
  driverId: number
  driverName: string
  result: DeliveryResult
  comment: string | null
  nextDate: string | null
  createdAt: string
}

export type DeliveryPackage = {
  id: number
  trackingCode: string
  recipient: string
  phone?: string
  city: string
  address: string
  price: number
  importComment?: string | null
  confirmationComment?: string | null
  confirmationChannel?: 'APPEL' | 'WHATSAPP' | null
  driver: string | null
  driverId?: number | null
  lastDriverId?: number | null
  confirmationDriverId?: number | null
  agencyReceived?: boolean
  agencyReceiverDriverId?: number | null
  nextDeliveryDate?: string | null
  status: PackageStatus
  createdAt?: string
  updatedAt: string
}

export type Driver = {
  id: number
  name: string
  phone: string
  initials: string
  assigned: number
  inProgress: number
  delivered: number
  earned?: number
  undelivered: number
  active: boolean
}
