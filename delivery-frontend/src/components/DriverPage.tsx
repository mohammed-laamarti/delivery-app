import { useEffect, useMemo, useState } from 'react'
import { claimPackageConfirmation, confirmPackageCustomer, createConfirmationOutcome, createDeliveryAttempt, fetchDriverPackages, registerAgencyArrival, releasePackageConfirmation } from '../api/client'
import { getAuth } from '../auth'
import { BarcodeScanner } from './BarcodeScanner'
import type { ConfirmationOutcome, DeliveryPackage, DeliveryResult, PackageStatus } from '../types'

type DriverFilter = 'TOUS' | 'A CONFIRMER' | 'A TRAITER' | 'REPORTE_AUJOURDHUI' | 'REPORTE_DEMAIN'
type MessageTone = 'info' | 'success' | 'error'
type ConfirmationState = 'available' | 'mine' | 'other' | null

const filterCards: { filter: DriverFilter; label: string; tone: string }[] = [
  { filter: 'TOUS', label: 'Tous les colis', tone: 'all' },
  { filter: 'A CONFIRMER', label: 'À confirmer', tone: 'confirm' },
  { filter: 'A TRAITER', label: 'À livrer', tone: 'pending' },
  { filter: 'REPORTE_AUJOURDHUI', label: 'Reportés aujourd’hui', tone: 'postponed' },
  { filter: 'REPORTE_DEMAIN', label: 'Reportés demain', tone: 'tomorrow' },
]

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
  return (item.status === 'REPORTE' && item.nextDeliveryDate === date)
    || item.nextConfirmationAt?.slice(0, 10) === date
}

function canReceiveAtAgency(item: DeliveryPackage) {
  return !item.agencyReceived && (item.status === 'A CONFIRMER' || item.status === 'A RECEPTIONNER'
    || (item.status === 'REPORTE' && Boolean(item.nextConfirmationAt)))
}

function getConfirmationState(item: DeliveryPackage, currentDriverId?: number): ConfirmationState {
  if (!needsConfirmation(item)) return null
  if (!item.confirmationDriverId) return 'available'
  return item.confirmationDriverId === currentDriverId ? 'mine' : 'other'
}

