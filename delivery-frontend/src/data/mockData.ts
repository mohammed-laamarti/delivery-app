import type { DeliveryPackage, Driver } from '../types'

export const drivers: Driver[] = [
  { id: 1, name: 'Yassine El Mansouri', phone: '0600000001', initials: 'YE', assigned: 5, inProgress: 3, delivered: 21, undelivered: 2, returns: 2, active: true },
  { id: 2, name: 'Nadia Benali', phone: '0600000002', initials: 'NB', assigned: 4, inProgress: 2, delivered: 18, undelivered: 1, returns: 1, active: true },
  { id: 3, name: 'Omar Tazi', phone: '0600000003', initials: 'OT', assigned: 3, inProgress: 2, delivered: 14, undelivered: 3, returns: 3, active: true },
]

export const packages: DeliveryPackage[] = [
  { id: 1, trackingCode: 'DH22BAAC', recipient: 'Client 01', city: 'Tahla', address: 'Quartier Al Amal, 12', price: 200, driver: 'Yassine El Mansouri', status: 'EN LIVRAISON', updatedAt: 'Il y a 12 min' },
  { id: 2, trackingCode: 'DH22CA20', recipient: 'Hamza El Idrissi', city: 'Tahla', address: 'Rue Ibn Sina, 8', price: 250, driver: 'Nadia Benali', status: 'AFFECTE', updatedAt: 'Il y a 24 min' },
  { id: 3, trackingCode: 'DS22BEF42', recipient: 'Ben Tahar Lahcen', city: 'Tahla', address: 'Lotissement Al Wifaq', price: 250, driver: null, status: 'A LIVRER', updatedAt: 'Il y a 36 min' },
  { id: 4, trackingCode: 'DH22B8AD5', recipient: 'Mohamed Amine', city: 'Tahla', address: 'Hay El Qods, 21', price: 150, driver: 'Omar Tazi', status: 'LIVRE', updatedAt: 'Hier, 17:42' },
  { id: 5, trackingCode: 'DH22B993E5', recipient: 'Adnane Adnani', city: 'Tahla', address: 'Avenue Hassan II, 4', price: 229, driver: 'Yassine El Mansouri', status: 'RETOUR', updatedAt: 'Hier, 16:10' },
  { id: 6, trackingCode: 'DH22B5A43C', recipient: 'Hayat Azili', city: 'Tahla', address: 'Rue des Oliviers, 7', price: 220, driver: 'Nadia Benali', status: 'LIVRE', updatedAt: 'Hier, 15:58' },
]
