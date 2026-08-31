import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { assignPackage, confirmDriverDeparture, createDriver, createPackage, decideDepotStatus, deleteDriver, deletePackage, downloadPackagesExcel, fetchDashboardData, fetchDailyDashboardStats, fetchDailyDriverStats, fetchDriver, fetchDriverDailyActivities, registerAgencyArrival, registerDepotArrival, shipReturns, updateDriver, updatePackage, type DailyDashboardStats, type DailyDriverStats } from './api/client'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { StatCard } from './components/StatCard'
import { PackageTable } from './components/PackageTable'
import { ExcelImportButton } from './components/ExcelImportButton'
import { LoginPage } from './components/LoginPage'
import { DriverPage } from './components/DriverPage'
import { BarcodeScanner } from './components/BarcodeScanner'
import { TicketOcrScanner, type ScannedTicket } from './components/TicketOcrScanner'
import { Pagination } from './components/Pagination'
import { clearAuth, getAuth, type AuthUser } from './auth'
import type { DeliveryPackage, Driver, Page } from './types'

const pageTitles: Record<Page, string> = { dashboard: 'Vue generale', packages: 'Colis', reception: 'Réception agence', scanner: 'Confirmation de départ', drivers: 'Livreurs', 'driver-details': 'Colis du livreur', returns: 'Retours' }
type Refresh = () => Promise<void>
const TABLE_PAGE_SIZE = 10
const DRIVER_PAGE_SIZE = 6

function todayIsoDate() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function pageItems<T>(items: T[], page: number, pageSize: number) {
  const start = (Math.min(page, Math.max(1, Math.ceil(items.length / pageSize))) - 1) * pageSize
  return items.slice(start, start + pageSize)
}

function matchesPackageSearch(item: DeliveryPackage, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  const textMatches = [item.trackingCode, item.recipient, item.city, item.phone ?? '']
    .some((value) => value.toLowerCase().includes(normalizedQuery))
  const phoneQuery = normalizedQuery.replace(/\D/g, '')
  const isPhoneSearch = /^[\d\s()+.-]+$/.test(query.trim())
  return textMatches || (isPhoneSearch && phoneQuery.length > 0 && (item.phone ?? '').replace(/\D/g, '').includes(phoneQuery))
}

function ScannerPackageSearch({ query, results, disabled, onQueryChange, onSelect }: {
  query: string
  results: DeliveryPackage[]
  disabled?: boolean
  onQueryChange: (value: string) => void
  onSelect: (item: DeliveryPackage) => void
}) {
  const visibleResults = results.slice(0, 6)
  return <div className="scanner-package-search">
    <label className="manual-scan-label"><span>Recherche rapide</span><div className="scanner-search-input"><span aria-hidden="true">⌕</span><input disabled={disabled} value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Code, nom ou téléphone" />{query && <button type="button" aria-label="Effacer la recherche" onClick={() => onQueryChange('')}>×</button>}</div></label>
    {query.trim() && <div className="scanner-search-results" role="listbox" aria-label="Résultats de la recherche"><div className="scanner-search-results-header"><strong>{results.length} résultat{results.length > 1 ? 's' : ''}</strong><span>Sélectionnez un colis</span></div>{visibleResults.map((item) => <button type="button" role="option" key={item.id} disabled={disabled} onClick={() => onSelect(item)}><strong>{item.trackingCode}</strong><span>{item.recipient}</span><small>{item.phone || 'Téléphone non renseigné'}</small><em>{item.price} DH</em></button>)}{results.length > visibleResults.length && <p>Affinez la recherche pour voir les autres colis.</p>}{results.length === 0 && <p>Aucun colis trouvé. Vérifiez le code, le nom ou le téléphone.</p>}</div>}
  </div>
}

function ScannerQrMark({ variant = 'outgoing' }: { variant?: 'outgoing' | 'return' }) {
  return <div className={`scanner-qr scanner-qr-${variant}`} aria-hidden="true"><svg viewBox="0 0 112 112" focusable="false">
    <rect className="scanner-qr-surface" x="2" y="2" width="108" height="108" rx="18" />
    <g className="scanner-qr-ink">
      <rect x="11" y="11" width="30" height="30" rx="3" /><rect className="scanner-qr-cutout" x="16" y="16" width="20" height="20" rx="1" /><rect x="21" y="21" width="10" height="10" rx="1" />
      <rect x="71" y="11" width="30" height="30" rx="3" /><rect className="scanner-qr-cutout" x="76" y="16" width="20" height="20" rx="1" /><rect x="81" y="21" width="10" height="10" rx="1" />
      <rect x="11" y="71" width="30" height="30" rx="3" /><rect className="scanner-qr-cutout" x="16" y="76" width="20" height="20" rx="1" /><rect x="21" y="81" width="10" height="10" rx="1" />
      <path d="M48 11h5v5h5v-5h5v10h5v5h-5v5h-5v-5h-5v10h-5v-5h-5v-5h5ZM48 43h5v5h10v5h-5v5h-5v-5h-5ZM68 43h5v5h5v5h-5v5h-5v5h-5v-10h5ZM43 58h5v5h5v-5h5v10h-5v5h-5v-5h-5ZM63 63h5v5h5v5h-5v5h-5v-5h-5v-5h5ZM43 73h5v5h10v5h5v5h-5v5h-5v-5h-5v5h-5v-5h-5v-5h5ZM73 78h5v5h5v-5h5v10h5v5h-5v5h-5v-5h-5v5h-5v-5h-5Z" />
      <path d="M48 33h5v5h-5zM58 38h5v5h-5zM43 48h5v5h-5zM78 48h5v5h-5zM83 58h5v5h-5zM48 68h5v5h-5zM58 73h5v5h-5zM68 83h5v5h-5zM93 68h5v5h-5zM93 93h5v5h-5z" />
    </g>
  </svg></div>
}

