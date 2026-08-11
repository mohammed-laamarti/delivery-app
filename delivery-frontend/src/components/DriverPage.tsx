import { useEffect, useMemo, useState } from 'react'
import { createDeliveryAttempt, fetchDriverPackages } from '../api/client'
import { BarcodeScanner } from './BarcodeScanner'
import type { DeliveryPackage, DeliveryResult, PackageStatus } from '../types'

type DriverFilter = 'TOUS' | 'A TRAITER' | 'LIVRES' | 'RETOURS' | 'REPORTES'

const filters: DriverFilter[] = ['TOUS', 'A TRAITER', 'LIVRES', 'RETOURS', 'REPORTES']

function isOpenPackage(item: DeliveryPackage) {
  return item.status === 'AFFECTE' || item.status === 'EN LIVRAISON'
}

export function DriverPage({ onLogout, driverName }: { onLogout: () => void; driverName: string }) {
  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [filter, setFilter] = useState<DriverFilter>('A TRAITER')
  const [query, setQuery] = useState('')
  const [scanCode, setScanCode] = useState('')
  const [comment, setComment] = useState('')
  const [nextDate, setNextDate] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)

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
    const matchesQuery = `${item.trackingCode} ${item.recipient} ${item.city}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'TOUS'
      || (filter === 'A TRAITER' && isOpenPackage(item))
      || (filter === 'LIVRES' && item.status === 'LIVRE')
      || (filter === 'RETOURS' && item.status === 'RETOUR')
      || (filter === 'REPORTES' && item.status === 'REPORTE')
    return matchesQuery && matchesFilter
  }), [filter, packages, query])

  const selected = packages.find((item) => item.id === selectedId) ?? null
  const pendingCount = packages.filter(isOpenPackage).length
  const deliveredCount = packages.filter((item) => item.status === 'LIVRE').length
  const returnCount = packages.filter((item) => item.status === 'RETOUR').length

  function findByScanCode(event: React.FormEvent) {
    event.preventDefault()
    const item = packages.find((current) => current.trackingCode.toLowerCase() === scanCode.trim().toLowerCase())
    if (!item) {
      setMessage('Aucun package affecte ne correspond a ce code.')
      return
    }
    setSelectedId(item.id)
    setMobileDetailsOpen(true)
    setScanCode('')
    setMessage(`Package ${item.trackingCode} ouvert.`)
  }

  function handleCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const item = packages.find((current) => current.trackingCode.toLowerCase() === trackingCode.toLowerCase())
    if (!item) {
      setMessage(`Le code ${trackingCode} ne correspond a aucun de vos packages.`)
      return
    }
    setSelectedId(item.id)
    setMobileDetailsOpen(true)
    setMessage(`Package ${item.trackingCode} ouvert.`)
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
      <div className="driver-stats" aria-label="Resume de la tournee">
        <div><strong>{pendingCount}</strong><span>A traiter</span></div>
        <div><strong>{deliveredCount}</strong><span>Livres</span></div>
        <div><strong>{returnCount}</strong><span>Retours</span></div>
      </div>
      <div className="driver-tools">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher un client ou un code" aria-label="Rechercher" />
        <form onSubmit={findByScanCode} className="driver-scan-form">
          <input value={scanCode} onChange={(event) => setScanCode(event.target.value)} placeholder="Scanner ou saisir le code" aria-label="Code de suivi" />
          <button className="secondary-button" type="submit">Trouver</button>
          <button className="secondary-button" type="button" onClick={() => setCameraOpen(true)}>Camera</button>
        </form>
      </div>
      <div className="driver-filter-tabs">{filters.map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
      {message && <p className="driver-message">{message}</p>}
      <div className="driver-workspace">
        <div className="driver-package-list">
          {loading && <div className="empty-state">Chargement de votre tournee...</div>}
          {!loading && visiblePackages.map((item) => <button className={`driver-package ${selected?.id === item.id ? 'selected' : ''}`} key={item.id} onClick={() => { setSelectedId(item.id); setMobileDetailsOpen(true); setMessage('') }}>
            <div><strong className="tracking">{item.trackingCode}</strong><h3>{item.recipient}</h3><p>{item.city} - {item.address}</p></div>
            <span className={`status ${item.status.toLowerCase().replaceAll(' ', '-')}`}>{item.status}</span>
          </button>)}
          {!loading && visiblePackages.length === 0 && <div className="empty-state">Aucun package dans cette liste.</div>}
        </div>
        <aside className={`delivery-panel ${mobileDetailsOpen ? 'mobile-open' : ''}`}>
          {!selected && <div className="empty-state">Selectionnez un package pour commencer.</div>}
          {selected && <>
            <button className="driver-mobile-back secondary-button" onClick={() => setMobileDetailsOpen(false)}>← Retour a la tournee</button>
            <div className="delivery-panel-heading"><div><strong className="tracking">{selected.trackingCode}</strong><h2>{selected.recipient}</h2></div><span className={`status ${selected.status.toLowerCase().replaceAll(' ', '-')}`}>{selected.status}</span></div>
            <div className="delivery-details"><p><span>Telephone</span><a href={`tel:${selected.phone}`}>{selected.phone || 'Non renseigne'}</a></p><p><span>Adresse</span><strong>{selected.address}, {selected.city}</strong></p><p><span>Montant</span><strong>{selected.price} DH</strong></p></div>
            {selected.status === 'AFFECTE' && <p className="driver-message">Ce package doit etre scanne au depot avant de pouvoir etre livre.</p>}
            {selected.status === 'EN LIVRAISON' && <a className="call-button" href={`tel:${selected.phone}`}>Appeler le client</a>}
            {selected.status === 'EN LIVRAISON' && <>
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
    {cameraOpen && <BarcodeScanner onDetected={handleCameraCode} onClose={() => setCameraOpen(false)} />}
  </main>
}
