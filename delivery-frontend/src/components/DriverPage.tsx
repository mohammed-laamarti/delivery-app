import { useEffect, useMemo, useState } from 'react'
import { claimPackageConfirmation, confirmPackageCustomer, createConfirmationOutcome, createDeliveryAttempt, fetchDriverPackages, fetchPackageAttempts, fetchPackageHistory, registerAgencyArrival, releasePackageConfirmation, updateConfirmationComment } from '../api/client'
import { getAuth } from '../auth'
import { BarcodeScanner } from './BarcodeScanner'
import type { ConfirmationOutcome, DeliveryAttempt, DeliveryPackage, DeliveryResult, PackageHistoryEntry } from '../types'

type DriverFilter = 'TOUS' | 'A CONFIRMER' | 'A TRAITER' | 'REPORTE_AUJOURDHUI' | 'REPORTE_DEMAIN'
type MessageTone = 'info' | 'success' | 'error'
type ConfirmationState = 'available' | 'mine' | 'other' | null
type ConfirmationResult = 'CONFIRMED' | 'NO_ANSWER' | 'CALLBACK_REQUESTED' | 'REFUSED'

const filterCards: { filter: DriverFilter; label: string; tone: string }[] = [
  { filter: 'TOUS', label: 'Tous les colis', tone: 'all' },
  { filter: 'A CONFIRMER', label: 'À confirmer', tone: 'confirm' },
  { filter: 'A TRAITER', label: 'À livrer', tone: 'pending' },
  { filter: 'REPORTE_AUJOURDHUI', label: 'Reportés aujourd’hui', tone: 'postponed' },
  { filter: 'REPORTE_DEMAIN', label: 'Reportés demain', tone: 'tomorrow' },
]

const deliveryOutcomeOptions: { value: DeliveryResult; label: string }[] = [
  { value: 'DELIVERED', label: 'Livré' },
  { value: 'CLIENT_ABSENT', label: 'Client absent / pas de réponse' },
  { value: 'CLIENT_UNREACHABLE', label: 'Injoignable' },
  { value: 'CLIENT_REQUESTED_POSTPONEMENT', label: 'Reporté' },
  { value: 'REFUSED', label: 'Refusé' },
  { value: 'ADDRESS_NOT_FOUND', label: 'Adresse introuvable / hors zone' },
  { value: 'RETURNED_TO_DEPOT', label: 'Retour au dépôt' },
]

const confirmationResultOptions: { value: ConfirmationResult; label: string }[] = [
  { value: 'CONFIRMED', label: 'Client confirmé' },
  { value: 'NO_ANSWER', label: 'Ne répond pas' },
  { value: 'CALLBACK_REQUESTED', label: 'Reporter' },
  { value: 'REFUSED', label: 'Annuler le colis' },
]

const deliveryResultLabels: Record<DeliveryResult, string> = {
  CLIENT_CONFIRMED: 'Client confirmé',
  CLIENT_ABSENT: 'Client absent / pas de réponse',
  CLIENT_UNREACHABLE: 'Injoignable',
  ADDRESS_NOT_FOUND: 'Adresse introuvable / hors zone',
  CLIENT_REQUESTED_POSTPONEMENT: 'Reporté',
  DELIVERED: 'Livré',
  REFUSED: 'Refusé',
  RETURNED_TO_DEPOT: 'Retour au dépôt',
}

function deliveryCommentIsRequired(result: DeliveryResult) {
  return result === 'CLIENT_REQUESTED_POSTPONEMENT' || result === 'REFUSED' || result === 'ADDRESS_NOT_FOUND'
}

function isOpenPackage(item: DeliveryPackage) {
  return item.status === 'AFFECTE' || item.status === 'EN LIVRAISON'
}

function isDueDeliveryReport(item: DeliveryPackage) {
  const deliveryDate = item.nextDeliveryDate
  return item.status === 'REPORTE' && deliveryDate != null && deliveryDate <= localIsoDate()
}

function isFutureDeliveryReport(item: DeliveryPackage) {
  const deliveryDate = item.nextDeliveryDate
  return item.status === 'REPORTE' && deliveryDate != null && deliveryDate > localIsoDate()
}

function needsConfirmation(item: DeliveryPackage) {
  return (item.status === 'A CONFIRMER'
    || (item.status === 'EN AGENCE' && !item.confirmationComment)
    || isDueDeliveryReport(item))
    && !isFutureConfirmationReport(item)
}

function isFutureConfirmationReport(item: DeliveryPackage) {
  return Boolean(item.nextConfirmationAt && item.nextConfirmationAt.slice(0, 10) > localIsoDate())
}