function Dashboard({ packages, drivers, selectedDate, onNavigate, onImported }: { packages: DeliveryPackage[]; drivers: Driver[]; selectedDate: string; onNavigate: (page: Page) => void; onImported: Refresh }) {
  const [stats, setStats] = useState<DailyDashboardStats | null>(null)
  const [driverStats, setDriverStats] = useState<DailyDriverStats[]>([])
  const [statsError, setStatsError] = useState('')
  const [statsRefreshKey, setStatsRefreshKey] = useState(0)

  useEffect(() => {
    let mounted = true
    void Promise.all([fetchDailyDashboardStats(selectedDate), fetchDailyDriverStats(selectedDate)])
      .then(([dailyStats, dailyDriverStats]) => { if (mounted) { setStats(dailyStats); setDriverStats(dailyDriverStats); setStatsError('') } })
      .catch(() => { if (mounted) setStatsError('Impossible de charger les statistiques de cette date.') })
    return () => { mounted = false }
  }, [selectedDate, statsRefreshKey])

  async function handleImported() {
    await onImported()
    setStatsRefreshKey((current) => current + 1)
  }

  const importedPackagesForDate = packages.filter((item) => item.createdAt?.slice(0, 10) === selectedDate).length
  const packagesForSelectedDate = packages.filter((item) =>
    item.createdAt?.slice(0, 10) === selectedDate
    || item.nextDeliveryDate === selectedDate
    || item.nextConfirmationAt?.slice(0, 10) === selectedDate
    || item.reportScheduledFor === selectedDate
    || item.reportedAt?.slice(0, 10) === selectedDate
    || item.deliveryStartedAt?.slice(0, 10) === selectedDate,
  ).map((item) => {
    const reportWasCreatedToday = item.reportedAt?.slice(0, 10) === selectedDate
    const reportIsScheduledLater = Boolean(item.reportScheduledFor && item.reportScheduledFor > selectedDate)
    return reportWasCreatedToday && reportIsScheduledLater ? { ...item, status: 'REPORTE' as DeliveryPackage['status'] } : item
  })
  const dailyStats = stats ?? { totalPackagesImported: importedPackagesForDate, attempts: 0, delivered: 0, unreachable: 0, postponed: 0, refused: 0, addressNotFound: 0 }
  const totalPackagesForDate = packagesForSelectedDate.length
  const driverStatsById = new Map(driverStats.map((stat) => [stat.driverId, stat]))
  const driversForSelectedDate = drivers.map((driver) => {
    const dailyDriver = driverStatsById.get(driver.id)
    const inProgressToday = packages.filter((item) => item.driverId === driver.id
      && item.status === 'EN LIVRAISON'
      && item.deliveryStartedAt?.slice(0, 10) === selectedDate).length
    return { ...driver, assigned: dailyDriver?.processed ?? 0, inProgress: inProgressToday, delivered: dailyDriver?.delivered ?? 0, earned: Number(dailyDriver?.deliveredAmount ?? 0) }
  })
  const confirmedPackagesForDate = packages.filter((item) => item.confirmedAt?.slice(0, 10) === selectedDate).length
  const activityTotal = totalPackagesForDate
  return <>
    <div className="page-intro"><div><h2>Bonjour, Admin</h2><p>Consultez l activite de livraison pour la journée choisie dans l’en-tête.</p></div><div className="dashboard-actions"><ExcelImportButton onImported={handleImported} /></div></div>
    {statsError && <p className="driver-message">{statsError}</p>}
    <section className="stats-grid dashboard-summary"><StatCard label="Colis du jour" value={String(totalPackagesForDate)} detail="Importés, créés ou reportés à cette date" tone="blue" /><StatCard label="Colis confirmés" value={String(confirmedPackagesForDate)} detail="Clients confirmés par appel ou WhatsApp" tone="orange" /><StatCard label="Livrés" value={String(dailyStats.delivered)} detail="Livraisons réussies" tone="green" /></section>
    <div className="grid-2"><section className="panel"><div className="panel-heading"><h3>Activité du {selectedDate}</h3><button className="text-button" onClick={() => onNavigate('packages')}>Voir les colis</button></div><div className="panel-body"><Progress label="Colis du jour" value={totalPackagesForDate} total={activityTotal} tone="blue" /><Progress label="Colis confirmés" value={confirmedPackagesForDate} total={activityTotal} tone="orange" /><Progress label="Colis livrés" value={dailyStats.delivered} total={activityTotal} tone="green" /></div></section><section className="panel"><div className="panel-heading"><h3>Activite des livreurs du {selectedDate}</h3><button className="text-button" onClick={() => onNavigate('drivers')}>Voir tout</button></div><div className="panel-body"><div className="driver-list">{driversForSelectedDate.map((driver) => <DriverRow driver={driver} key={driver.id} />)}</div></div></section></div>
    <section className="panel table-panel"><div className="panel-heading"><h3>Colis du {selectedDate}</h3><button className="text-button" onClick={() => onNavigate('packages')}>Voir tous</button></div><PackageTable packages={packagesForSelectedDate} compact /></section>
  </>
}

