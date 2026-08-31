import { useEffect, useMemo, useRef, useState } from 'react'
import { claimPackageConfirmation, confirmPackageCustomer, createConfirmationOutcome, createDeliveryAttempt, fetchDriverPackages, fetchPackageAttempts, fetchPackageHistory, registerAgencyArrival, releasePackageConfirmation, reopenCancelledConfirmation, updateConfirmationComment } from '../api/client'
import { getAuth } from '../auth'
import { BarcodeScanner } from './BarcodeScanner'
import type { ConfirmationOutcome, DeliveryAttempt, DeliveryPackage, DeliveryResult, PackageHistoryEntry } from '../types'

type DriverFilter = 'TOUS' | 'MIS EN DISTRIBUTION' | 'CONFIRMES' | 'A TRAITER' | 'REPORTE_AUJOURDHUI' | 'REPORTE_DEMAIN'
type PackageDateFilter = 'TOUTES' | 'AUJOURDHUI' | 'HIER' | 'PLUS_ANCIENS'
type MessageTone = 'info' | 'success' | 'error'
type ConfirmationState = 'available' | 'mine' | 'other' | null
type ConfirmationResult = 'CONFIRMED' | 'IN_DISTRIBUTION' | 'NO_ANSWER' | 'VOICEMAIL' | 'OUT_OF_ZONE' | 'CALLBACK_REQUESTED' | 'REFUSED'

function QrCodeIcon() {
  return <svg className="driver-qr-icon" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path fillRule="evenodd" d="M2 2h8v8H2V2Zm2 2v4h4V4H4Zm10-2h8v8h-8V2Zm2 2v4h4V4h-4ZM2 14h8v8H2v-8Zm2 2v4h4v-4H4Z" clipRule="evenodd" />
    <path d="M12 12h3v3h-3v-3Zm4 0h2v2h-2v-2Zm4 0h2v4h-2v-4Zm-8 4h2v2h-2v-2Zm3 3h3v3h-3v-3Zm4-2h3v2h-3v-2Zm1 3h2v2h-2v-2Zm-8 0h2v2h-2v-2Z" />
  </svg>
}

const filterCards: { filter: DriverFilter; label: string; tone: string }[] = [
  { filter: 'TOUS', label: 'Tous les colis', tone: 'all' },
  { filter: 'MIS EN DISTRIBUTION', label: 'Mis en distribution', tone: 'confirm' },
  { filter: 'CONFIRMES', label: 'Confirmés', tone: 'confirmed' },
  { filter: 'A TRAITER', label: 'À livrer', tone: 'pending' },
  { filter: 'REPORTE_AUJOURDHUI', label: 'Reportés aujourd’hui', tone: 'postponed' },
  { filter: 'REPORTE_DEMAIN', label: 'Reportés demain', tone: 'tomorrow' },
]

const statusOptions: { value: DeliveryPackage['status']; label: string }[] = [
  { value: 'MIS EN DISTRIBUTION', label: 'Mis en distribution' },
  { value: 'PAS DE REPONSE', label: 'Pas de réponse' },
  { value: 'BOITE VOCALE', label: 'Boîte vocale' },
  { value: 'HORS ZONE', label: 'Hors zone' },
  { value: 'A RECEPTIONNER', label: 'À réceptionner' },
  { value: 'EN AGENCE', label: 'En agence' },
  { value: 'A LIVRER', label: 'À livrer' },
  { value: 'AFFECTE', label: 'Affecté' },
  { value: 'EN LIVRAISON', label: 'En livraison' },
  { value: 'REPORTE', label: 'Reporté' },
  { value: 'LIVRE', label: 'Livré' },
  { value: 'RETOUR', label: 'Retour' },
  { value: 'RETOUR ENVOYE', label: 'Retour envoyé' },
  { value: 'ANNULE', label: 'Annulé' },
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
  { value: 'IN_DISTRIBUTION', label: 'Mis en distribution' },
  { value: 'NO_ANSWER', label: 'Pas de réponse' },
  { value: 'VOICEMAIL', label: 'Boîte vocale' },
  { value: 'OUT_OF_ZONE', label: 'Hors zone' },
  { value: 'CALLBACK_REQUESTED', label: 'Reporter' },
  { value: 'REFUSED', label: 'Annuler le colis' },
]

