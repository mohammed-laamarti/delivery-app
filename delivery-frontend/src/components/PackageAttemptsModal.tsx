import { useEffect, useState } from 'react'
import { fetchPackageAttempts } from '../api/client'
import type { DeliveryAttempt, DeliveryPackage } from '../types'

const resultLabels: Record<DeliveryAttempt['result'], string> = {
  CLIENT_CONFIRMED: 'Client confirme',
  CLIENT_UNREACHABLE: 'Client injoignable',
  ADDRESS_NOT_FOUND: 'Adresse introuvable',
  CLIENT_REQUESTED_POSTPONEMENT: 'Demande de report',
  DELIVERED: 'Livre',
  REFUSED: 'Client refuse',
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export function PackageAttemptsModal({ item, onClose }: { item: DeliveryPackage; onClose: () => void }) {
  const [attempts, setAttempts] = useState<DeliveryAttempt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let mounted = true
    void fetchPackageAttempts(item.id)
      .then((data) => { if (mounted) setAttempts(data) })
      .catch(() => { if (mounted) setError("Impossible de charger l'historique des tentatives.") })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [item.id])

  return <div className="attempt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Historique des tentatives">
    <section className="attempt-modal">
      <div className="attempt-modal-header"><div><p className="eyebrow">HISTORIQUE LIVREUR</p><h2>{item.trackingCode}</h2><p>{item.recipient} — {item.city}</p></div><button className="secondary-button" onClick={onClose}>Fermer</button></div>
      {loading && <div className="empty-state">Chargement de l’historique...</div>}
      {error && <p className="driver-message">{error}</p>}
      {!loading && !error && attempts.length === 0 && <div className="empty-state">Aucune tentative enregistree pour ce package.</div>}
      {!loading && !error && attempts.length > 0 && <div className="attempt-list">{attempts.map((attempt) => <article className="attempt-item" key={attempt.id}><div className="attempt-item-head"><strong>{resultLabels[attempt.result]}</strong><time>{displayDate(attempt.createdAt)}</time></div><p><span>Livreur</span>{attempt.driverName}</p>{attempt.comment && <p><span>Commentaire</span>{attempt.comment}</p>}{attempt.nextDate && <p><span>Date demandee</span>{attempt.nextDate}</p>}</article>)}</div>}
    </section>
  </div>
}