function Progress({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const percent = total ? Math.round((value / total) * 100) : 0
  return <div className="progress-row"><div className="progress-label"><span>{label}</span><span>{value} colis</span></div><div className="progress-track"><div className={`progress-bar ${tone}-bar`} style={{ width: `${percent}%` }} /></div></div>
}

function DriverRow({ driver }: { driver: Driver }) { return <div className="driver-row"><div className="driver-avatar">{driver.initials}</div><div className="driver-info"><strong>{driver.name}</strong><span>{driver.delivered} livres - {(driver.earned ?? 0).toFixed(2)} DH</span></div><div className="driver-total">{driver.inProgress}<small>en cours</small></div></div> }

function PackagesPage({ packages, allPackages, onImported }: { packages: DeliveryPackage[]; allPackages: DeliveryPackage[]; onImported: Refresh }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Tous les statuts')
  const [page, setPage] = useState(1)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [ticketScannerOpen, setTicketScannerOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingPackage, setEditingPackage] = useState<DeliveryPackage | null>(null)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [form, setForm] = useState({ trackingCode: '', storeName: '', recipient: '', phone: '', city: '', address: '', price: '', importComment: '', packageStatus: 'MIS EN DISTRIBUTION', nextDeliveryDate: '' })
  const searchablePackages = query.trim() ? allPackages : packages
  const filtered = useMemo(() => searchablePackages.filter((item) => matchesPackageSearch(item, query) && (status === 'Tous les statuts' || item.status === status)), [searchablePackages, query, status])
  const pagedPackages = pageItems(filtered, page, TABLE_PAGE_SIZE)
  function updateForm(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })) }
  function startManualPackage() {
    setAddMenuOpen(false)
    setEditingPackage(null)
    setForm({ trackingCode: '', storeName: '', recipient: '', phone: '', city: '', address: '', price: '', importComment: '', packageStatus: 'MIS EN DISTRIBUTION', nextDeliveryDate: '' })
    setFormOpen(true)
    setMessage('')
  }
  function startTicketScan() {
    setAddMenuOpen(false)
    setTicketScannerOpen(true)
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (editingPackage && form.packageStatus === 'REPORTE' && !form.nextDeliveryDate) {
      setMessage('Choisissez la nouvelle date de livraison pour ce colis reporté.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      if (editingPackage) {
        await updatePackage(editingPackage.id, { ...form, price: Number(form.price), driverId: editingPackage.driverId ?? null, status: form.packageStatus as DeliveryPackage['status'], nextDeliveryDate: form.packageStatus === 'REPORTE' ? form.nextDeliveryDate : null })
      } else {
        await createPackage({ ...form, price: Number(form.price) })
      }
      await onImported()
      setForm({ trackingCode: '', storeName: '', recipient: '', phone: '', city: '', address: '', price: '', importComment: '', packageStatus: 'MIS EN DISTRIBUTION', nextDeliveryDate: '' })
      setFormOpen(false)
      setEditingPackage(null)
      setPage(1)
      setMessage(editingPackage ? 'Colis modifié avec succès.' : 'Colis ajouté avec succès.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Creation impossible')
    } finally { setSaving(false) }
  }
  function startEditPackage(item: DeliveryPackage) {
    setEditingPackage(item)
    setForm({ trackingCode: item.trackingCode, storeName: item.storeName ?? '', recipient: item.recipient, phone: item.phone ?? '', city: item.city, address: item.address, price: String(item.price), importComment: item.importComment ?? '', packageStatus: item.status, nextDeliveryDate: item.nextDeliveryDate ?? '' })
    setFormOpen(true)
    setMessage('')
  }

  async function handleDeletePackage(item: DeliveryPackage) {
    if (!window.confirm(`Supprimer définitivement le colis ${item.trackingCode} ? Son historique et ses tentatives seront aussi supprimés.`)) return
    setSaving(true)
    setMessage('')
    try {
      await deletePackage(item.id)
      await onImported()
      setPage(1)
      setMessage('Colis supprimé avec succès.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Suppression impossible.')
    } finally { setSaving(false) }
  }

  function handleCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const item = allPackages.find((current) => current.trackingCode.toLowerCase() === trackingCode.toLowerCase())
    if (!item) {
      setMessage(`Aucun colis ne correspond au code ${trackingCode}.`)
      return
    }
    setQuery(item.trackingCode)
    setStatus('Tous les statuts')
    setPage(1)
    setMessage(`Colis ${item.trackingCode} trouve: ${item.recipient}.`)
  }
  async function handleExport() {
    setExporting(true)
    setMessage('')
    try {
      await downloadPackagesExcel()
      setMessage('Export Excel téléchargé.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Export impossible.')
    } finally { setExporting(false) }
  }
  function handleTicketDetected(ticket: ScannedTicket) {
    setTicketScannerOpen(false)
    setEditingPackage(null)
    setForm({
      trackingCode: ticket.trackingCode ?? '', storeName: '', recipient: ticket.recipient ?? '', phone: ticket.phone ?? '', city: ticket.city ?? '', address: ticket.address ?? '', price: ticket.price ?? '', importComment: ticket.importComment ?? '', packageStatus: 'MIS EN DISTRIBUTION', nextDeliveryDate: '',
    })
    setFormOpen(true)
    setMessage('Informations lues : vérifiez les champs puis créez le colis.')
  }
  return <>
    <div className="page-intro"><div><h2>Tous les colis</h2><p>Suivez chaque colis de la base de donnees.</p></div><div className="package-page-actions"><div className="add-package-menu"><button className="primary-button" type="button" aria-expanded={addMenuOpen} aria-haspopup="menu" onClick={() => setAddMenuOpen((current) => !current)}>Ajouter un colis <span className="button-chevron" aria-hidden="true" /></button>{addMenuOpen && <div className="add-package-options" role="menu"><button type="button" role="menuitem" onClick={startManualPackage}><strong>Saisie manuelle</strong><small>Remplir les informations du colis</small></button><button type="button" role="menuitem" onClick={startTicketScan}><strong>Scanner une étiquette</strong><small>Lire automatiquement les informations</small></button></div>}</div><ExcelImportButton onImported={onImported} /></div></div>
    {formOpen && <form className="panel package-form" onSubmit={handleSubmit}>
      <h3>{editingPackage ? 'Modifier le colis' : 'Nouveau colis'}</h3>
      <div className="package-form-grid">
        <label><span>Code de suivi</span><input required placeholder="Ex. DH22BAAC" value={form.trackingCode} onChange={(event) => updateForm('trackingCode', event.target.value)} /></label>
        <label><span>Nom du magasin</span><input placeholder="Nom du magasin" value={form.storeName} onChange={(event) => updateForm('storeName', event.target.value)} /></label>
        <label><span>Destinataire</span><input required placeholder="Nom complet" value={form.recipient} onChange={(event) => updateForm('recipient', event.target.value)} /></label>
        <label><span>Téléphone</span><input required type="tel" placeholder="06..." value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} /></label>
        <label><span>Ville</span><input required placeholder="Ville" value={form.city} onChange={(event) => updateForm('city', event.target.value)} /></label>
        <label><span>Adresse</span><input required placeholder="Adresse de livraison" value={form.address} onChange={(event) => updateForm('address', event.target.value)} /></label>
        <label><span>Montant (DH)</span><input required min="0" step="0.01" type="number" placeholder="0.00" value={form.price} onChange={(event) => updateForm('price', event.target.value)} /></label>
        {editingPackage && <label><span>Statut</span><select value={form.packageStatus} onChange={(event) => updateForm('packageStatus', event.target.value)}><option>MIS EN DISTRIBUTION</option><option>PAS DE REPONSE</option><option>BOITE VOCALE</option><option>HORS ZONE</option><option>A RECEPTIONNER</option><option>EN AGENCE</option><option>A LIVRER</option><option>AFFECTE</option><option>EN LIVRAISON</option><option>REPORTE</option><option>LIVRE</option><option>RETOUR</option><option>RETOUR ENVOYE</option><option>ANNULE</option></select></label>}
        {editingPackage && form.packageStatus === 'REPORTE' && <label><span>Nouvelle date de livraison</span><input required min={todayIsoDate()} type="date" value={form.nextDeliveryDate} onChange={(event) => updateForm('nextDeliveryDate', event.target.value)} /></label>}
        <label className="package-form-comment"><span>Commentaire (optionnel)</span><input placeholder="Informations complémentaires" value={form.importComment} onChange={(event) => updateForm('importComment', event.target.value)} /></label>
      </div>
      <div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? 'Enregistrement...' : editingPackage ? 'Enregistrer les modifications' : 'Créer le colis'}</button><button type="button" className="secondary-button" disabled={saving} onClick={() => { setFormOpen(false); setEditingPackage(null) }}>Annuler</button></div>
    </form>}
    <div className="filter-bar"><input className="filter-input" placeholder="Code, nom ou téléphone" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /><select className="filter-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option>Tous les statuts</option><option>MIS EN DISTRIBUTION</option><option>PAS DE REPONSE</option><option>BOITE VOCALE</option><option>HORS ZONE</option><option>A RECEPTIONNER</option><option>EN AGENCE</option><option>A LIVRER</option><option>AFFECTE</option><option>EN LIVRAISON</option><option>REPORTE</option><option>LIVRE</option><option>RETOUR</option><option>RETOUR ENVOYE</option><option>ANNULE</option></select><button className="secondary-button" onClick={() => setCameraOpen(true)}>Scanner camera</button></div>
    {message && <p className="driver-message">{message}</p>}
    <section className="panel"><PackageTable packages={pagedPackages} onEdit={startEditPackage} onDelete={handleDeletePackage} /><Pagination currentPage={page} totalItems={filtered.length} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} /></section>
    {allPackages.length > 0 && <div className="package-export-actions"><button className="primary-button" type="button" disabled={exporting} onClick={() => void handleExport()}>{exporting ? 'Export en cours...' : 'Télécharger Excel'}</button></div>}
    {cameraOpen && <BarcodeScanner onDetected={handleCameraCode} onClose={() => setCameraOpen(false)} />}
    {ticketScannerOpen && <TicketOcrScanner onDetected={handleTicketDetected} onClose={() => setTicketScannerOpen(false)} />}
  </>
}