const deliveryResultLabels: Record<DeliveryResult, string> = {
  CONFIRMATION_IN_DISTRIBUTION: 'Mis en distribution',
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
  return (item.status === 'MIS EN DISTRIBUTION'
    || item.status === 'PAS DE REPONSE'
    || item.status === 'BOITE VOCALE'
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

function isReservedFollowUp(item: DeliveryPackage) {
  return (item.status === 'PAS DE REPONSE' || item.status === 'BOITE VOCALE')
    && Boolean(item.confirmationFollowUpDriverId)
}

function confirmationOwnerId(item: DeliveryPackage) {
  return item.confirmationDriverId ?? (isReservedFollowUp(item) ? item.confirmationFollowUpDriverId : null)
}

function canReceiveAtAgency(item: DeliveryPackage) {
  return !item.agencyReceived && (item.status === 'MIS EN DISTRIBUTION' || item.status === 'PAS DE REPONSE' || item.status === 'BOITE VOCALE' || item.status === 'HORS ZONE' || item.status === 'A RECEPTIONNER'
    || item.status === 'ANNULE' || (item.status === 'REPORTE' && Boolean(item.nextConfirmationAt)))
}

function getConfirmationState(item: DeliveryPackage, currentDriverId?: number): ConfirmationState {
  if (isReservedFollowUp(item) && item.confirmationFollowUpDriverId) {
    return item.confirmationFollowUpDriverId === currentDriverId ? 'mine' : 'other'
  }
  if (!needsConfirmation(item)) return null
  if (!item.confirmationDriverId) return 'available'
  return item.confirmationDriverId === currentDriverId ? 'mine' : 'other'
}

function isDistributionConfirmation(item: DeliveryPackage) {
  return needsConfirmation(item) && item.status !== 'PAS DE REPONSE' && item.status !== 'BOITE VOCALE'
}

function displayPackageStatus(status: DeliveryPackage['status']) {
  if (status === 'MIS EN DISTRIBUTION') return 'MIS EN DISTRIBUTION'
  if (status === 'BOITE VOCALE') return 'Boîte vocale'
  if (status === 'HORS ZONE') return 'Hors zone'
  return status
}

function canModifyConfirmation(item: DeliveryPackage) {
  return item.status === 'ANNULE' || item.status === 'REPORTE' || item.status === 'PAS DE REPONSE'
    || item.status === 'BOITE VOCALE' || item.status === 'HORS ZONE'
    || Boolean(item.confirmationComment?.trim())
}

function displayAttemptDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function confirmationHistoryEvent(entry: PackageHistoryEntry) {
  const parts = entry.comment?.split(' | ') ?? []
  const event = parts[0] ?? ''
  const labels: Record<string, string> = {
    CONFIRMATION_NO_ANSWER: 'Pas de réponse',
    CONFIRMATION_VOICEMAIL: 'Boîte vocale',
    CONFIRMATION_OUT_OF_ZONE: 'Hors zone',
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
    || (isReservedFollowUp(item) && item.confirmationFollowUpDriverId === currentDriverId)
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

function packageDateLabel(createdAt?: string) {
  if (!createdAt) return null
  const date = createdAt.slice(0, 10)
  if (date === localIsoDate()) return 'Ajouté aujourd’hui'
  if (date === localIsoDate(-1)) return 'Ajouté hier'
  return `Ajouté le ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(`${date}T12:00:00`))}`
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

function matchesStatusFilter(item: DeliveryPackage, status: DeliveryPackage['status']) {
  // Physical reception and the workflow status are separate pieces of state:
  // an unconfirmed parcel can be received at the agency while remaining in
  // the confirmation queue as "MIS EN DISTRIBUTION".
  if (status === 'EN AGENCE') return item.status === 'EN AGENCE' || Boolean(item.agencyReceived)
  return item.status === status
}

export function DriverPage({ onLogout, driverName }: { onLogout: () => void; driverName: string }) {
  const statusFilterRef = useRef<HTMLDetailsElement>(null)
  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<DriverFilter>('A TRAITER')
  const [statusFilters, setStatusFilters] = useState<DeliveryPackage['status'][]>([])
  const [dateFilter, setDateFilter] = useState<PackageDateFilter>('TOUTES')
  const [query, setQuery] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [comment, setComment] = useState('')
  const [confirmationComment, setConfirmationComment] = useState('')
  const [confirmationChannel, setConfirmationChannel] = useState<'APPEL' | 'WHATSAPP'>('APPEL')
  const [confirmationResultModalOpen, setConfirmationResultModalOpen] = useState(false)
  const [confirmationCommentEditOpen, setConfirmationCommentEditOpen] = useState(false)
  const [confirmationReopenPromptOpen, setConfirmationReopenPromptOpen] = useState(false)
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
  const [activeDriverTool, setActiveDriverTool] = useState<'SEARCH' | 'RECEPTION'>('SEARCH')
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

  useEffect(() => {
    function closeStatusFilterOnOutsideClick(event: PointerEvent) {
      const menu = statusFilterRef.current
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.open = false
    }
    function closeStatusFilterOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && statusFilterRef.current?.open) statusFilterRef.current.open = false
    }
    document.addEventListener('pointerdown', closeStatusFilterOnOutsideClick)
    document.addEventListener('keydown', closeStatusFilterOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeStatusFilterOnOutsideClick)
      document.removeEventListener('keydown', closeStatusFilterOnEscape)
    }
  }, [])

  const visiblePackages = useMemo(() => packages.filter((item) => {
    const today = localIsoDate()
    const yesterday = localIsoDate(-1)
    const tomorrow = localIsoDate(1)
    const matchesQuery = matchesPackageSearch(item, query)
    const matchesStatus = statusFilters.length === 0
      || statusFilters.some((status) => matchesStatusFilter(item, status))
    const packageDate = item.createdAt?.slice(0, 10)
    const matchesDate = dateFilter === 'TOUTES'
      || dateFilter === 'AUJOURDHUI' && packageDate === today
      || dateFilter === 'HIER' && packageDate === yesterday
      || dateFilter === 'PLUS_ANCIENS' && Boolean(packageDate && packageDate < yesterday)
    const matchesFilter = Boolean(query.trim()) || filter === 'TOUS'
      || (filter === 'A TRAITER' && isOpenPackage(item))
      || (filter === 'MIS EN DISTRIBUTION' && isDistributionConfirmation(item))
      || (filter === 'CONFIRMES' && Boolean(item.confirmationComment?.trim()))
      || (filter === 'REPORTE_AUJOURDHUI' && matchesReportedDate(item, today))
      || (filter === 'REPORTE_DEMAIN' && matchesReportedDate(item, tomorrow))
    return matchesQuery && matchesStatus && matchesDate && matchesFilter
  }), [dateFilter, filter, packages, query, statusFilters])

  const receptionMatches = useMemo(() => {
    const enteredValue = scanCode.trim()
    if (!enteredValue) return []
    const trackingQuery = normalizeTrackingCode(enteredValue)
    const phoneQuery = normalizePhoneNumber(enteredValue)
    const isPhoneSearch = /^[\d\s()+.-]+$/.test(enteredValue)
    return packages.filter((item) => {
      if (!canReceiveAtAgency(item)) return false
      const matchesTrackingCode = trackingQuery.length > 0
        && normalizeTrackingCode(item.trackingCode).includes(trackingQuery)
      const matchesPhone = isPhoneSearch && phoneQuery.length > 0 && item.phone != null
        && normalizePhoneNumber(item.phone).includes(phoneQuery)
      return matchesTrackingCode || matchesPhone
    }).slice(0, 5)
  }, [packages, scanCode])

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
    return isDistributionConfirmation(item) && (state === 'available' || state === 'mine')
  }).length
  const today = localIsoDate()
  const tomorrow = localIsoDate(1)
  const filterCounts: Record<DriverFilter, number> = {
    TOUS: packages.length,
    'MIS EN DISTRIBUTION': confirmationCount,
    CONFIRMES: packages.filter((item) => Boolean(item.confirmationComment?.trim())).length,
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
      showMessage(selected.status === 'PAS DE REPONSE' ? 'Suivi repris. Vous pouvez maintenant appeler le client.' : 'Confirmation prise en charge. Enregistrez le commentaire après l’accord du client.', 'success')
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
      showMessage(isReservedFollowUp(selected) ? 'Suivi abandonné. Le colis est à nouveau disponible pour les autres livreurs.' : 'Prise en charge abandonnée. Le colis est à nouveau disponible.', 'success')
    } catch (error) { showMessage(error instanceof Error ? error.message : "La prise en charge ne peut pas être abandonnée.", 'error') } finally { setSaving(false) }
  }

  async function saveConfirmationOutcome(outcome: ConfirmationOutcome) {
    if (!selected) return
    if (outcome === 'IN_DISTRIBUTION' && !confirmationComment.trim()) {
      showMessage('Ajoutez un commentaire pour le colis mis en distribution.', 'error')
      return
    }
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
        IN_DISTRIBUTION: 'Tentative enregistrée. Le colis reste en distribution.',
        NO_ANSWER: 'Tentative enregistrée. Le suivi vous est réservé.',
        VOICEMAIL: 'Boîte vocale enregistrée. Le suivi vous est réservé.',
        OUT_OF_ZONE: 'Le colis est marqué hors zone et placé en retour.',
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

  async function receiveFromSearchResult(item: DeliveryPackage) {
    setSelectedId(item.id)
    setScanCode('')
    setMobileListOpen(true)
    setMobileDetailsOpen(true)
    await receiveAtAgency(item)
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

  async function reopenConfirmation() {
    if (!selected || saving) return
    setSaving(true)
    try {
      await reopenCancelledConfirmation(selected.id)
      await refreshPackages()
      setConfirmationReopenPromptOpen(false)
      showMessage('Résultat rouvert. Choisissez maintenant le nouveau résultat de confirmation.', 'success')
    } catch (error) {
      showMessage(error instanceof Error ? error.message : 'Réactivation impossible.', 'error')
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
      // A delivered parcel is no longer returned in the driver's active
      // workspace. On touch devices, keeping its detail panel open leaves a
      // full-screen panel with no selected parcel, which looks like a blank
      // page. Return the driver to the list once the delivery is saved.
      if (result === 'DELIVERED') {
        setSelectedId(null)
        setMobileDetailsOpen(false)
        setMobileListOpen(true)
      }
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
      <section className="driver-command-center">
        <div className="driver-command-header">
          <div><p>OUTILS RAPIDES</p><strong>{activeDriverTool === 'SEARCH' ? 'Trouver un colis' : 'Réception en agence'}</strong></div>
          <div className="driver-tool-tabs" role="tablist" aria-label="Choisir une action">
            <button className={activeDriverTool === 'SEARCH' ? 'active' : ''} type="button" role="tab" aria-selected={activeDriverTool === 'SEARCH'} onClick={() => setActiveDriverTool('SEARCH')}><span aria-hidden="true">⌕</span>Rechercher</button>
            <button className={activeDriverTool === 'RECEPTION' ? 'active' : ''} type="button" role="tab" aria-selected={activeDriverTool === 'RECEPTION'} onClick={() => setActiveDriverTool('RECEPTION')}><span aria-hidden="true">▣</span>Réceptionner</button>
          </div>
        </div>
        {activeDriverTool === 'SEARCH' ? <div className="driver-command-body" role="tabpanel">
          <p className="driver-command-help">Recherchez par nom, téléphone ou code de suivi.</p>
          <div className="driver-command-row">
            <input value={query} onChange={(event) => handlePackageSearch(event.target.value)} placeholder="Rechercher un colis…" aria-label="Rechercher dans les colis" />
            <button className="driver-camera-action" type="button" onClick={() => { setCameraMode('SEARCH'); setCameraOpen(true) }}><QrCodeIcon />Scanner</button>
          </div>
          <div className="driver-command-filters">
            <details className="driver-status-filter" ref={statusFilterRef}>
              <summary>Statut <span>{statusFilters.length === 0 ? 'Tous' : `${statusFilters.length} sélectionné${statusFilters.length > 1 ? 's' : ''}`}</span></summary>
              <div className="driver-status-options">
                <div className="driver-status-options-header"><strong>Filtrer par statut</strong><button className="driver-status-close" type="button" aria-label="Fermer le filtre des statuts" title="Fermer" onClick={() => { if (statusFilterRef.current) statusFilterRef.current.open = false }}>×</button></div>
                {statusOptions.map((option) => <label key={option.value}><input type="checkbox" checked={statusFilters.includes(option.value)} onChange={() => { setStatusFilters((current) => current.includes(option.value) ? current.filter((status) => status !== option.value) : [...current, option.value]); setMobileListOpen(true); setMobileDetailsOpen(false) }} />{option.label}</label>)}
                {statusFilters.length > 0 && <button type="button" onClick={() => { setStatusFilters([]); setMobileListOpen(true); setMobileDetailsOpen(false) }}>Tout afficher</button>}
              </div>
            </details>
            <select className="driver-date-filter" value={dateFilter} aria-label="Filtrer les colis par date d’ajout" onChange={(event) => { setDateFilter(event.target.value as PackageDateFilter); setMobileListOpen(true); setMobileDetailsOpen(false) }}><option value="TOUTES">Toutes les dates</option><option value="AUJOURDHUI">Aujourd’hui</option><option value="HIER">Hier</option><option value="PLUS_ANCIENS">Plus anciens</option></select>
          </div>
        </div> : <div className="driver-command-body reception-command-body" role="tabpanel">
          <p className="driver-command-help">Scannez le colis ou saisissez son code pour enregistrer son arrivée.</p>
          <form onSubmit={findByReceptionInput} className="driver-command-row reception-command-row">
            <input value={scanCode} onChange={(event) => { setScanCode(event.target.value); if (messageTone === 'error') setMessage('') }} placeholder="Code de suivi ou téléphone…" aria-label="Code de suivi ou téléphone à réceptionner" />
            <button className="driver-receive-action" disabled={saving || !scanCode.trim()} type="submit">Réceptionner</button>
            <button className="driver-camera-action" type="button" disabled={saving} onClick={() => { setCameraMode('RECEPTION'); setCameraOpen(true) }}><QrCodeIcon />Scanner</button>
          </form>
          {scanCode.trim() && <div className="reception-search-results" aria-live="polite">
            {receptionMatches.length > 0 ? <>
              <p>{receptionMatches.length} colis à réceptionner</p>
              {receptionMatches.map((item) => <button key={item.id} type="button" disabled={saving} onClick={() => void receiveFromSearchResult(item)}>
                <span><strong>{item.trackingCode}</strong><small>{item.recipient} · {item.phone || 'Sans téléphone'}</small></span>
                <em>Réceptionner</em>
              </button>)}
            </> : <p>Aucun colis à réceptionner ne correspond à cette saisie.</p>}
          </div>}
        </div>}
      </section>
      <section className={`driver-filter-cards ${mobileListOpen ? 'mobile-list-open' : ''}`} aria-label="Filtres des colis">{filterCards.map((item) => <button key={item.filter} className={`driver-filter-card ${item.tone} ${filter === item.filter ? 'active' : ''}`} onClick={() => openMobileList(item.filter)}><span>{item.label}</span><strong>{filterCounts[item.filter]}</strong><small>{filter === item.filter ? 'Liste affichée' : 'Afficher les colis'}</small></button>)}</section>
      {message && <p className={`driver-message ${messageTone}`} role={messageTone === 'error' ? 'alert' : 'status'}>{message}</p>}
      <div className="driver-workspace">
        <div className="driver-package-list">
          <div className="driver-mobile-list-header"><button className="secondary-button" onClick={() => setMobileListOpen(false)}>← Retour aux catégories</button><strong>{filterCards.find((item) => item.filter === filter)?.label}</strong></div>
          {loading && <div className="empty-state">Chargement de votre tournee...</div>}
          {!loading && visiblePackages.map((item) => {
            const confirmationState = getConfirmationState(item, currentDriverId)
            const confirmationLabel = confirmationState === 'available' ? 'Disponible' : confirmationState === 'mine' ? 'Pris par moi' : confirmationState === 'other' ? 'Pris par un autre' : null
            const cardComment = item.latestActionComment?.trim() || item.confirmationComment?.trim() || item.importComment?.trim()
            const dateLabel = packageDateLabel(item.createdAt)
            return <button className={`driver-package ${selected?.id === item.id ? 'selected' : ''} ${item.agencyReceived ? 'at-agency' : ''}`} key={item.id} onClick={() => { setSelectedId(item.id); setMobileDetailsOpen(true); setMessage('') }}>
            <div><strong className="tracking">{item.trackingCode}</strong><h3>{item.recipient}</h3><p>{item.city} - {item.address}</p><p className="driver-package-price">{item.price} DH</p>{cardComment && <p className="driver-package-comment" title={cardComment}>Commentaire : {cardComment}</p>}</div>
            <div className="driver-package-badges"><span className={`status ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{displayPackageStatus(item.status)}</span>{dateLabel && <span className="driver-package-date">{dateLabel}</span>}{confirmationLabel && <span className={`confirmation-state ${confirmationState}`}>{confirmationLabel}</span>}</div>
          </button>
          })}
          {!loading && visiblePackages.length === 0 && <div className="empty-state">Aucun colis dans cette liste.</div>}
        </div>
        <aside className={`delivery-panel ${mobileDetailsOpen ? 'mobile-open' : ''}`}>
          {!selected && <div className="empty-state">Sélectionnez un colis pour commencer.</div>}
          {selected && <>
            <button className="driver-mobile-back secondary-button" onClick={() => setMobileDetailsOpen(false)}>← Retour a la tournee</button>
            <div className="delivery-panel-heading"><div><strong className="tracking">{selected.trackingCode}</strong><h2>{selected.recipient}</h2></div><span className={`status ${selected.status.toLowerCase().replaceAll(' ', '-')}`}>{displayPackageStatus(selected.status)}</span></div>
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
              {isReservedFollowUp(selected) && confirmationOwnerId(selected) === currentDriverId ? <div className="confirmation-result-actions"><button className="primary-button" disabled={saving} onClick={openSelectedConfirmationResult}>Status</button><button className="secondary-button" disabled={saving} onClick={() => void releaseConfirmation()}>Abandonner la prise en charge</button></div>
                : confirmationOwnerId(selected) && confirmationOwnerId(selected) !== currentDriverId ? <p className="driver-message info">Cette confirmation est réservée à un autre livreur. Elle redeviendra disponible s’il abandonne le suivi.</p>
                  : confirmationOwnerId(selected) === currentDriverId ? <div className="confirmation-result-actions"><button className="primary-button" disabled={saving} onClick={openSelectedConfirmationResult}>Status</button><button className="secondary-button" disabled={saving} onClick={() => void releaseConfirmation()}>Abandonner la prise en charge</button></div>
                    : <button className="primary-button confirmation-claim-button" disabled={saving} onClick={() => void claimConfirmation()}>Prendre en charge la confirmation</button>}
            </>}
            {canModifyConfirmation(selected) && !needsConfirmation(selected) && selected.status !== 'EN LIVRAISON' && <button className="primary-button confirmation-claim-button" disabled={saving} onClick={() => setConfirmationReopenPromptOpen(true)}>Modifier la confirmation</button>}
            {selected.status === 'AFFECTE' && <p className="driver-message">Ce colis doit être scanné au dépôt avant de pouvoir être livré.</p>}
            {selected.status === 'EN LIVRAISON' && selected.driverId === currentDriverId && <>
              <button className="primary-button delivery-complete-button" disabled={saving} onClick={() => { setDeliveryOutcome('DELIVERED'); setComment(''); setDeliveryOutcomeModalOpen(true) }}>Status</button>
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
    {confirmationReopenPromptOpen && selected && <div className="attempt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Modifier le résultat de confirmation">
      <section className="attempt-modal confirmation-modal">
        <div className="attempt-modal-header"><div><p className="eyebrow">MODIFIER LA CONFIRMATION</p><h2>{selected.trackingCode}</h2><p>{selected.recipient}</p></div><button className="secondary-button" disabled={saving} onClick={() => setConfirmationReopenPromptOpen(false)}>Fermer</button></div>
        <p className="driver-message info">Le résultat actuel sera rouvert afin d’enregistrer une nouvelle réponse du client. Si vous avez cliqué par erreur, revenez en arrière : aucun changement ne sera fait.</p>
        <div className="form-actions"><button className="secondary-button" disabled={saving} onClick={() => setConfirmationReopenPromptOpen(false)}>Retour, ne rien modifier</button><button className="primary-button" disabled={saving} onClick={() => void reopenConfirmation()}>{saving ? 'Ouverture...' : 'Modifier le résultat'}</button></div>
      </section>
    </div>}
    {confirmationResultModalOpen && selected && <div className="attempt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Résultat de confirmation">
      <section className="attempt-modal confirmation-modal">
        <div className="attempt-modal-header"><div><p className="eyebrow">RÉSULTAT DE CONFIRMATION</p><h2>{selected.trackingCode}</h2><p>{selected.recipient}</p></div><button className="secondary-button" disabled={saving} onClick={() => setConfirmationResultModalOpen(false)}>Fermer</button></div>
        <label className="driver-comment">Résultat<select value={confirmationResult} onChange={(event) => setConfirmationResult(event.target.value as ConfirmationResult)}>{confirmationResultOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="driver-comment">Commentaire {confirmationResult === 'CONFIRMED' || confirmationResult === 'IN_DISTRIBUTION' ? '(obligatoire)' : '(optionnel)'}<textarea autoFocus value={confirmationComment} onChange={(event) => setConfirmationComment(event.target.value)} placeholder="Ex. client injoignable à 15h, rappeler plus tard" rows={3} /></label>
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
