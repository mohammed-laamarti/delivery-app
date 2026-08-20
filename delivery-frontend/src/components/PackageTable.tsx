import { useState } from 'react'
import type { DeliveryPackage } from '../types'
import { PackageAttemptsModal } from './PackageAttemptsModal'

type PackageTableProps = { packages: DeliveryPackage[]; compact?: boolean }

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

export function PackageTable({ packages, compact = false }: PackageTableProps) {
  const [historyPackage, setHistoryPackage] = useState<DeliveryPackage | null>(null)
  const displayedPackages = packages.slice(0, compact ? 5 : undefined)

  return <><div className="table-wrap"><table><thead><tr><th>Colis</th><th>Destinataire</th><th>Zone</th><th>Montant</th><th>Livreur</th><th>Statut</th><th>Mis a jour</th><th className="attempt-actions-cell">Actions</th></tr></thead><tbody>
    {displayedPackages.map((item) => <tr key={item.id}><td><strong className="tracking">{item.trackingCode}</strong></td><td>{item.recipient}</td><td>{item.city}</td><td>{item.price} DH</td><td>{item.driver ?? <span className="muted">Non affecte</span>}</td><td><span className={`status ${statusClass(item.status)}`}>{item.status}</span></td><td className="muted">{formatUpdatedAt(item.updatedAt)}</td><td className="attempt-actions-cell"><button className="text-button" onClick={() => setHistoryPackage(item)}>Tentatives</button></td></tr>)}
  </tbody></table>{packages.length === 0 && <div className="empty-state">Aucun colis ne correspond a cette recherche.</div>}</div>
    {historyPackage && <PackageAttemptsModal item={historyPackage} onClose={() => setHistoryPackage(null)} />}
  </>
}