function ReceptionPage({ packages, onRefresh }: { packages: DeliveryPackage[]; onRefresh: Refresh }) {
  const [code, setCode] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [cameraOpen, setCameraOpen] = useState(false)
  const waiting = packages.filter((item) => item.status === 'A RECEPTIONNER')

  async function receive(trackingCode: string) {
    const item = waiting.find((current) => current.trackingCode.toLowerCase() === trackingCode.trim().toLowerCase())
    if (!item) { setMessage(`Aucun colis à réceptionner ne correspond au code ${trackingCode}.`); return }
    setSaving(true)
    try {
      await registerAgencyArrival(item.id)
      await onRefresh()
      setCode('')
      setMessage(`Colis ${item.trackingCode} reçu en agence.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Réception impossible.') } finally { setSaving(false) }
  }

  return <><div className="page-intro"><div><h2>Réception des colis</h2><p>Scannez les colis confirmés dès leur arrivée au dépôt.</p></div><span className="status au-depot">{waiting.length} à réceptionner</span></div><section className="panel reception-panel"><form className="driver-scan-form" onSubmit={(event) => { event.preventDefault(); void receive(code) }}><input className="filter-input" autoFocus value={code} onChange={(event) => setCode(event.target.value)} placeholder="Scanner ou saisir le code de suivi" /><button className="primary-button" disabled={saving || !code}>{saving ? 'Réception...' : 'Réceptionner'}</button><button className="secondary-button" type="button" disabled={saving} onClick={() => setCameraOpen(true)}>Caméra</button></form>{message && <p className="driver-message">{message}</p>}</section><section className="panel table-panel"><div className="panel-heading"><h3>Colis confirmés en attente de réception</h3></div><PackageTable packages={waiting} /></section>{cameraOpen && <BarcodeScanner onDetected={(trackingCode) => { setCameraOpen(false); void receive(trackingCode) }} onClose={() => setCameraOpen(false)} />}</>
}

function ScannerPage({ packages, drivers, onRefresh }: { packages: DeliveryPackage[]; drivers: Driver[]; onRefresh: Refresh }) {
  const [scanned, setScanned] = useState<DeliveryPackage | null>(null)
  const [driverId, setDriverId] = useState('')
  const [packageQuery, setPackageQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [message, setMessage] = useState('')
  const selectedDriver = drivers.find((driver) => driver.id === Number(driverId))
  const prepared = packages.filter((item) => item.status === 'AFFECTE' && item.driverId === Number(driverId))
  const candidates = packages.filter((item) => item.status === 'EN AGENCE' || item.status === 'A LIVRER')
  const matchingCandidates = candidates.filter((item) => matchesPackageSearch(item, packageQuery))
  async function confirmExit() {
    if (!selectedDriver) return
    setSaving(true)
    try { await confirmDriverDeparture(selectedDriver.id); await onRefresh(); setScanned(null); setMessage(`Départ de ${selectedDriver.name} confirmé : ${prepared.length} colis en livraison.`) } catch (error) { setMessage(error instanceof Error ? error.message : 'Confirmation impossible.') } finally { setSaving(false) }
  }
  async function handleCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const alreadyPrepared = prepared.find((current) => current.trackingCode.toLowerCase() === trackingCode.toLowerCase())
    if (alreadyPrepared) { setScanned(alreadyPrepared); setMessage(`Colis ${alreadyPrepared.trackingCode} déjà affecté.`); return }
    const item = candidates.find((current) => current.trackingCode.toLowerCase() === trackingCode.toLowerCase())
    if (!item || !selectedDriver) {
      setMessage(`Le code ${trackingCode} ne correspond à aucun colis disponible en agence.`)
      return
    }
    setSaving(true)
    try { await assignPackage(item.id, selectedDriver.id); await onRefresh(); setScanned(item); setMessage(`Colis ${item.trackingCode} affecté à ${selectedDriver.name}.`) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Affectation impossible.') } finally { setSaving(false) }
  }
  function changeDriver(value: string) {
    setDriverId(value)
    setPackageQuery('')
    setScanned(null)
    setMessage('')
  }
  return <>
    <div className="scanner-page-heading">
      <div><p className="eyebrow">SORTIE DE TOURNEE</p><h2>Confirmer le départ</h2><p>Vérifiez les colis affectés, puis confirmez la sortie du livreur.</p></div>
      <label className="scanner-driver-picker"><span>1</span><select value={driverId} onChange={(event) => changeDriver(event.target.value)}><option value="">Choisir un livreur</option>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</select></label>
    </div>
    {message && <p className="driver-message">{message}</p>}
    <div className="scanner-layout scanner-workspace">
      <section className="panel scanner-box">
        <div className="scanner-box-content">
          <ScannerQrMark />
          <p className="scanner-step">ETAPE 2</p>
          <h3>{selectedDriver ? `Scanner pour ${selectedDriver.name}` : 'Choisissez un livreur'}</h3>
          <p>{selectedDriver ? `${prepared.length} colis affecté(s). Scannez les colis confirmés en agence pour les ajouter.` : 'Sélectionnez d abord le livreur qui prend les colis.'}</p>
          <button className="primary-button" disabled={!selectedDriver} onClick={() => setCameraOpen(true)}>Ouvrir la camera</button>
          <ScannerPackageSearch query={packageQuery} results={matchingCandidates} disabled={!selectedDriver || saving} onQueryChange={setPackageQuery} onSelect={(item) => { setPackageQuery(''); void handleCameraCode(item.trackingCode) }} />
        </div>
      </section>
      <section className="panel scan-result">
        <div className="scan-result-heading"><div><p className="eyebrow">ETAPE 3</p><h3>Vérification avant départ</h3></div>{selectedDriver && <span className="status affecte">{prepared.length} PRÊTS</span>}</div>
        {selectedDriver ? <>{scanned && <><div className="scan-code">{scanned.trackingCode}</div><div className="detail-row"><span>Destinataire</span><strong>{scanned.recipient}</strong></div></>}<div className="detail-row"><span>Livreur</span><strong>{selectedDriver.name}</strong></div><div className="detail-row"><span>Colis à sortir</span><strong>{prepared.length}</strong></div><button className="primary-button scan-confirm-button" disabled={saving || prepared.length === 0} onClick={confirmExit}>{saving ? 'Enregistrement...' : 'Confirmer le départ'}</button></> : <div className="scan-empty"><div>CODE</div><strong>Choisissez un livreur</strong><p>Les colis affectés apparaîtront ici avant le départ.</p></div>}
      </section>
    </div>
    {cameraOpen && <BarcodeScanner onDetected={(trackingCode) => void handleCameraCode(trackingCode)} onClose={() => setCameraOpen(false)} />}
  </>
}

function DriverMetrics({ driver }: { driver: Driver }) { return <div className="driver-metrics"><div><strong>{driver.assigned}</strong><span>Total affectes</span></div><div><strong>{driver.confirmed}</strong><span>Confirmes</span></div><div><strong>{driver.inProgress}</strong><span>En cours</span></div><div><strong>{driver.delivered}</strong><span>Livres</span></div><div><strong>{driver.returns}</strong><span>Retours</span></div></div> }

function DriversPage({ drivers, packages, onRefresh, onViewPackages }: { drivers: Driver[]; packages: DeliveryPackage[]; onRefresh: Refresh; onViewPackages: (driver: Driver) => void }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const [packageStatus, setPackageStatus] = useState<'TOUS' | DeliveryPackage['status']>('TOUS')
  const filteredDrivers = drivers.filter((driver) => packageStatus === 'TOUS'
    || packages.some((item) => item.driverId === driver.id && item.status === packageStatus))
  const pagedDrivers = pageItems(filteredDrivers, page, DRIVER_PAGE_SIZE)

  function startCreate() { setEditing(null); setName(''); setPhone(''); setPassword(''); setMessage(''); setOpen(true) }
  async function startEdit(driver: Driver) {
    setEditing(driver); setName(driver.name); setPhone(driver.phone); setPassword(''); setMessage(''); setOpen(true)
    try {
      const currentDriver = await fetchDriver(driver.id)
      setName(currentDriver.name); setPhone(currentDriver.phone)
    } catch { /* Keep the values already present in the list. */ }
  }
  function cancelForm() { setOpen(false); setEditing(null); setName(''); setPhone(''); setPassword(''); setMessage('') }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      if (editing) await updateDriver(editing.id, name, phone, password, editing.active)
      else await createDriver(name, phone, password)
      await onRefresh(); setPage(1); setOpen(false); setEditing(null); setMessage(editing ? 'Livreur modifie avec succes.' : 'Livreur ajoute avec succes.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Operation impossible') } finally { setSaving(false) }
  }
  async function handleDelete(driver: Driver) {
    if (!window.confirm(`Désactiver ${driver.name} ? Il ne pourra plus se connecter et ne sera plus affiché.`)) return
    try { await deleteDriver(driver.id); await onRefresh(); setPage(1); setMessage('Livreur désactivé avec succès.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Suppression impossible') }
  }
  return <>
    <div className="page-intro"><div><h2>Livreurs</h2><p>Suivez la charge et la performance de votre équipe.</p></div><button className="primary-button" onClick={startCreate}>Ajouter un livreur</button></div>
    <div className="filter-bar"><select className="filter-select" value={packageStatus} onChange={(event) => { setPackageStatus(event.target.value as typeof packageStatus); setPage(1) }}><option value="TOUS">Tous les livreurs</option><option value="MIS EN DISTRIBUTION">Mis en distribution</option><option value="PAS DE REPONSE">Colis sans réponse</option><option value="BOITE VOCALE">Boîte vocale</option><option value="HORS ZONE">Hors zone</option><option value="A RECEPTIONNER">Colis à réceptionner</option><option value="EN AGENCE">Colis en agence</option><option value="A LIVRER">Colis à livrer</option><option value="AFFECTE">Colis affectés</option><option value="EN LIVRAISON">Colis en livraison</option><option value="REPORTE">Colis reportés</option><option value="LIVRE">Colis livrés</option><option value="RETOUR">Colis en retour</option><option value="RETOUR ENVOYE">Retours envoyés</option><option value="ANNULE">Colis annulés</option></select></div>
    {open && <form className="panel driver-form" onSubmit={handleSubmit}><h3>{editing ? 'Modifier le livreur' : 'Nouveau livreur'}</h3><div className="form-grid"><label><span>Nom complet</span><input required placeholder="Nom complet" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Téléphone</span><input required type="tel" placeholder="Téléphone" value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label><span>{editing ? 'Nouveau mot de passe' : 'Mot de passe'}</span><input required={!editing} minLength={6} type="password" autoComplete={editing ? 'new-password' : 'current-password'} placeholder={editing ? 'Laisser vide pour conserver' : 'Mot de passe'} value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Créer le compte'}</button><button type="button" className="secondary-button" disabled={saving} onClick={cancelForm}>Annuler</button></div></div></form>}
    {message && <p className="form-message">{message}</p>}
    <section className="assignment-grid">{pagedDrivers.map((driver) => <article className="driver-card" key={driver.id}><div className="driver-card-head"><div className="driver-avatar">{driver.initials}</div><div><h3>{driver.name}</h3><p><span className={`status ${driver.active ? 'livre' : 'retour'}`}>{driver.active ? 'Actif' : 'Inactif'}</span></p></div></div><DriverMetrics driver={driver} /><div className="card-actions"><button type="button" className="secondary-button" onClick={() => onViewPackages(driver)}>Voir les colis</button><button type="button" className="secondary-button" onClick={() => void startEdit(driver)}>Modifier</button><button type="button" className="danger-button" onClick={() => handleDelete(driver)}>Désactiver</button></div></article>)}{filteredDrivers.length === 0 && <div className="panel empty-state">Aucun livreur ne possède de colis avec ce statut.</div>}</section>
    <Pagination currentPage={page} totalItems={filteredDrivers.length} pageSize={DRIVER_PAGE_SIZE} onPageChange={setPage} />
  </>
}

function DriverPackagesPage({ driver, selectedDate, onBack }: { driver: Driver; selectedDate: string; onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'TOUS' | DeliveryPackage['status']>('TOUS')
  const [page, setPage] = useState(1)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [driverPackages, setDriverPackages] = useState<DeliveryPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setPage(1)
    void fetchDriverDailyActivities(driver.id, selectedDate, driver.name)
      .then((items) => { if (mounted) { setDriverPackages(items); setLoadError('') } })
      .catch((error) => { if (mounted) { setDriverPackages([]); setLoadError(error instanceof Error ? error.message : 'Impossible de charger l’activité du livreur.') } })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [driver.id, driver.name, selectedDate])

  const filteredPackages = driverPackages.filter((item) => {
    const matchesQuery = matchesPackageSearch(item, query)
    return matchesQuery && (status === 'TOUS' || item.status === status)
  })
  const pagedPackages = pageItems(filteredPackages, page, TABLE_PAGE_SIZE)
  const dailyDriver = { ...driver, assigned: driverPackages.filter((item) => item.deliveryStartedAt?.slice(0, 10) === selectedDate).length, inProgress: driverPackages.filter((item) => item.status === 'EN LIVRAISON').length, delivered: driverPackages.filter((item) => item.status === 'LIVRE').length, returns: driverPackages.filter((item) => item.status === 'RETOUR' || item.status === 'EN AGENCE').length }
  return <><div className="page-intro"><div><button className="text-button" onClick={onBack}>← Retour aux livreurs</button><h2>{driver.name}</h2><p>{driver.phone} · Activité de livraison du {selectedDate}.</p></div></div><section className="panel driver-detail-summary"><DriverMetrics driver={dailyDriver} /></section><div className="filter-bar"><input className="filter-input" placeholder="Code, nom ou téléphone" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /><button className="secondary-button" type="button" onClick={() => setCameraOpen(true)}>Scanner</button><select className="filter-select" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1) }}><option value="TOUS">Tous les statuts</option><option value="MIS EN DISTRIBUTION">Mis en distribution</option><option value="PAS DE REPONSE">Pas de réponse</option><option value="BOITE VOCALE">Boîte vocale</option><option value="HORS ZONE">Hors zone</option><option value="A RECEPTIONNER">A receptionner</option><option value="EN AGENCE">En agence</option><option value="A LIVRER">A livrer</option><option value="AFFECTE">Affectes</option><option value="EN LIVRAISON">En cours</option><option value="REPORTE">Reportes</option><option value="LIVRE">Livres</option><option value="RETOUR">Retour</option><option value="RETOUR ENVOYE">Retour envoye</option><option value="ANNULE">Annule</option></select></div>{loadError && <p className="driver-message error">{loadError}</p>}<section className="panel table-panel"><div className="panel-heading"><h3>Activité de {driver.name}</h3><span className="status a-livrer">{filteredPackages.length} colis</span></div>{loading ? <div className="empty-state">Chargement de l’activité...</div> : <><PackageTable packages={pagedPackages} /><Pagination currentPage={page} totalItems={filteredPackages.length} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} /></>}</section>{cameraOpen && <BarcodeScanner onDetected={(trackingCode) => { setCameraOpen(false); setQuery(trackingCode); setPage(1) }} onClose={() => setCameraOpen(false)} />}</>
}
function ReturnsPage({ packages, onRefresh }: { packages: DeliveryPackage[]; onRefresh: Refresh }) {
  const [scanned, setScanned] = useState<DeliveryPackage | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [shipmentCameraOpen, setShipmentCameraOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [returnQuery, setReturnQuery] = useState('')
  const [nextReturnDeliveryDate, setNextReturnDeliveryDate] = useState('')
  const [returnPostponeModalOpen, setReturnPostponeModalOpen] = useState(false)
  const [shipmentPackageIds, setShipmentPackageIds] = useState<number[]>([])
  const [shipmentReference, setShipmentReference] = useState('')
  const [page, setPage] = useState(1)
  const returnCandidates = packages.filter((item) => item.driver && item.status === 'EN LIVRAISON')
  const matchingReturnCandidates = returnCandidates.filter((item) => matchesPackageSearch(item, returnQuery))
  const isPendingReturnDecision = (item: DeliveryPackage | null) => Boolean(item
    && item.status === 'EN AGENCE'
    && item.returnedToDepotAt
    && !item.depotDecisionAt)
  const pendingDecisions = packages.filter(isPendingReturnDecision)
  const returnedPackages = packages.filter((item) => item.status === 'RETOUR')
  const pagedReturnedPackages = pageItems(returnedPackages, page, TABLE_PAGE_SIZE)

  function handleCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const item = returnCandidates.find((current) => current.trackingCode.toLowerCase() === trackingCode.toLowerCase())
    if (!item) {
      setMessage(`Le code ${trackingCode} ne correspond à aucun colis à retourner.`)
      return
    }
    setScanned(item)
    setMessage(`Colis ${item.trackingCode} détecté. Vérifiez puis confirmez le retour.`)
  }

  async function receiveAtDepot() {
    if (!scanned || saving) return
    setSaving(true)
    try {
      await registerDepotArrival(scanned.id)
      await onRefresh()
      setPage(1)
      setScanned({ ...scanned, status: 'EN AGENCE', driver: null, returnedToDepotAt: new Date().toISOString() })
      setMessage(`Colis ${scanned.trackingCode} réceptionné en agence. Choisissez la décision.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La réception en agence n'a pas pu être enregistrée.")
    } finally {
      setSaving(false)
    }
  }

  async function decideReturn(status: 'EN AGENCE' | 'REPORTE' | 'RETOUR' | 'RETOUR DEFINITIF') {
    if (!scanned || saving || !isPendingReturnDecision(scanned)) return
    if (status === 'REPORTE' && !nextReturnDeliveryDate) {
      setMessage('Choisissez la nouvelle date de livraison.')
      return
    }
    setSaving(true)
    try {
      const finalStatus = status === 'RETOUR DEFINITIF' ? 'RETOUR' : status
      await decideDepotStatus(scanned.id, finalStatus, finalStatus === 'REPORTE' ? nextReturnDeliveryDate : undefined)
      await onRefresh()
      setPage(1)
      setNextReturnDeliveryDate('')
      if (finalStatus === 'REPORTE') setReturnPostponeModalOpen(false)
      setMessage(finalStatus === 'RETOUR'
        ? `Colis ${scanned.trackingCode} en attente d’envoi à l’entreprise.`
        : finalStatus === 'EN AGENCE'
          ? `Colis ${scanned.trackingCode} conservé en agence.`
          : `Nouvelle livraison de ${scanned.trackingCode} programmée.`)
      setScanned(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La décision en agence n'a pas pu être enregistrée.")
    } finally {
      setSaving(false)
    }
  }
  function addToShipment(trackingCode: string) {
    setShipmentCameraOpen(false)
    const item = returnedPackages.find((current) => current.trackingCode.toLowerCase() === trackingCode.trim().toLowerCase())
    if (!item) { setMessage('Ce colis n’est pas en attente d’envoi à l’entreprise.'); return }
    setShipmentPackageIds((ids) => ids.includes(item.id) ? ids : [...ids, item.id])
    setMessage(`Colis ${item.trackingCode} ajouté au bordereau.`)
  }

  async function confirmShipment() {
    if (shipmentPackageIds.length === 0 || saving) return
    setSaving(true)
    try {
      await shipReturns(shipmentPackageIds, shipmentReference)
      await onRefresh()
      setShipmentPackageIds([])
      setShipmentReference('')
      setMessage('Bordereau confirmé : les colis ont été envoyés à l’entreprise.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'L’envoi des retours n’a pas pu être confirmé.')
    } finally { setSaving(false) }
  }

  return <>
    <div className="scanner-page-heading"><div><p className="eyebrow">FIN DE TOURNEE</p><h2>Scanner les retours</h2><p>Scannez chaque colis non livré avant de le reprendre au livreur.</p></div><div className="return-heading-indicators"><span className="status retour">{returnCandidates.length} à recevoir</span>{pendingDecisions.length > 0 && <span className="pending-decision-chip">{pendingDecisions.length} à décider</span>}</div></div>
    {message && <p className="driver-message">{message}</p>}
    {pendingDecisions.length > 0 && <section className="panel pending-returns-panel"><div className="panel-heading"><h3>Décisions retour en attente</h3><span className="status retour">{pendingDecisions.length} à décider</span></div><div className="pending-returns-list">{pendingDecisions.map((item) => <button className="pending-return-item" key={item.id} onClick={() => { setScanned(item); setNextReturnDeliveryDate(''); setMessage(`Colis ${item.trackingCode} sélectionné. Choisissez une décision.`) }}><span><strong className="tracking">{item.trackingCode}</strong><small>{item.recipient} · {item.city}</small></span><span>Décider</span></button>)}</div></section>}
    <div className="scanner-layout scanner-workspace return-workspace">
      <section className="panel scanner-box"><div className="scanner-box-content"><ScannerQrMark variant="return" /><p className="scanner-step">RECEPTION</p><h3>Scanner un colis retourné</h3><p>Réceptionnez le colis, puis décidez s'il doit être relivré ou retourné.</p><button className="primary-button" disabled={returnCandidates.length === 0} onClick={() => setCameraOpen(true)}>Ouvrir la camera</button><ScannerPackageSearch query={returnQuery} results={matchingReturnCandidates} disabled={returnCandidates.length === 0} onQueryChange={setReturnQuery} onSelect={(item) => { setReturnQuery(''); setScanned(item) }} /></div></section>
      <section className="panel scan-result"><div className="scan-result-heading"><div><p className="eyebrow">VERIFICATION</p><h3>{isPendingReturnDecision(scanned) ? 'Décision administrateur' : 'Colis retourné'}</h3></div>{scanned && <span className={`status ${scanned.status.toLowerCase().replaceAll(' ', '-')}`}>{scanned.status}</span>}</div>{scanned ? <><div className="return-package-identity"><span>Colis</span><strong>{scanned.trackingCode}</strong></div><div className="detail-row"><span>Destinataire</span><strong>{scanned.recipient}</strong></div><div className="detail-row"><span>Livreur actuel</span><strong>{scanned.driver ?? 'Aucun (en agence)'}</strong></div><div className="detail-row"><span>Adresse</span><strong>{scanned.address}, {scanned.city}</strong></div>{!isPendingReturnDecision(scanned) ? <button className="primary-button return-confirm-button" disabled={saving} onClick={() => void receiveAtDepot()}>{saving ? 'Enregistrement...' : 'Confirmer la réception en agence'}</button> : <div className="return-decision-actions"><button className="secondary-button" disabled={saving} onClick={() => setReturnPostponeModalOpen(true)}><strong>Reporter</strong><small>Choisir une nouvelle date</small></button><button className="depot-button" disabled={saving} onClick={() => void decideReturn('EN AGENCE')}><strong>Conserver en agence</strong><small>Conserver le colis sur place</small></button><button className="danger-button" disabled={saving} onClick={() => void decideReturn('RETOUR DEFINITIF')}><strong>Retour définitif</strong><small>Préparer l’envoi à l’entreprise</small></button></div>}</> : <div className="scan-empty"><div>RETOUR</div><strong>En attente de retour</strong><p>Scannez un colis remis par un livreur.</p></div>}</section>
    </div>
    <section className="panel return-table shipment-panel">
      <div className="panel-heading"><div><h3>Retours à envoyer</h3><p>Scannez les colis du carton, puis confirmez le bordereau.</p></div><span className="status retour">{returnedPackages.length} à envoyer</span></div>
      <div className="shipment-form">
        <div className="shipment-scan-row"><input className="filter-input" placeholder="Scanner ou saisir le code retour" onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addToShipment((event.target as HTMLInputElement).value); (event.target as HTMLInputElement).value = '' } }} /><button className="secondary-button" type="button" onClick={() => setShipmentCameraOpen(true)}>Scanner</button></div>
        <label className="shipment-reference">Référence d’envoi <span>optionnel</span><input value={shipmentReference} onChange={(event) => setShipmentReference(event.target.value)} placeholder="Ex. RET-2026-08-21-01" /></label>
        <div className="shipment-footer"><strong><span>{shipmentPackageIds.length}</span> colis scanné(s)</strong><button className="primary-button" disabled={saving || shipmentPackageIds.length === 0} onClick={() => void confirmShipment()}>Confirmer l’envoi</button></div>
      </div>
      <PackageTable packages={pagedReturnedPackages} /><Pagination currentPage={page} totalItems={returnedPackages.length} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} />
    </section>
    {cameraOpen && <BarcodeScanner onDetected={handleCameraCode} onClose={() => setCameraOpen(false)} />}{shipmentCameraOpen && <BarcodeScanner onDetected={addToShipment} onClose={() => setShipmentCameraOpen(false)} />}
    {returnPostponeModalOpen && scanned && <div className="attempt-modal-backdrop" role="dialog" aria-modal="true" aria-label="Date de relivraison">
      <section className="attempt-modal confirmation-modal">
        <div className="attempt-modal-header"><div><p className="eyebrow">REPORTER LA LIVRAISON</p><h2>{scanned.trackingCode}</h2><p>{scanned.recipient}</p></div><button className="secondary-button" disabled={saving} onClick={() => setReturnPostponeModalOpen(false)}>Fermer</button></div>
        <label className="driver-date">Nouvelle date de livraison<input autoFocus min={todayIsoDate()} type="date" value={nextReturnDeliveryDate} onChange={(event) => setNextReturnDeliveryDate(event.target.value)} /></label>
        <div className="form-actions"><button className="secondary-button" disabled={saving} onClick={() => setReturnPostponeModalOpen(false)}>Annuler</button><button className="primary-button" disabled={saving} onClick={() => void decideReturn('REPORTE')}>{saving ? 'Enregistrement...' : 'Programmer la relivraison'}</button></div>
      </section>
    </div>}
  </>
}