function localIsoDate(offsetDays = 0) {
  const date = new Date()
  date.setDate(date.getDate() + offsetDays)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function DriverPage({ onLogout, driverName }: { onLogout: () => void; driverName: string }) {
  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<DriverFilter>('A TRAITER')
  const [query, setQuery] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [comment, setComment] = useState('')
  const [confirmationComment, setConfirmationComment] = useState('')
  const [confirmationChannel, setConfirmationChannel] = useState<'APPEL' | 'WHATSAPP'>('APPEL')
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false)
  const [postponeModalOpen, setPostponeModalOpen] = useState(false)
  const [nextConfirmationAt, setNextConfirmationAt] = useState('')
  const [nextDate, setNextDate] = useState('')
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
    const refreshInterval = window.setInterval(() => { void loadPackages() }, 20_000)
    return () => {
      mounted = false
      window.clearInterval(refreshInterval)
    }
  }, [])

  const visiblePackages = useMemo(() => packages.filter((item) => {
    const today = localIsoDate()
    const tomorrow = localIsoDate(1)
    const matchesQuery = `${item.trackingCode} ${item.recipient} ${item.phone ?? ''} ${item.city}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'TOUS'
      || (filter === 'A TRAITER' && isOpenPackage(item))
      || (filter === 'A CONFIRMER' && needsConfirmation(item))
      || (filter === 'REPORTE_AUJOURDHUI' && matchesReportedDate(item, today))
      || (filter === 'REPORTE_DEMAIN' && matchesReportedDate(item, tomorrow))
    return matchesQuery && matchesFilter
  }), [filter, packages, query])

  const selected = packages.find((item) => item.id === selectedId) ?? null
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
      setConfirmationModalOpen(false)
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
      if (outcome === 'CALLBACK_REQUESTED') setPostponeModalOpen(false)
      const messages: Record<ConfirmationOutcome, string> = {
        NO_ANSWER: 'Tentative enregistrée. Le colis est disponible pour une nouvelle tentative.',
        CALLBACK_REQUESTED: 'Rappel programmé et prise en charge libérée.',
        REFUSED: 'Refus enregistré. Le colis est annulé.',
        INVALID_PHONE: 'Numéro incorrect signalé. Le colis est disponible après correction.',
      }
      showMessage(messages[outcome], 'success')
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Résultat de confirmation impossible à enregistrer.', 'error') } finally { setSaving(false) }
  }

  async function receiveAtAgency(item: DeliveryPackage) {
    setSaving(true)
    try {
      await registerAgencyArrival(item.id)
      await refreshPackages()
      showMessage(`Colis ${item.trackingCode} scanné et reçu en agence.`, 'success')
    } catch (error) { showMessage(error instanceof Error ? error.message : 'Réception impossible.', 'error') } finally { setSaving(false) }
  }

  function findByScanCode(event: React.FormEvent) {
    event.preventDefault()
    const item = packages.find((current) => current.trackingCode.toLowerCase() === scanCode.trim().toLowerCase())
    if (!item) {
      showMessage('Code introuvable. Vérifiez le code de suivi puis réessayez.', 'error')
      return
    }
    if (canReceiveAtAgency(item)) {
      setSelectedId(item.id)
      setScanCode('')
      void receiveAtAgency(item)
      return
    }
    setScanCode('')
    showMessage(item.agencyReceived ? `Le colis ${item.trackingCode} est déjà réceptionné en agence.` : `Le colis ${item.trackingCode} ne peut pas être réceptionné avec son statut actuel.`, 'error')
  }

  function handleCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const item = packages.find((current) => current.trackingCode.toLowerCase() === trackingCode.toLowerCase())
    if (!item) {
      showMessage(`Code ${trackingCode} introuvable. Vérifiez le code de suivi.`, 'error')
      return
    }
    if (canReceiveAtAgency(item)) {
      setSelectedId(item.id)
      void receiveAtAgency(item)
      return
    }
    showMessage(item.agencyReceived ? `Le colis ${item.trackingCode} est déjà réceptionné en agence.` : `Le colis ${item.trackingCode} ne peut pas être réceptionné avec son statut actuel.`, 'error')
  }

  function handleSearchCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const item = packages.find((current) => current.trackingCode.toLowerCase() === trackingCode.toLowerCase())
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

  async function saveOutcome(result: DeliveryResult, status?: PackageStatus) {
    if (!selected || saving) return
    if (result === 'CLIENT_REQUESTED_POSTPONEMENT' && !nextDate) {
      showMessage('Choisissez la nouvelle date demandée par le client.', 'error')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await createDeliveryAttempt(selected.id, result, comment, nextDate)
      const resultingStatus = result === 'CLIENT_REQUESTED_POSTPONEMENT' ? 'REPORTE' : result === 'DELIVERED' ? 'LIVRE' : status
      await refreshPackages()
      setComment('')
      setNextDate('')
      showMessage(resultingStatus === 'LIVRE' ? 'Livraison enregistrée.' : resultingStatus === 'REPORTE' ? 'Report enregistré.' : 'Résultat enregistré.', 'success')
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
    <section className={`driver-page-content ${mobileListOpen ? 'mobile-list-open' : ''}`}>
      <div className="driver-tools">
        <section className="driver-tool-card search-tool-card">
          <div className="driver-tool-heading"><span className="driver-tool-icon" aria-hidden="true">⌕</span><div><strong>Rechercher dans les colis</strong><small>Filtre uniquement la liste affichée</small></div></div>
          <div className="driver-search-controls"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, téléphone ou code de suivi" aria-label="Rechercher dans les colis" /><button className="secondary-button" type="button" onClick={() => { setCameraMode('SEARCH'); setCameraOpen(true) }}>Scanner pour rechercher</button></div>
        </section>
        <section className="driver-tool-card reception-tool-card">
          <div className="driver-tool-heading"><span className="driver-tool-icon" aria-hidden="true">▣</span><div><strong>Réception en agence</strong><small>Le scan passe directement le colis en agence</small></div></div>
          <form onSubmit={findByScanCode} className="driver-scan-form">
            <input value={scanCode} onChange={(event) => setScanCode(event.target.value)} placeholder="Scanner ou saisir le code de suivi" aria-label="Code de suivi à réceptionner" />
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
            return <button className={`driver-package ${selected?.id === item.id ? 'selected' : ''} ${confirmationState ? `confirmation-${confirmationState}` : ''}`} key={item.id} onClick={() => { setSelectedId(item.id); setMobileDetailsOpen(true); setMessage('') }}>
            <div><strong className="tracking">{item.trackingCode}</strong><h3>{item.recipient}</h3><p>{item.city} - {item.address}</p></div>
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
            <div className="delivery-details"><p><span>Téléphone</span><a href={`tel:${selected.phone}`}>{selected.phone || 'Non renseigné'}</a></p><p><span>Adresse importée</span><strong>{selected.address}, {selected.city}</strong></p><p><span>Montant</span><strong>{selected.price} DH</strong></p>{selected.confirmationComment && <p><span>Commentaire de confirmation</span><strong>{selected.confirmationComment}</strong></p>}{selected.confirmationChannel && <p><span>Canal</span><strong>{selected.confirmationChannel === 'APPEL' ? 'Appel téléphonique' : 'WhatsApp'}</strong></p>}</div>
            {!selected.agencyReceived && (selected.status === 'A CONFIRMER' || selected.status === 'A RECEPTIONNER') && <p className="driver-message">Scannez ce colis avec le champ ou la caméra en haut de la page pour le recevoir en agence.</p>}
            {selected.status === 'EN AGENCE' && !selected.confirmationComment && <p className="driver-message">Colis reçu en agence. La confirmation client peut encore être faite.</p>}
            {isFutureConfirmationReport(selected) && <p className="driver-message">Confirmation reportée au {selected.nextConfirmationAt?.slice(0, 10)}. Elle sera disponible à cette date.</p>}
            {isFutureDeliveryReport(selected) && <p className="driver-message">Relivraison reportée au {selected.nextDeliveryDate}. Elle sera disponible à cette date.</p>}
            {needsConfirmation(selected) && <>
              {selected.confirmationDriverId && selected.confirmationDriverId !== currentDriverId ? <p className="driver-message info">Cette confirmation est déjà prise en charge par un autre livreur.</p> : selected.confirmationDriverId === currentDriverId ? <>
                <div className="confirmation-contact-actions">
                  <a className={`confirmation-contact-button phone ${confirmationChannel === 'APPEL' ? 'selected' : ''}`} onClick={() => setConfirmationChannel('APPEL')} href={`tel:${selected.phone}`}><span aria-hidden="true">☎</span>Appeler</a>
                  <a className={`confirmation-contact-button whatsapp ${confirmationChannel === 'WHATSAPP' ? 'selected' : ''}`} onClick={() => setConfirmationChannel('WHATSAPP')} target="_blank" rel="noreferrer" href={`https://wa.me/${(selected.phone ?? '').replace(/\D/g, '').replace(/^0/, '212')}`}><span aria-hidden="true">◉</span>WhatsApp</a>
                </div>
                <div className="confirmation-form-actions"><button className="secondary-button" disabled={saving} onClick={() => void releaseConfirmation()}>Abandonner</button><button className="primary-button" disabled={saving} onClick={() => setConfirmationModalOpen(true)}>Client confirmé</button></div>
                <div className="confirmation-outcomes"><button className="secondary-button" disabled={saving} onClick={() => void saveConfirmationOutcome('NO_ANSWER')}>Ne répond pas</button><button className="secondary-button" disabled={saving} onClick={() => setPostponeModalOpen(true)}>Reporter</button></div>
              </> : <button className="primary-button confirmation-claim-button" disabled={saving} onClick={() => void claimConfirmation()}>Prendre en charge la confirmation</button>}
            </>}
            {selected.status === 'AFFECTE' && <p className="driver-message">Ce colis doit être scanné au dépôt avant de pouvoir être livré.</p>}
            {selected.status === 'EN LIVRAISON' && selected.driverId === currentDriverId && <div className="confirmation-contact-actions">
              <a className="confirmation-contact-button phone" href={`tel:${selected.phone}`}><span aria-hidden="true">☎</span>Appeler</a>
              <a className="confirmation-contact-button whatsapp" target="_blank" rel="noreferrer" href={`https://wa.me/${(selected.phone ?? '').replace(/\D/g, '').replace(/^0/, '212')}`}><span aria-hidden="true">◉</span>WhatsApp</a>
            </div>}
            {selected.status === 'EN LIVRAISON' && selected.driverId === currentDriverId && <>
              <button className="primary-button delivery-complete-button" disabled={saving} onClick={() => void saveOutcome('DELIVERED', 'LIVRE')}>Marquer livré</button>
            </>}
          </>}
        </aside>
      </div>
    </section>
    {cameraOpen && <BarcodeScanner onDetected={cameraMode === 'SEARCH' ? handleSearchCameraCode : handleCameraCode} onClose={() => setCameraOpen(false)} />}
    {confirmationModalOpen && selected && <div className="attempt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Commentaire de confirmation">
      <section className="attempt-modal confirmation-modal">
        <div className="attempt-modal-header"><div><p className="eyebrow">CONFIRMATION CLIENT</p><h2>{selected.trackingCode}</h2><p>{selected.recipient}</p></div><button className="secondary-button" disabled={saving} onClick={() => setConfirmationModalOpen(false)}>Fermer</button></div>
        <label className="driver-comment">Lieu de réception / commentaire client<textarea autoFocus value={confirmationComment} onChange={(event) => setConfirmationComment(event.target.value)} placeholder="Ex. près de la mosquée Al Qods, appeler avant arrivée" rows={4} /></label>
        <div className="form-actions"><button className="secondary-button" disabled={saving} onClick={() => setConfirmationModalOpen(false)}>Annuler</button><button className="primary-button" disabled={saving} onClick={() => void confirmCustomer()}>{saving ? 'Enregistrement...' : 'Confirmer le client'}</button></div>
      </section>
    </div>}
    {postponeModalOpen && selected && <div className="attempt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Date de report de confirmation">
      <section className="attempt-modal confirmation-modal">
        <div className="attempt-modal-header"><div><p className="eyebrow">REPORTER LA CONFIRMATION</p><h2>{selected.trackingCode}</h2><p>{selected.recipient}</p></div><button className="secondary-button" disabled={saving} onClick={() => setPostponeModalOpen(false)}>Fermer</button></div>
        <label className="driver-date">Date du rappel<input autoFocus min={localIsoDate()} type="date" value={nextConfirmationAt} onChange={(event) => setNextConfirmationAt(event.target.value)} /></label>
        <div className="form-actions"><button className="secondary-button" disabled={saving} onClick={() => setPostponeModalOpen(false)}>Annuler</button><button className="primary-button" disabled={saving} onClick={() => void saveConfirmationOutcome('CALLBACK_REQUESTED')}>{saving ? 'Enregistrement...' : 'Programmer le rappel'}</button></div>
      </section>
    </div>}
  </main>
}
