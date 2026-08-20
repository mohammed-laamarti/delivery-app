import { useEffect, useMemo, useState } from 'react'
import { claimPackageConfirmation, confirmPackageCustomer, createDeliveryAttempt, fetchDriverPackages, registerAgencyArrival } from '../api/client'
import { getAuth } from '../auth'
import { BarcodeScanner } from './BarcodeScanner'
import type { DeliveryPackage, DeliveryResult, PackageStatus } from '../types'

type DriverFilter = 'TOUS' | 'A CONFIRMER' | 'A TRAITER' | 'REPORTE_AUJOURDHUI' | 'REPORTE_DEMAIN'

const filterCards: { filter: DriverFilter; label: string; tone: string }[] = [
  { filter: 'TOUS', label: 'Tous les colis', tone: 'all' },
  { filter: 'A CONFIRMER', label: 'À confirmer', tone: 'confirm' },
  { filter: 'A TRAITER', label: 'À traiter', tone: 'pending' },
  { filter: 'REPORTE_AUJOURDHUI', label: 'Reportés aujourd’hui', tone: 'postponed' },
  { filter: 'REPORTE_DEMAIN', label: 'Reportés demain', tone: 'tomorrow' },
]

function isOpenPackage(item: DeliveryPackage) {
  return item.status === 'AFFECTE' || item.status === 'EN LIVRAISON'
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
  const [nextDate, setNextDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraMode, setCameraMode] = useState<'SEARCH' | 'RECEPTION'>('RECEPTION')
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
  const currentDriverId = getAuth()?.userId

  useEffect(() => {
    let mounted = true
    void fetchDriverPackages()
      .then((items) => {
        if (!mounted) return
        setPackages(items)
        setSelectedId(items.find(isOpenPackage)?.id ?? items[0]?.id ?? null)
      })
      .catch(() => { if (mounted) setMessage("Impossible de charger les packages. Verifiez la connexion puis actualisez.") })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  const visiblePackages = useMemo(() => packages.filter((item) => {
    const today = localIsoDate()
    const tomorrow = localIsoDate(1)
    const matchesQuery = `${item.trackingCode} ${item.recipient} ${item.phone ?? ''} ${item.city}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'TOUS'
      || (filter === 'A TRAITER' && isOpenPackage(item))
      || (filter === 'A CONFIRMER' && (item.status === 'A CONFIRMER' || (item.status === 'EN AGENCE' && !item.confirmationComment)))
      || (filter === 'REPORTE_AUJOURDHUI' && item.status === 'REPORTE' && item.nextDeliveryDate === today)
      || (filter === 'REPORTE_DEMAIN' && item.status === 'REPORTE' && item.nextDeliveryDate === tomorrow)
    return matchesQuery && matchesFilter
  }), [filter, packages, query])

  const selected = packages.find((item) => item.id === selectedId) ?? null
  const confirmationCount = packages.filter((item) => item.status === 'A CONFIRMER' || (item.status === 'EN AGENCE' && !item.confirmationComment)).length
  const today = localIsoDate()
  const tomorrow = localIsoDate(1)
  const filterCounts: Record<DriverFilter, number> = {
    TOUS: packages.length,
    'A CONFIRMER': confirmationCount,
    'A TRAITER': packages.filter(isOpenPackage).length,
    REPORTE_AUJOURDHUI: packages.filter((item) => item.status === 'REPORTE' && item.nextDeliveryDate === today).length,
    REPORTE_DEMAIN: packages.filter((item) => item.status === 'REPORTE' && item.nextDeliveryDate === tomorrow).length,
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
      setMessage('Appel pris en charge. Enregistrez le commentaire après confirmation du client.')
    } catch (error) { setMessage(error instanceof Error ? error.message : "L'appel ne peut pas être pris en charge.") } finally { setSaving(false) }
  }

  async function confirmCustomer() {
    if (!selected || !confirmationComment.trim()) { setMessage('Le commentaire de confirmation est obligatoire.'); return }
    setSaving(true)
    try {
      await confirmPackageCustomer(selected.id, confirmationComment, confirmationChannel)
      await refreshPackages()
      setConfirmationComment('')
      setMessage(`Confirmation enregistrée par ${confirmationChannel === 'APPEL' ? 'appel' : 'WhatsApp'}. Le colis peut être organisé dès qu’il est reçu en agence.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Confirmation impossible.') } finally { setSaving(false) }
  }

  async function receiveAtAgency(item: DeliveryPackage) {
    setSaving(true)
    try {
      await registerAgencyArrival(item.id)
      await refreshPackages()
      setMessage(`Colis ${item.trackingCode} scanné et reçu en agence.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Réception impossible.') } finally { setSaving(false) }
  }

  function findByScanCode(event: React.FormEvent) {
    event.preventDefault()
    const item = packages.find((current) => current.trackingCode.toLowerCase() === scanCode.trim().toLowerCase())
    if (!item) {
      setMessage('Code introuvable. Vérifiez le code de suivi puis réessayez.')
      return
    }
    if (!item.agencyReceived && (item.status === 'A CONFIRMER' || item.status === 'A RECEPTIONNER')) {
      setSelectedId(item.id)
      setScanCode('')
      void receiveAtAgency(item)
      return
    }
    setScanCode('')
    setMessage(item.agencyReceived ? `Le colis ${item.trackingCode} est déjà réceptionné en agence.` : `Le colis ${item.trackingCode} ne peut pas être réceptionné avec son statut actuel.`)
  }

  function handleCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const item = packages.find((current) => current.trackingCode.toLowerCase() === trackingCode.toLowerCase())
    if (!item) {
      setMessage(`Code ${trackingCode} introuvable. Vérifiez le code de suivi.`)
      return
    }
    if (!item.agencyReceived && (item.status === 'A CONFIRMER' || item.status === 'A RECEPTIONNER')) {
      setSelectedId(item.id)
      void receiveAtAgency(item)
      return
    }
    setMessage(item.agencyReceived ? `Le colis ${item.trackingCode} est déjà réceptionné en agence.` : `Le colis ${item.trackingCode} ne peut pas être réceptionné avec son statut actuel.`)
  }

  function handleSearchCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const item = packages.find((current) => current.trackingCode.toLowerCase() === trackingCode.toLowerCase())
    if (!item) {
      setMessage(`Code ${trackingCode} introuvable dans les colis du jour.`)
      return
    }
    setQuery(item.trackingCode)
    setSelectedId(item.id)
    setMobileDetailsOpen(true)
    setMessage(`Colis ${item.trackingCode} trouvé. Aucun statut n’a été modifié.`)
  }

  async function saveOutcome(result: DeliveryResult, status?: PackageStatus) {
    if (!selected || saving) return
    if (result === 'CLIENT_REQUESTED_POSTPONEMENT' && !nextDate) {
      setMessage('Choisissez la nouvelle date demandee par le client.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      await createDeliveryAttempt(selected.id, result, comment, nextDate)
      const resultingStatus = result === 'CLIENT_REQUESTED_POSTPONEMENT' ? 'REPORTE' : result === 'DELIVERED' ? 'LIVRE' : status
      if (resultingStatus) setPackages((items) => items.map((item) => item.id === selected.id ? { ...item, status: resultingStatus } : item))
      setComment('')
      setNextDate('')
      setMessage(resultingStatus === 'LIVRE' ? 'Livraison enregistree.' : resultingStatus === 'REPORTE' ? 'Report enregistre.' : 'Resultat enregistre.')
    } catch {
      setMessage("L'action n'a pas pu etre enregistree.")
    } finally {
      setSaving(false)
    }
  }

  return <main className="driver-page">
    <header className="driver-header">
      <div><p className="eyebrow">ESPACE LIVREUR</p><h1>{driverName}</h1></div>
      <button className="secondary-button" onClick={onLogout}>Se deconnecter</button>
    </header>
    <section className="driver-page-content">
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
      <section className="driver-filter-cards" aria-label="Filtres des colis">{filterCards.map((item) => <button key={item.filter} className={`driver-filter-card ${item.tone} ${filter === item.filter ? 'active' : ''}`} onClick={() => setFilter(item.filter)}><span>{item.label}</span><strong>{filterCounts[item.filter]}</strong><small>{filter === item.filter ? 'Liste affichée' : 'Afficher les colis'}</small></button>)}</section>
      {message && <p className="driver-message">{message}</p>}
      <div className="driver-workspace">
        <div className="driver-package-list">
          {loading && <div className="empty-state">Chargement de votre tournee...</div>}
          {!loading && visiblePackages.map((item) => <button className={`driver-package ${selected?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { setSelectedId(item.id); setMobileDetailsOpen(true); setMessage('') }}>
            <div><strong className="tracking">{item.trackingCode}</strong><h3>{item.recipient}</h3><p>{item.city} - {item.address}</p></div>
            <span className={`status ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span>
          </button>)}
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
            {(selected.status === 'A CONFIRMER' || (selected.status === 'EN AGENCE' && !selected.confirmationComment)) && <>
              <div className="confirmation-contact-actions">
                <a className="confirmation-contact-button phone" href={`tel:${selected.phone}`}><span aria-hidden="true">☎</span>Appeler</a>
                <a className="confirmation-contact-button whatsapp" target="_blank" rel="noreferrer" href={`https://wa.me/${(selected.phone ?? '').replace(/\D/g, '').replace(/^0/, '212')}`}><span aria-hidden="true">◉</span>WhatsApp</a>
              </div>
              {selected.confirmationDriverId && selected.confirmationDriverId !== currentDriverId ? <p className="driver-message">Cette confirmation est déjà prise en charge par un autre livreur.</p> : selected.confirmationDriverId === currentDriverId ? <>
                <label className="driver-comment">Canal de confirmation<select value={confirmationChannel} onChange={(event) => setConfirmationChannel(event.target.value as 'APPEL' | 'WHATSAPP')}><option value="APPEL">Appel téléphonique</option><option value="WHATSAPP">WhatsApp</option></select></label>
                <label className="driver-comment">Lieu de réception / commentaire client<textarea value={confirmationComment} onChange={(event) => setConfirmationComment(event.target.value)} placeholder="Ex. près de la mosquée Al Qods, appeler avant arrivée" rows={3} /></label>
                <button className="primary-button" disabled={saving} onClick={() => void confirmCustomer()}>Valider la confirmation</button>
              </> : <button className="primary-button confirmation-claim-button" disabled={saving} onClick={() => void claimConfirmation()}>Prendre en charge la confirmation</button>}
            </>}
            {selected.status === 'AFFECTE' && <p className="driver-message">Ce package doit etre scanne au depot avant de pouvoir etre livre.</p>}
            {selected.status === 'EN LIVRAISON' && selected.driverId === currentDriverId && <a className="call-button" href={`tel:${selected.phone}`}>Appeler le client</a>}
            {selected.status === 'EN LIVRAISON' && selected.driverId === currentDriverId && <>
              <label className="driver-comment">Commentaire client<textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Exemple: client disponible apres 15h" rows={3} /></label>
              <label className="driver-date">Nouvelle date si report<input type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} /></label>
              <div className="outcome-actions">
                <button className="secondary-button" disabled={saving} onClick={() => void saveOutcome('CLIENT_CONFIRMED')}>Client confirme</button>
                <button className="secondary-button" disabled={saving} onClick={() => void saveOutcome('CLIENT_UNREACHABLE')}>Injoignable</button>
                <button className="secondary-button" disabled={saving} onClick={() => void saveOutcome('CLIENT_REQUESTED_POSTPONEMENT', 'REPORTE')}>Demande de report</button>
                <button className="danger-button" disabled={saving} onClick={() => void saveOutcome('ADDRESS_NOT_FOUND')}>Adresse introuvable</button>
                <button className="danger-button" disabled={saving} onClick={() => void saveOutcome('REFUSED')}>Client refuse</button>
                <button className="primary-button" disabled={saving} onClick={() => void saveOutcome('DELIVERED', 'LIVRE')}>Marquer livre</button>
              </div>
            </>}
          </>}
        </aside>
      </div>
    </section>
    {cameraOpen && <BarcodeScanner onDetected={cameraMode === 'SEARCH' ? handleSearchCameraCode : handleCameraCode} onClose={() => setCameraOpen(false)} />}
  </main>
}