function AdminApp({ onLogout }: { onLogout: () => void }) {
  const [activePage, setActivePage] = useState<Page>('dashboard')
  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const currentDate = todayIsoDate()
  const [selectedDate, setSelectedDate] = useState(currentDate)
  const [dailyDriverStats, setDailyDriverStats] = useState<DailyDriverStats[]>([])
  const refresh: Refresh = useCallback(async () => { const data = await fetchDashboardData(); setPackages(data.packages); setDrivers(data.drivers) }, [])
  useEffect(() => {
    let mounted = true
    async function loadDashboard(initialLoad = false) {
      try {
        const data = await fetchDashboardData()
        if (!mounted) return
        setPackages(data.packages)
        setDrivers(data.drivers)
        setError('')
      } catch {
        if (mounted && initialLoad) setError('Le backend est indisponible. Lance Spring Boot sur le port 8080.')
      } finally {
        if (mounted && initialLoad) setLoading(false)
      }
    }
    void loadDashboard(true)
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void loadDashboard() }
    const refreshOnFocus = () => { void loadDashboard() }
    const refreshInterval = window.setInterval(() => { if (document.visibilityState === 'visible') void loadDashboard() }, 5_000)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('focus', refreshOnFocus)
    return () => {
      mounted = false
      window.clearInterval(refreshInterval)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('focus', refreshOnFocus)
    }
  }, [])
  useEffect(() => {
    let mounted = true
    void fetchDailyDriverStats(selectedDate)
      .then((stats) => { if (mounted) setDailyDriverStats(stats) })
      .catch(() => { if (mounted) setDailyDriverStats([]) })
    return () => { mounted = false }
  }, [selectedDate])
  function showDriverPackages(driver: Driver) { setSelectedDriver(driver); setActivePage('driver-details') }
  const packagesForSelectedDate = useMemo(() => packages.filter((item) =>
    item.createdAt?.slice(0, 10) === selectedDate
    || item.updatedAt?.slice(0, 10) === selectedDate
    || item.nextDeliveryDate === selectedDate
    || item.nextConfirmationAt?.slice(0, 10) === selectedDate
    || item.returnedToCompanyAt?.slice(0, 10) === selectedDate
    || item.returnedToDepotAt?.slice(0, 10) === selectedDate,
  ), [packages, selectedDate])
  const packagesForAdminSelectedDate = useMemo(() => packages.filter((item) =>
    item.createdAt?.slice(0, 10) === selectedDate
    || item.nextDeliveryDate === selectedDate
    || item.nextConfirmationAt?.slice(0, 10) === selectedDate
    || item.reportScheduledFor === selectedDate
    || item.reportedAt?.slice(0, 10) === selectedDate
    || item.deliveryStartedAt?.slice(0, 10) === selectedDate,
  ).map((item) => {
    const reportWasCreatedToday = item.reportedAt?.slice(0, 10) === selectedDate
    const reportIsScheduledLater = Boolean(item.reportScheduledFor && item.reportScheduledFor > selectedDate)
    return reportWasCreatedToday && reportIsScheduledLater ? { ...item, status: 'REPORTE' as DeliveryPackage['status'] } : item
  }), [packages, selectedDate])
  const driversForSelectedDate = useMemo(() => {
    const dailyStatsByDriverId = new Map(dailyDriverStats.map((stat) => [stat.driverId, stat]))
    return drivers.map((driver) => {
    const driverPackages = packagesForSelectedDate.filter((item) => item.driverId === driver.id
      || (item.lastDriverId === driver.id && item.returnedToDepotAt?.slice(0, 10) === selectedDate))
    const assignedPackages = packages.filter((item) => item.driverId === driver.id && item.deliveryStartedAt?.slice(0, 10) === selectedDate)
    const returnedPackages = driverPackages.filter((item) => item.lastDriverId === driver.id
      && item.returnedToDepotAt?.slice(0, 10) === selectedDate)
    const dailyDriver = dailyStatsByDriverId.get(driver.id)
    return { ...driver, assigned: assignedPackages.length, confirmed: packagesForSelectedDate.filter((item) => item.confirmedAt?.slice(0, 10) === selectedDate && item.confirmedByDriverId === driver.id).length, inProgress: assignedPackages.filter((item) => item.status === 'EN LIVRAISON').length, delivered: dailyDriver?.delivered ?? 0, undelivered: assignedPackages.filter((item) => item.status === 'EN AGENCE' && item.returnedToDepotAt != null).length, returns: returnedPackages.length, earned: Number(dailyDriver?.deliveredAmount ?? 0) }
    })
  }, [dailyDriverStats, drivers, packages, packagesForSelectedDate, selectedDate])
  const pageContent = activePage === 'dashboard' ? <Dashboard packages={packages} drivers={drivers} selectedDate={selectedDate} onNavigate={setActivePage} onImported={refresh} /> : activePage === 'packages' ? <PackagesPage packages={packagesForAdminSelectedDate} allPackages={packages} onImported={refresh} /> : activePage === 'reception' ? <ReceptionPage packages={packagesForSelectedDate} onRefresh={refresh} /> : activePage === 'scanner' ? <ScannerPage packages={packagesForAdminSelectedDate} drivers={driversForSelectedDate} onRefresh={refresh} /> : activePage === 'drivers' ? <DriversPage drivers={driversForSelectedDate} packages={packagesForSelectedDate} onRefresh={refresh} onViewPackages={showDriverPackages} /> : activePage === 'driver-details' && selectedDriver ? <DriverPackagesPage driver={selectedDriver} selectedDate={selectedDate} onBack={() => setActivePage('drivers')} /> : <ReturnsPage packages={packages} onRefresh={refresh} />
  const returnsCount = packages.filter((item) => item.status === 'RETOUR').length
  return <div className="app-shell"><Sidebar activePage={activePage} onNavigate={setActivePage} returnsCount={returnsCount} /><main className="main"><Topbar title={pageTitles[activePage]} selectedDate={selectedDate} maxDate={currentDate} onDateChange={setSelectedDate} onLogout={onLogout} /><div className="content">{loading ? <div className="loading-state">Chargement des donnees...</div> : error ? <div className="error-state">{error}<button className="secondary-button" onClick={() => window.location.reload()}>Reessayer</button></div> : pageContent}</div></main></div>
}

function App() {
  const [auth, setAuth] = useState<AuthUser | null>(() => getAuth())
  function logout() { clearAuth(); setAuth(null) }
  if (!auth) return <LoginPage onLogin={() => setAuth(getAuth())} />
  if (auth.role === 'DRIVER') return <DriverPage onLogout={logout} driverName={auth.name} />
  return <AdminApp onLogout={logout} />
}

export default App
