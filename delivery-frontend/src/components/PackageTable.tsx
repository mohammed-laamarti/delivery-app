import type { DeliveryPackage } from '../types'

type PackageTableProps = { packages: DeliveryPackage[]; compact?: boolean }

function statusClass(status: DeliveryPackage['status']) {
  return status.toLowerCase().replaceAll(' ', '-')
}

export function PackageTable({ packages, compact = false }: PackageTableProps) {
  return <div className="table-wrap"><table><thead><tr><th>Package</th><th>Destinataire</th><th>Zone</th><th>Montant</th><th>Livreur</th><th>Statut</th><th>Mis à jour</th></tr></thead><tbody>
    {packages.slice(0, compact ? 5 : undefined).map((item) => <tr key={item.id}><td><strong className="tracking">{item.trackingCode}</strong></td><td>{item.recipient}</td><td>{item.city}</td><td>{item.price} DH</td><td>{item.driver ?? <span className="muted">Non affecté</span>}</td><td><span className={`status ${statusClass(item.status)}`}>{item.status}</span></td><td className="muted">{item.updatedAt}</td></tr>)}
  </tbody></table>{packages.length === 0 && <div className="empty-state">Aucun package ne correspond à cette recherche.</div>}</div>
}
