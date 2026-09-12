import { useState } from 'react'
import type { DeliveryPackage } from '../types'
import { PackageAttemptsModal } from './PackageAttemptsModal'

type PackageTableProps = {
  packages: DeliveryPackage[]
  compact?: boolean
  onEdit?: (item: DeliveryPackage) => void
  onDelete?: (item: DeliveryPackage) => void
  selectedIds?: Set<number>
  onSelectionChange?: (ids: Set<number>) => void
  selectionDisabled?: boolean
}

const deliveryResultLabels: Record<NonNullable<DeliveryPackage['lastDeliveryResult']>, string> = {
  CONFIRMATION_IN_DISTRIBUTION: 'Mis en distribution', CLIENT_CONFIRMED: 'Client confirmé', CLIENT_ABSENT: 'Client absent',
  CLIENT_UNREACHABLE: 'Injoignable', ADDRESS_NOT_FOUND: 'Hors zone', CLIENT_REQUESTED_POSTPONEMENT: 'Reporté',
  DELIVERED: 'Livré', REFUSED: 'Refusé', RETURNED_TO_DEPOT: 'Retour dépôt',
}

function statusClass(status: DeliveryPackage['status']) { return status.toLowerCase().replaceAll(' ', '-') }

function deliveryResultClass(result: NonNullable<DeliveryPackage['lastDeliveryResult']>) {
  const classes: Record<NonNullable<DeliveryPackage['lastDeliveryResult']>, string> = {
    CONFIRMATION_IN_DISTRIBUTION: 'mis-en-distribution', CLIENT_CONFIRMED: 'a-confirmer', CLIENT_ABSENT: 'client-absent',
    CLIENT_UNREACHABLE: 'injoignable', ADDRESS_NOT_FOUND: 'hors-zone', CLIENT_REQUESTED_POSTPONEMENT: 'reporte',
    DELIVERED: 'livre', REFUSED: 'refuse', RETURNED_TO_DEPOT: 'retour-au-depot',
  }
  return classes[result]
}

function PackageStatusCell({ item }: { item: DeliveryPackage }) {
  const latestDeliveryStatus = item.status === 'EN LIVRAISON' ? item.lastDeliveryResult : null
  return <div className="package-status-cell">
    <span className={`status ${latestDeliveryStatus ? deliveryResultClass(latestDeliveryStatus) : statusClass(item.status)}`}>
      {latestDeliveryStatus ? deliveryResultLabels[latestDeliveryStatus] : item.status}
    </span>
    {latestDeliveryStatus && <small className="last-delivery-result previous-delivery-status">En livraison</small>}
  </div>
}

function formatUpdatedAt(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date).replace(',', ' à')
}

export function PackageTable({ packages, compact = false, onEdit, onDelete, selectedIds, onSelectionChange, selectionDisabled = false }: PackageTableProps) {
  const [historyPackage, setHistoryPackage] = useState<DeliveryPackage | null>(null)
  const displayedPackages = packages.slice(0, compact ? 5 : undefined)
  const selectionEnabled = onSelectionChange != null && selectedIds != null
  const allDisplayedSelected = displayedPackages.length > 0 && displayedPackages.every((item) => selectedIds?.has(item.id))
  const someDisplayedSelected = displayedPackages.some((item) => selectedIds?.has(item.id))

  function toggleSelection(id: number) {
    if (!selectedIds || !onSelectionChange) return
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  function toggleAllDisplayed() {
    if (!selectedIds || !onSelectionChange) return
    const next = new Set(selectedIds)
    if (allDisplayedSelected) displayedPackages.forEach((item) => next.delete(item.id))
    else displayedPackages.forEach((item) => next.add(item.id))
    onSelectionChange(next)
  }

  return <>
    <div className="table-wrap"><table><thead><tr>
      {selectionEnabled && <th className="package-select-cell"><input type="checkbox" aria-label="Sélectionner tous les colis de cette page" checked={allDisplayedSelected} ref={(input) => { if (input) input.indeterminate = !allDisplayedSelected && someDisplayedSelected }} disabled={selectionDisabled} onChange={toggleAllDisplayed} /></th>}
      <th>Colis</th><th>Magasin</th><th>Destinataire</th><th>Téléphone</th><th>Montant</th><th>Livreur</th><th>Commentaire</th><th>Statut</th><th>Mis a jour</th><th className="attempt-actions-cell">Actions</th>
    </tr></thead><tbody>
      {displayedPackages.map((item) => <tr key={item.id}>
        {selectionEnabled && <td className="package-select-cell"><input type="checkbox" aria-label={`Sélectionner le colis ${item.trackingCode}`} checked={selectedIds.has(item.id)} disabled={selectionDisabled} onChange={() => toggleSelection(item.id)} /></td>}
        <td><strong className="tracking">{item.trackingCode}</strong></td>
        <td dir="auto">{item.storeName || <span className="muted">—</span>}</td>
        <td dir="auto">{item.recipient}</td>
        <td>{item.phone ?? <span className="muted">Non renseigné</span>}</td>
        <td>{item.price} DH</td>
        <td>{item.driver ? item.driver : <>{item.lastDriverName ? <><span className="muted">Non affecté</span><small className="last-delivery-result">Dernier livreur : {item.lastDriverName}</small></> : <span className="muted">Non affecté</span>}</>}</td>
        <td dir="auto"><div>{item.confirmationComment ?? item.importComment ?? <span className="muted">—</span>}</div>{item.returnShipmentReference && <small className="shipment-reference-value">Référence d’envoi : {item.returnShipmentReference}</small>}</td>
        <td><PackageStatusCell item={item} /></td>
        <td className="muted">{formatUpdatedAt(item.updatedAt)}</td>
        <td className="attempt-actions-cell"><div className="package-actions">
          {onEdit && <button className="package-icon-button edit" title="Modifier le colis" aria-label="Modifier le colis" onClick={() => onEdit(item)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg></button>}
          <button className="package-icon-button history" title="Voir l'historique" aria-label="Voir l'historique" onClick={() => setHistoryPackage(item)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4v5h5M12 7v5l3.5 2" /></svg></button>
          {onDelete && <button className="package-icon-button delete" title="Supprimer le colis" aria-label="Supprimer le colis" onClick={() => onDelete(item)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg></button>}
        </div></td>
      </tr>)}
    </tbody></table>{packages.length === 0 && <div className="empty-state">Aucun colis ne correspond a cette recherche.</div>}</div>
    {historyPackage && <PackageAttemptsModal item={historyPackage} onClose={() => setHistoryPackage(null)} />}
  </>
}
