import { useState } from 'react'
import type { DeliveryPackage } from '../types'
import { PackageAttemptsModal } from './PackageAttemptsModal'

type PackageTableProps = { packages: DeliveryPackage[]; compact?: boolean; onEdit?: (item: DeliveryPackage) => void; onDelete?: (item: DeliveryPackage) => void }

const deliveryResultLabels: Record<NonNullable<DeliveryPackage['lastDeliveryResult']>, string> = {
  CONFIRMATION_IN_DISTRIBUTION: 'Mis en distribution',
  CLIENT_CONFIRMED: 'Client confirmé',
  CLIENT_ABSENT: 'Client absent',
  CLIENT_UNREACHABLE: 'Injoignable',
  ADDRESS_NOT_FOUND: 'Hors zone',
  CLIENT_REQUESTED_POSTPONEMENT: 'Reporté',
  DELIVERED: 'Livré',
  REFUSED: 'Refusé',
  RETURNED_TO_DEPOT: 'Retour dépôt',
}

function statusClass(status: DeliveryPackage['status']) {
  return status.toLowerCase().replaceAll(' ', '-')
}

function formatUpdatedAt(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date).replace(',', ' à')
}

export function PackageTable({ packages, compact = false, onEdit, onDelete }: PackageTableProps) {
  const [historyPackage, setHistoryPackage] = useState<DeliveryPackage | null>(null)
  const displayedPackages = packages.slice(0, compact ? 5 : undefined)

  return <><div className="table-wrap"><table><thead><tr><th>Colis</th><th>Magasin</th><th>Destinataire</th><th>Téléphone</th><th>Montant</th><th>Livreur</th><th>Commentaire</th><th>Statut</th><th>Mis a jour</th><th className="attempt-actions-cell">Actions</th></tr></thead><tbody>
    {displayedPackages.map((item) => <tr key={item.id}><td><strong className="tracking">{item.trackingCode}</strong></td><td dir="auto">{item.storeName || <span className="muted">—</span>}</td><td dir="auto">{item.recipient}</td><td>{item.phone ?? <span className="muted">Non renseigné</span>}</td><td>{item.price} DH</td><td>{item.driver ? item.driver : <>{item.lastDriverName ? <><span className="muted">Non affecté</span><small className="last-delivery-result">Dernier livreur : {item.lastDriverName}</small></> : <span className="muted">Non affecté</span>}</>}</td><td dir="auto"><div>{item.confirmationComment ?? item.importComment ?? <span className="muted">—</span>}</div>{item.returnShipmentReference && <small className="shipment-reference-value">Référence d’envoi : {item.returnShipmentReference}</small>}</td><td><span className={`status ${statusClass(item.status)}`}>{item.status}</span>{item.lastDeliveryResult && item.status === 'EN LIVRAISON' && <small className="last-delivery-result">{deliveryResultLabels[item.lastDeliveryResult]}</small>}</td><td className="muted">{formatUpdatedAt(item.updatedAt)}</td><td className="attempt-actions-cell"><div className="package-actions">{onEdit && <button className="package-icon-button edit" title="Modifier le colis" aria-label="Modifier le colis" onClick={() => onEdit(item)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg></button>}<button className="package-icon-button history" title="Voir l'historique" aria-label="Voir l'historique" onClick={() => setHistoryPackage(item)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4v5h5M12 7v5l3.5 2" /></svg></button>{onDelete && <button className="package-icon-button delete" title="Supprimer le colis" aria-label="Supprimer le colis" onClick={() => onDelete(item)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg></button>}</div></td></tr>)}
  </tbody></table>{packages.length === 0 && <div className="empty-state">Aucun colis ne correspond a cette recherche.</div>}</div>
    {historyPackage && <PackageAttemptsModal item={historyPackage} onClose={() => setHistoryPackage(null)} />}
  </>
}