function matchesReportedDate(item: DeliveryPackage, date: string) {
  // A delivery report must remain visible even when the customer was already
  // confirmed. Only confirmation callbacks are hidden after they are claimed.
  if (item.nextDeliveryDate) return item.nextDeliveryDate === date

  const scheduledDate = item.nextConfirmationAt?.slice(0, 10) ?? item.reportScheduledFor
  return scheduledDate === date && !item.confirmationDriverId
}

function canReceiveAtAgency(item: DeliveryPackage) {
  return !item.agencyReceived && (item.status === 'A CONFIRMER' || item.status === 'A RECEPTIONNER'
    || item.status === 'ANNULE' || (item.status === 'REPORTE' && Boolean(item.nextConfirmationAt)))
}

function getConfirmationState(item: DeliveryPackage, currentDriverId?: number): ConfirmationState {
  if (!needsConfirmation(item)) return null
  if (!item.confirmationDriverId) return 'available'
  return item.confirmationDriverId === currentDriverId ? 'mine' : 'other'
}

function displayAttemptDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function confirmationHistoryEvent(entry: PackageHistoryEntry) {
  const parts = entry.comment?.split(' | ') ?? []
  const event = parts[0] ?? ''
  const labels: Record<string, string> = {
    CONFIRMATION_NO_ANSWER: 'Client ne répond pas',
    CONFIRMATION_CALLBACK_REQUESTED: 'Rappel demandé',
    CONFIRMATION_REFUSED: 'Client a refusé',
    CONFIRMATION_INVALID_PHONE: 'Numéro de téléphone invalide',
  }
  // The current confirmation already has its own summary card at the top of
  // the modal, so it must not be repeated in the event timeline.
  if (event.startsWith('Confirmation client enregistrée')) return null
  if (!labels[event]) return null
  const detail = parts.slice(1).map((part) => part.startsWith('Rappel: ')
    ? `Rappel prévu : ${displayAttemptDate(part.slice('Rappel: '.length))}`
    : part).filter(Boolean).join(' · ')
  return { title: labels[event], detail }
}

function canContactCustomer(item: DeliveryPackage, currentDriverId?: number) {
  return Boolean(item.phone) && (
    Boolean(item.confirmationComment?.trim())
    || (needsConfirmation(item) && item.confirmationDriverId === currentDriverId)
    || (item.status === 'EN LIVRAISON' && item.driverId === currentDriverId)
  )
}

function localIsoDate(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function normalizeTrackingCode(value: string) {
  return value.normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]/g, '').toLowerCase()
}

function normalizePhoneNumber(value: string) {
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('00212')) return `0${digits.slice(5)}`
  if (digits.startsWith('212')) return `0${digits.slice(3)}`
  return digits
}

function matchesPackageSearch(item: DeliveryPackage, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  const textMatches = [item.trackingCode, item.recipient, item.phone ?? '', item.city]
    .some((value) => value.toLowerCase().includes(normalizedQuery))
  const phoneQuery = normalizedQuery.replace(/\D/g, '')
  const isPhoneSearch = /^[\d\s()+.-]+$/.test(query.trim())
  return textMatches || (isPhoneSearch && phoneQuery.length > 0 && (item.phone ?? '').replace(/\D/g, '').includes(phoneQuery))
}

