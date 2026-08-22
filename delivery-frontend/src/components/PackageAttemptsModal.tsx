import { useEffect, useState } from 'react'
import { fetchPackageAttempts, fetchPackageHistory } from '../api/client'
import type { DeliveryAttempt, DeliveryPackage, PackageHistoryEntry } from '../types'

const resultLabels: Record<DeliveryAttempt['result'], string> = {
  CLIENT_CONFIRMED: 'Client confirme',
  CLIENT_UNREACHABLE: 'Client injoignable',
  ADDRESS_NOT_FOUND: 'Adresse introuvable',
  CLIENT_REQUESTED_POSTPONEMENT: 'Demande de report',
  DELIVERED: 'Livre',
  REFUSED: 'Client refuse',
}

const statusLabels: Record<string, string> = {
  TO_CONFIRM: 'À confirmer',
  TO_RECEIVE: 'À réceptionner',
  AT_AGENCY: 'En agence',
  TO_DELIVER: 'À livrer',
  ASSIGNED: 'Affecté',
  IN_DELIVERY: 'En livraison',
  AT_DEPOT: 'Au dépôt',
  DELIVERED: 'Livré',
  POSTPONED: 'Reporté',
  RETURNED: 'Retour',
  RETURN_SHIPPED: 'Retour envoyé',
  CANCELLED: 'Annulé',
}

function historyTitle(comment: string | null) {
  const event = comment?.split(' | ')[0]
  if (event === 'CONFIRMATION_CALLBACK_REQUESTED') {
    const reminderDate = comment?.match(/Rappel: ([^|]+)/)?.[1]?.trim().slice(0, 10)
    return reminderDate ? `Livraison reportée au ${reminderDate}` : 'Livraison reportée'
  }
  const labels: Record<string, string> = {
    CONFIRMATION_NO_ANSWER: 'Client ne répond pas',
    CONFIRMATION_REFUSED: 'Client a refusé',
    CONFIRMATION_INVALID_PHONE: 'Numéro de téléphone invalide',
  }
  return labels[event ?? ''] ?? event ?? 'Mise à jour du colis'
}

function historyDetail(entry: PackageHistoryEntry) {
  const event = entry.comment?.split(' | ')[0]
  const extra = entry.comment?.split(' | ').slice(1).join(' | ')
  const reminder = extra?.match(/^Rappel: (.+)$/)
  const detail = event === 'CONFIRMATION_CALLBACK_REQUESTED'
    ? null
    : reminder
    ? (() => {
        const date = new Date(reminder[1])
        return Number.isNaN(date.getTime())
          ? extra
          : `Prévu le ${new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)}`
      })()
    : extra
  const statusChange = entry.oldStatus === entry.newStatus
    ? null
    : `${statusLabels[entry.oldStatus] ?? entry.oldStatus} → ${statusLabels[entry.newStatus] ?? entry.newStatus}`
  return [entry.userName, detail, statusChange].filter(Boolean).join(' · ')
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

export function PackageAttemptsModal({ item, onClose }: { item: DeliveryPackage; onClose: () => void }) {
  const [attempts, setAttempts] = useState<DeliveryAttempt[]>([])
  const [history, setHistory] = useState<PackageHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    let mounted = true
    void Promise.all([fetchPackageAttempts(item.id), fetchPackageHistory(item.id)])
      .then(([attemptData, historyData]) => { if (mounted) { setAttempts(attemptData); setHistory(historyData) } })
      .catch(() => { if (mounted) setError("Impossible de charger l'historique des tentatives.") })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [item.id])

  const events = [
    ...attempts.map((attempt) => ({ id: `attempt-${attempt.id}`, createdAt: attempt.createdAt, title: resultLabels[attempt.result], detail: [attempt.driverName, attempt.comment, attempt.nextDate ? `Date demandée : ${attempt.nextDate}` : null].filter(Boolean).join(' · ') })),
    ...history.map((entry) => ({ id: `history-${entry.id}`, createdAt: entry.createdAt, title: historyTitle(entry.comment), detail: historyDetail(entry) })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return <div className="attempt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Historique du colis">
    <section className="attempt-modal">
      <div className="attempt-modal-header"><div><p className="eyebrow">HISTORIQUE DU COLIS</p><h2>{item.trackingCode}</h2><p>{item.recipient} — {item.city}</p></div><button className="secondary-button" onClick={onClose}>Fermer</button></div>
      {loading && <div className="empty-state">Chargement de l’historique...</div>}
      {error && <p className="driver-message">{error}</p>}
      {!loading && !error && events.length === 0 && <div className="empty-state">Aucun événement enregistré pour ce colis.</div>}
      {!loading && !error && events.length > 0 && <div className="attempt-list">{events.map((event) => <article className="attempt-item" key={event.id}><div className="attempt-item-head"><strong>{event.title}</strong><time>{displayDate(event.createdAt)}</time></div>{event.detail && <p>{event.detail}</p>}</article>)}</div>}
    </section>
  </div>
}