export function DriverPage({ onLogout, driverName }: { onLogout: () => void; driverName: string }) {
  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<DriverFilter>('A TRAITER')
  const [statusFilter, setStatusFilter] = useState<'TOUS' | DeliveryPackage['status']>('TOUS')
  const [query, setQuery] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [comment, setComment] = useState('')
  const [confirmationComment, setConfirmationComment] = useState('')
  const [confirmationChannel, setConfirmationChannel] = useState<'APPEL' | 'WHATSAPP'>('APPEL')
  const [confirmationResultModalOpen, setConfirmationResultModalOpen] = useState(false)
  const [confirmationCommentEditOpen, setConfirmationCommentEditOpen] = useState(false)
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult>('CONFIRMED')
  const [editedConfirmationComment, setEditedConfirmationComment] = useState('')
  const [deliveryOutcomeModalOpen, setDeliveryOutcomeModalOpen] = useState(false)
  const [deliveryOutcome, setDeliveryOutcome] = useState<DeliveryResult>('DELIVERED')
  const [attemptHistoryOpen, setAttemptHistoryOpen] = useState(false)
  const [attempts, setAttempts] = useState<DeliveryAttempt[]>([])
  const [history, setHistory] = useState<PackageHistoryEntry[]>([])
  const [attemptsLoading, setAttemptsLoading] = useState(false)
  const [attemptsError, setAttemptsError] = useState('')
  const [nextConfirmationAt, setNextConfirmationAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState<MessageTone>('info')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraMode, setCameraMode] = useState<'SEARCH' | 'RECEPTION'>('RECEPTION')
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
  const [mobileListOpen, setMobileListOpen] = useState(false)
  const currentDriverId = getAuth()?.userId
  function showMessage(text: string, tone: MessageTone = 'info') {
    setMessageTone(tone)
    setMessage(text)
  }

  function openMobileList(nextFilter: DriverFilter) {
    setFilter(nextFilter)
    setMobileListOpen(true)
    setMobileDetailsOpen(false)
  }

  function handlePackageSearch(value: string) {
    setQuery(value)
    if (!window.matchMedia('(max-width: 1024px) and (pointer: coarse)').matches) return

    setMobileListOpen(Boolean(value.trim()))
    setMobileDetailsOpen(false)
  }

  useEffect(() => {
    let mounted = true
    async function loadPackages(initialLoad = false) {
      try {
        const items = await fetchDriverPackages()
        if (!mounted) return
        setPackages(items)
        if (initialLoad) {
          setSelectedId(items.find(isOpenPackage)?.id ?? items[0]?.id ?? null)
        }
      } catch {
        if (!mounted || !initialLoad) return
        setMessageTone('error')
        setMessage('Impossible de charger les colis. Vérifiez la connexion puis actualisez.')
      } finally {
        if (mounted && initialLoad) setLoading(false)
      }
    }

    void loadPackages(true)
    const refreshOnFocus = () => { void loadPackages() }
    const refreshOnVisibility = () => { if (document.visibilityState === 'visible') void loadPackages() }
    const refreshInterval = window.setInterval(() => { void loadPackages() }, 5_000)
    window.addEventListener('focus', refreshOnFocus)
    document.addEventListener('visibilitychange', refreshOnVisibility)
    return () => {
      mounted = false
      window.clearInterval(refreshInterval)
      window.removeEventListener('focus', refreshOnFocus)
      document.removeEventListener('visibilitychange', refreshOnVisibility)
    }
  }, [])

  const visiblePackages = useMemo(() => packages.filter((item) => {
    const today = localIsoDate()
    const tomorrow = localIsoDate(1)
    const matchesQuery = matchesPackageSearch(item, query)
    const matchesStatus = statusFilter === 'TOUS' || item.status === statusFilter
    const matchesFilter = Boolean(query.trim()) || filter === 'TOUS'
      || (filter === 'A TRAITER' && isOpenPackage(item))
      || (filter === 'A CONFIRMER' && needsConfirmation(item))
      || (filter === 'REPORTE_AUJOURDHUI' && matchesReportedDate(item, today))
      || (filter === 'REPORTE_DEMAIN' && matchesReportedDate(item, tomorrow))
    return matchesQuery && matchesStatus && matchesFilter
  }), [filter, packages, query, statusFilter])

  const selected = packages.find((item) => item.id === selectedId) ?? null
  const timelineEvents = [
    ...attempts.map((attempt) => ({
      id: `attempt-${attempt.id}`,
      createdAt: attempt.createdAt,
      title: deliveryResultLabels[attempt.result],
      userName: attempt.driverName,
      detail: [attempt.comment, attempt.nextDate ? `Date demandée : ${attempt.nextDate}` : null].filter(Boolean).join(' · '),
    })),
    ...history.flatMap((entry) => {
      const event = confirmationHistoryEvent(entry)
      return event ? [{ id: `history-${entry.id}`, createdAt: entry.createdAt, userName: entry.userName, ...event }] : []
    }),
  ].sort((first, second) => new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime())
  const confirmationCount = packages.filter((item) => {
    const state = getConfirmationState(item, currentDriverId)
    return state === 'available' || state === 'mine'
  }).length
  const today = localIsoDate()
  const tomorrow = localIsoDate(1)
  const filterCounts: Record<DriverFilter, number> = {
    TOUS: packages.length,
    'A CONFIRMER': confirmationCount,
    'A TRAITER': packages.filter(isOpenPackage).length,
    REPORTE_AUJOURDHUI: packages.filter((item) => matchesReportedDate(item, today)).length,
    REPORTE_DEMAIN: packages.filter((item) => matchesReportedDate(item, tomorrow)).length,
  }

  async function refreshPackages() {
    const items = await fetchDriverPackages()
    setPackages(items)
  }

  async function openAttemptHistory() {
    if (!selected) return
    setAttemptHistoryOpen(true)
    setAttemptsLoading(true)
    setAttemptsError('')
    setAttempts([])
    setHistory([])
    try {
      const [attemptData, historyData] = await Promise.all([fetchPackageAttempts(selected.id), fetchPackageHistory(selected.id)])
      setAttempts(attemptData)
      setHistory(historyData)
    } catch (error) {
      setAttemptsError(error instanceof Error ? error.message : 'Impossible de charger les tentatives.')
    } finally {
      setAttemptsLoading(false)
    }
  }

  async function claimConfirmation() {
    if (!selected) return
    setSaving(true)
    try {
      await claimPackageConfirmation(selected.id)
      await refreshPackages()
      showMessage('Confirmation prise en charge. Enregistrez le commentaire après l’accord du client.', 'success')
    } catch (error) { showMessage(error instanceof Error ? error.message : "La confirmation ne peut pas être prise en charge.", 'error') } finally { setSaving(false) }
  }

  async function confirmCustomer() {
    if (!selected || !confirmationComment.trim()) { showMessage('Le commentaire de confirmation est obligatoire.', 'error'); return }
    setSaving(true)
    try {
      await confirmPackageCustomer(selected.id, confirmationComment, confirmationChannel)
      await refreshPackages()
      setConfirmationComment('')
      setConfirmationResultModalOpen(false)
      showMessage(`Confirmation enregistrée par ${confirmationChannel === 'APPEL' ? 'appel' : 'WhatsApp'}.`, 'success')
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Confirmation impossible.', 'error') } finally { setSaving(false) }
  }

  async function releaseConfirmation() {
    if (!selected) return
    setSaving(true)
    try {
      await releasePackageConfirmation(selected.id)
      await refreshPackages()
      setConfirmationComment('')
      showMessage('Prise en charge abandonnée. Le colis est à nouveau disponible.', 'success')
    } catch (error) { showMessage(error instanceof Error ? error.message : "La prise en charge ne peut pas être abandonnée.", 'error') } finally { setSaving(false) }
  }

  async function saveConfirmationOutcome(outcome: ConfirmationOutcome) {
    if (!selected) return
    if (outcome === 'CALLBACK_REQUESTED' && !nextConfirmationAt) {
      showMessage('Choisissez la date du report.', 'error')
      return
    }
    setSaving(true)
    try {
      await createConfirmationOutcome(selected.id, outcome, confirmationComment, nextConfirmationAt)
      await refreshPackages()
      setConfirmationComment('')
      setNextConfirmationAt('')
      setConfirmationResultModalOpen(false)
      const messages: Record<ConfirmationOutcome, string> = {
        NO_ANSWER: 'Tentative enregistrée. Le colis est disponible pour une nouvelle tentative.',
        CALLBACK_REQUESTED: 'Rappel programmé et prise en charge libérée.',
        REFUSED: 'Refus enregistré. Le colis est annulé.',
        INVALID_PHONE: 'Numéro incorrect signalé. Le colis est disponible après correction.',
      }
      showMessage(messages[outcome], 'success')
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Résultat de confirmation impossible à enregistrer.', 'error') } finally { setSaving(false) }
  }

  function openSelectedConfirmationResult() {
    setConfirmationResult('CONFIRMED')
    setConfirmationComment('')
    setNextConfirmationAt('')
    setConfirmationResultModalOpen(true)
  }

  function continueConfirmationResult() {
    if (confirmationResult === 'CONFIRMED') {
      void confirmCustomer()
      return
    }
    void saveConfirmationOutcome(confirmationResult)
  }

  async function receiveAtAgency(item: DeliveryPackage) {
    setSaving(true)
    try {
      await registerAgencyArrival(item.id)
      await refreshPackages()
      showMessage(item.status === 'ANNULE'
        ? `Colis ${item.trackingCode} annulé reçu au dépôt.`
        : `Colis ${item.trackingCode} reçu. La confirmation client reste à faire.`, 'success')
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Réception impossible.', 'error') } finally { setSaving(false) }
  }

  async function saveConfirmationComment() {
    if (!selected || saving) return
    if (!editedConfirmationComment.trim()) {
      showMessage('Le commentaire de confirmation est obligatoire.', 'error')
      return
    }
    setSaving(true)
    try {
      await updateConfirmationComment(selected.id, editedConfirmationComment)
      await refreshPackages()
      setConfirmationCommentEditOpen(false)
      showMessage('Commentaire de confirmation modifié.', 'success')
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Modification impossible.', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function findByReceptionInput(event: React.FormEvent) {
    event.preventDefault()
    const matchingCode = packages.find((current) => normalizeTrackingCode(current.trackingCode) === normalizeTrackingCode(scanCode))
    const enteredPhone = normalizePhoneNumber(scanCode)
    const matchingPhones = enteredPhone.length >= 6
      ? packages.filter((current) => current.phone != null && normalizePhoneNumber(current.phone) === enteredPhone)
      : []
    if (!matchingCode && matchingPhones.length > 1) {
      showMessage('Plusieurs colis utilisent ce numéro. Saisissez ou scannez le code de suivi du colis.', 'error')
      return
    }
    const item = matchingCode ?? matchingPhones[0]
    if (!item) {
      showMessage('Code ou numéro introuvable. Vérifiez la saisie puis réessayez.', 'error')
      return
    }
    if (canReceiveAtAgency(item)) {
      setSelectedId(item.id)
      setScanCode('')
      setMobileListOpen(true)
      setMobileDetailsOpen(true)
      await receiveAtAgency(item)
      return
    }
    setScanCode('')
    showMessage(item.agencyReceived ? `Le colis ${item.trackingCode} est déjà réceptionné en agence.` : `Le colis ${item.trackingCode} ne peut pas être réceptionné avec son statut actuel.`, 'error')
  }

  async function handleCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const item = packages.find((current) => normalizeTrackingCode(current.trackingCode) === normalizeTrackingCode(trackingCode))
    if (!item) {
      showMessage(`Code ${trackingCode} introuvable. Vérifiez le code de suivi.`, 'error')
      return
    }
    if (canReceiveAtAgency(item)) {
      setSelectedId(item.id)
      setMobileListOpen(true)
      setMobileDetailsOpen(true)
      await receiveAtAgency(item)
      return
    }
    showMessage(item.agencyReceived ? `Le colis ${item.trackingCode} est déjà réceptionné en agence.` : `Le colis ${item.trackingCode} ne peut pas être réceptionné avec son statut actuel.`, 'error')
  }

  function handleSearchCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const item = packages.find((current) => normalizeTrackingCode(current.trackingCode) === normalizeTrackingCode(trackingCode))
    if (!item) {
      showMessage(`Code ${trackingCode} introuvable dans les colis du jour.`, 'error')
      return
    }
    setQuery(item.trackingCode)
    setSelectedId(item.id)
    setMobileListOpen(true)
    setMobileDetailsOpen(true)
    showMessage(`Colis ${item.trackingCode} trouvé. Aucun statut n’a été modifié.`)
  }

  async function saveOutcome(result: DeliveryResult) {
    if (!selected || saving) return
    if (deliveryCommentIsRequired(result) && !comment.trim()) {
      showMessage('Un commentaire est obligatoire pour ce résultat.', 'error')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await createDeliveryAttempt(selected.id, result, comment)
      const resultingStatus = result === 'DELIVERED' ? 'LIVRE' : undefined
      await refreshPackages()
      setComment('')
      setDeliveryOutcomeModalOpen(false)
      showMessage(resultingStatus === 'LIVRE' ? 'Livraison enregistrée.' : result === 'CLIENT_REQUESTED_POSTPONEMENT' ? 'Report enregistré. L’administrateur choisira la nouvelle date après le retour au dépôt.' : `Résultat enregistré : ${deliveryResultLabels[result]}.`, 'success')
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "L'action n'a pas pu être enregistrée.", 'error')
    } finally {
      setSaving(false)
    }
  }

  return <main className="driver-page">
    <header className="driver-header">
      <div><p className="eyebrow">ESPACE LIVREUR</p><h1>{driverName}</h1></div>
      <button className="secondary-button" onClick={onLogout}>Se deconnecter</button>
    </header>
    <section className={`driver-page-content ${mobileListOpen ? 'mobile-list-open' : ''} ${query.trim() ? 'mobile-search-active' : ''}`}>
      <div className="driver-tools">
        <section className="driver-tool-card search-tool-card">
          <div className="driver-tool-heading"><span className="driver-tool-icon" aria-hidden="true">⌕</span><div><strong>Rechercher dans les colis</strong><small>Recherche dans tous les colis du livreur</small></div></div>
          <div className="driver-search-controls"><input value={query} onChange={(event) => handlePackageSearch(event.target.value)} placeholder="Nom, téléphone ou code de suivi" aria-label="Rechercher dans les colis" /><button className="secondary-button" type="button" onClick={() => { setCameraMode('SEARCH'); setCameraOpen(true) }}>Scanner pour rechercher</button></div>
          <label className="driver-status-filter">Statut du colis<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setMobileListOpen(true); setMobileDetailsOpen(false) }}><option value="TOUS">Tous les statuts</option><option value="A CONFIRMER">À confirmer</option><option value="A RECEPTIONNER">À réceptionner</option><option value="EN AGENCE">En agence</option><option value="A LIVRER">À livrer</option><option value="AFFECTE">Affecté</option><option value="EN LIVRAISON">En livraison</option><option value="REPORTE">Reporté</option><option value="LIVRE">Livré</option><option value="RETOUR">Retour</option><option value="RETOUR ENVOYE">Retour envoyé</option><option value="ANNULE">Annulé</option></select></label>
        </section>
        <section className="driver-tool-card reception-tool-card">
          <div className="driver-tool-heading"><span className="driver-tool-icon" aria-hidden="true">▣</span><div><strong>Réception en agence</strong><small>Scannez le colis pour enregistrer sa réception</small></div></div>
          <form onSubmit={findByReceptionInput} className="driver-scan-form">
            <input value={scanCode} onChange={(event) => { setScanCode(event.target.value); if (messageTone === 'error') setMessage('') }} placeholder="Scanner ou saisir le code / téléphone" aria-label="Code de suivi ou téléphone à réceptionner" />
            <button className="primary-button" disabled={saving || !scanCode.trim()} type="submit">Réceptionner</button>
            <button className="secondary-button camera-button" type="button" disabled={saving} onClick={() => { setCameraMode('RECEPTION'); setCameraOpen(true) }}>Caméra</button>
          </form>
        </section>
      </div>
      <section className={`driver-filter-cards ${mobileListOpen ? 'mobile-list-open' : ''}`} aria-label="Filtres des colis">{filterCards.map((item) => <button key={item.filter} className={`driver-filter-card ${item.tone} ${filter === item.filter ? 'active' : ''}`} onClick={() => openMobileList(item.filter)}><span>{item.label}</span><strong>{filterCounts[item.filter]}</strong><small>{filter === item.filter ? 'Liste affichée' : 'Afficher les colis'}</small></button>)}</section>
      {message && <p className={`driver-message ${messageTone}`} role={messageTone === 'error' ? 'alert' : 'status'}>{message}</p>}
      <div className="driver-workspace">
        <div className="driver-package-list">
          <div className="driver-mobile-list-header"><button className="secondary-button" onClick={() => setMobileListOpen(false)}>← Retour aux catégories</button><strong>{filterCards.find((item) => item.filter === filter)?.label}</strong></div>
          {loading && <div className="empty-state">Chargement de votre tournee...</div>}
          {!loading && visiblePackages.map((item) => {
            const confirmationState = getConfirmationState(item, currentDriverId)
            const confirmationLabel = confirmationState === 'available' ? 'Disponible' : confirmationState === 'mine' ? 'Pris par moi' : confirmationState === 'other' ? 'Pris par un autre' : null
            const cardComment = item.confirmationComment?.trim() || item.importComment?.trim()
            return <button className={`driver-package ${selected?.id === item.id ? 'selected' : ''} ${confirmationState ? `confirmation-${confirmationState}` : ''}`} key={item.id} onClick={() => { setSelectedId(item.id); setMobileDetailsOpen(true); setMessage('') }}>
            <div><strong className="tracking">{item.trackingCode}</strong><h3>{item.recipient}</h3><p>{item.city} - {item.address}</p><p className="driver-package-price">{item.price} DH</p>{cardComment && <p className="driver-package-comment" title={cardComment}>Commentaire : {cardComment}</p>}</div>
            <div className="driver-package-badges"><span className={`status ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span>{confirmationLabel && <span className={`confirmation-state ${confirmationState}`}>{confirmationLabel}</span>}</div>
          </button>
          })}
          {!loading && visiblePackages.length === 0 && <div className="empty-state">Aucun colis dans cette liste.</div>}
        </div>
        <aside className={`delivery-panel ${mobileDetailsOpen ? 'mobile-open' : ''}`}>
          {!selected && <div className="empty-state">Sélectionnez un colis pour commencer.</div>}
          {selected && <>
            <button className="driver-mobile-back secondary-button" onClick={() => setMobileDetailsOpen(false)}>← Retour a la tournee</button>
            <div className="delivery-panel-heading"><div><strong className="tracking">{selected.trackingCode}</strong><h2>{selected.recipient}</h2></div><span className={`status ${selected.status.toLowerCase().replaceAll(' ', '-')}`}>{selected.status}</span></div>
            <div className="delivery-details"><p><span>Téléphone</span><a href={`tel:${selected.phone}`}>{selected.phone || 'Non renseigné'}</a></p><p><span>Adresse importée</span><strong>{selected.address}, {selected.city}</strong></p><p><span>Montant</span><strong>{selected.price} DH</strong></p>{selected.lastDeliveryResult && selected.status === 'EN LIVRAISON' && <p><span>Dernier résultat de livraison</span><strong>{deliveryResultLabels[selected.lastDeliveryResult]}</strong></p>}{selected.confirmationComment && <p><span>Commentaire de confirmation</span><strong>{selected.confirmationComment}</strong>{selected.confirmedByDriverId === currentDriverId && <button className="text-button edit-confirmation-comment" onClick={() => { setEditedConfirmationComment(selected.confirmationComment ?? ''); setConfirmationCommentEditOpen(true) }}>Modifier</button>}</p>}{selected.confirmationChannel && <p><span>Canal</span><strong>{selected.confirmationChannel === 'APPEL' ? 'Appel téléphonique' : 'WhatsApp'}</strong></p>}</div>
            <button className="secondary-button attempt-history-button" onClick={() => void openAttemptHistory()}>Voir les tentatives et commentaires</button>
            {selected.status === 'EN AGENCE' && !selected.confirmationComment && <p className="driver-message">Colis reçu en agence. La confirmation client peut encore être faite.</p>}
            {isFutureConfirmationReport(selected) && <p className="driver-message">Confirmation reportée au {selected.nextConfirmationAt?.slice(0, 10)}. Elle sera disponible à cette date.</p>}
            {isFutureDeliveryReport(selected) && <p className="driver-message">Relivraison reportée au {selected.nextDeliveryDate}. Elle sera disponible à cette date.</p>}
            {canContactCustomer(selected, currentDriverId) && <div className="confirmation-contact-actions">
              <a className={`confirmation-contact-button phone ${confirmationChannel === 'APPEL' ? 'selected' : ''}`} onClick={() => setConfirmationChannel('APPEL')} href={`tel:${selected.phone}`}><span aria-hidden="true">☎</span>Appeler</a>
              <a className={`confirmation-contact-button whatsapp ${confirmationChannel === 'WHATSAPP' ? 'selected' : ''}`} onClick={() => setConfirmationChannel('WHATSAPP')} target="_blank" rel="noreferrer" href={`https://wa.me/${(selected.phone ?? '').replace(/\D/g, '').replace(/^0/, '212')}`}><span aria-hidden="true">◉</span>WhatsApp</a>
            </div>}
            {needsConfirmation(selected) && <>
              {selected.confirmationDriverId && selected.confirmationDriverId !== currentDriverId ? <p className="driver-message info">Cette confirmation est déjà prise en charge par un autre livreur.</p> : selected.confirmationDriverId === currentDriverId ? <>
                <div className="confirmation-result-actions"><button className="primary-button" disabled={saving} onClick={openSelectedConfirmationResult}>Enregistrer le résultat</button><button className="secondary-button" disabled={saving} onClick={() => void releaseConfirmation()}>Abandonner la prise en charge</button></div>
              </> : <button className="primary-button confirmation-claim-button" disabled={saving} onClick={() => void claimConfirmation()}>Prendre en charge la confirmation</button>}
            </>}
            {selected.status === 'AFFECTE' && <p className="driver-message">Ce colis doit être scanné au dépôt avant de pouvoir être livré.</p>}
            {selected.status === 'EN LIVRAISON' && selected.driverId === currentDriverId && <>
              <button className="primary-button delivery-complete-button" disabled={saving} onClick={() => { setDeliveryOutcome('DELIVERED'); setComment(''); setDeliveryOutcomeModalOpen(true) }}>Enregistrer le résultat</button>
            </>}
          </>}
        </aside>
      </div>
    </section>
    {cameraOpen && <BarcodeScanner onDetected={cameraMode === 'SEARCH' ? handleSearchCameraCode : handleCameraCode} onClose={() => setCameraOpen(false)} />}
    {attemptHistoryOpen && selected && <div className="attempt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Tentatives du colis">
      <section className="attempt-modal driver-attempt-history-modal">
        <div className="attempt-modal-header"><div><p className="eyebrow">SUIVI DU COLIS</p><h2>{selected.trackingCode}</h2><p>{selected.recipient}</p></div><button className="secondary-button" onClick={() => setAttemptHistoryOpen(false)}>Fermer</button></div>
        {selected.importComment && <article className="attempt-item"><div className="attempt-item-head"><strong>Note du colis</strong>{selected.createdAt && <time>{displayAttemptDate(selected.createdAt)}</time>}</div><p>{selected.importComment}</p></article>}
        {selected.confirmationComment && <article className="attempt-item"><div className="attempt-item-head"><strong>Client confirmé {selected.confirmationChannel === 'WHATSAPP' ? 'par WhatsApp' : 'par appel'}</strong>{selected.confirmedAt && <time>{displayAttemptDate(selected.confirmedAt)}</time>}</div><p>{selected.confirmationComment}</p></article>}
        {attemptsLoading && <div className="empty-state">Chargement des tentatives...</div>}
        {attemptsError && <p className="driver-message error">{attemptsError}</p>}
        {!attemptsLoading && !attemptsError && timelineEvents.length === 0 && <div className="empty-state">Aucune tentative ou résultat de confirmation enregistré.</div>}
        {!attemptsLoading && !attemptsError && timelineEvents.length > 0 && <div className="attempt-list">{timelineEvents.map((event) => <article className="attempt-item" key={event.id}><div className="attempt-item-head"><strong>{event.title}</strong><time>{displayAttemptDate(event.createdAt)}</time></div><p><span>{event.userName}</span>{event.detail || 'Aucun commentaire'}</p></article>)}</div>}
      </section>
    </div>}
    {confirmationCommentEditOpen && selected && <div className="attempt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Modifier le commentaire de confirmation">
      <section className="attempt-modal confirmation-modal">
        <div className="attempt-modal-header"><div><p className="eyebrow">COMMENTAIRE DE CONFIRMATION</p><h2>{selected.trackingCode}</h2><p>{selected.recipient}</p></div><button className="secondary-button" disabled={saving} onClick={() => setConfirmationCommentEditOpen(false)}>Fermer</button></div>
        <label className="driver-comment">Commentaire (obligatoire)<textarea autoFocus value={editedConfirmationComment} onChange={(event) => setEditedConfirmationComment(event.target.value)} rows={4} /></label>
        <div className="form-actions"><button className="secondary-button" disabled={saving} onClick={() => setConfirmationCommentEditOpen(false)}>Annuler</button><button className="primary-button" disabled={saving} onClick={() => void saveConfirmationComment()}>{saving ? 'Enregistrement...' : 'Enregistrer la modification'}</button></div>
      </section>
    </div>}
    {confirmationResultModalOpen && selected && <div className="attempt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Résultat de confirmation">
      <section className="attempt-modal confirmation-modal">
        <div className="attempt-modal-header"><div><p className="eyebrow">RÉSULTAT DE CONFIRMATION</p><h2>{selected.trackingCode}</h2><p>{selected.recipient}</p></div><button className="secondary-button" disabled={saving} onClick={() => setConfirmationResultModalOpen(false)}>Fermer</button></div>
        <label className="driver-comment">Résultat<select value={confirmationResult} onChange={(event) => setConfirmationResult(event.target.value as ConfirmationResult)}>{confirmationResultOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="driver-comment">Commentaire {confirmationResult === 'CONFIRMED' ? '(obligatoire)' : '(optionnel)'}<textarea autoFocus value={confirmationComment} onChange={(event) => setConfirmationComment(event.target.value)} placeholder="Ex. près de la mosquée Al Qods, appeler avant arrivée" rows={3} /></label>
        {confirmationResult === 'CALLBACK_REQUESTED' && <label className="driver-date">Date du rappel<input min={localIsoDate()} type="date" value={nextConfirmationAt} onChange={(event) => setNextConfirmationAt(event.target.value)} /></label>}
        {confirmationResult === 'REFUSED' && <p className="driver-message error">Le colis sera annulé et ne pourra plus être livré.</p>}
        <div className="form-actions"><button className="secondary-button" disabled={saving} onClick={() => setConfirmationResultModalOpen(false)}>Annuler</button><button className="primary-button" disabled={saving} onClick={continueConfirmationResult}>{saving ? 'Enregistrement...' : confirmationResult === 'CONFIRMED' ? 'Confirmer le client' : confirmationResult === 'CALLBACK_REQUESTED' ? 'Programmer le rappel' : 'Enregistrer'}</button></div>
      </section>
    </div>}
    {deliveryOutcomeModalOpen && selected && <div className="attempt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Résultat de livraison">
      <section className="attempt-modal confirmation-modal">
        <div className="attempt-modal-header"><div><p className="eyebrow">RÉSULTAT DE LIVRAISON</p><h2>{selected.trackingCode}</h2><p>{selected.recipient}</p></div><button className="secondary-button" disabled={saving} onClick={() => setDeliveryOutcomeModalOpen(false)}>Fermer</button></div>
        <label className="driver-comment">Résultat<select value={deliveryOutcome} onChange={(event) => setDeliveryOutcome(event.target.value as DeliveryResult)}>{deliveryOutcomeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="driver-comment">Commentaire {deliveryCommentIsRequired(deliveryOutcome) ? '(obligatoire)' : '(optionnel)'}<textarea autoFocus value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Ajoutez une précision utile pour l’administrateur" rows={3} /></label>
        <div className="form-actions"><button className="secondary-button" disabled={saving} onClick={() => setDeliveryOutcomeModalOpen(false)}>Annuler</button><button className="primary-button" disabled={saving} onClick={() => void saveOutcome(deliveryOutcome)}>{saving ? 'Enregistrement...' : 'Enregistrer'}</button></div>
      </section>
    </div>}
  </main>
}
