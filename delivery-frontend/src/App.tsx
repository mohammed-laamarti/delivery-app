import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { assignPackage, confirmDriverDeparture, createDriver, createPackage, decideDepotStatus, deleteDriver, fetchDashboardData, fetchDailyDashboardStats, fetchDailyDriverStats, fetchDriver, registerAgencyArrival, registerDepotArrival, shipReturns, updateDriver, type DailyDashboardStats, type DailyDriverStats } from './api/client'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { StatCard } from './components/StatCard'
import { PackageTable } from './components/PackageTable'
import { ExcelImportButton } from './components/ExcelImportButton'
import { LoginPage } from './components/LoginPage'
import { DriverPage } from './components/DriverPage'
import { BarcodeScanner } from './components/BarcodeScanner'
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
  const textMatches = `${item.trackingCode} ${item.recipient} ${item.city} ${item.phone ?? ''}`.toLowerCase().includes(normalizedQuery)
  const phoneQuery = normalizedQuery.replace(/\D/g, '')
  return textMatches || (phoneQuery.length > 0 && (item.phone ?? '').replace(/\D/g, '').includes(phoneQuery))
}

function Dashboard({ packages, drivers, selectedDate, onNavigate, onImported }: { packages: DeliveryPackage[]; drivers: Driver[]; selectedDate: string; onNavigate: (page: Page) => void; onImported: Refresh }) {
  const [stats, setStats] = useState<DailyDashboardStats | null>(null)
  const [driverStats, setDriverStats] = useState<DailyDriverStats[]>([])
  const [statsError, setStatsError] = useState('')
  const [statsRefreshKey, setStatsRefreshKey] = useState(0)

  useEffect(() => {
    let mounted = true
    setStatsError('')
    void Promise.all([fetchDailyDashboardStats(selectedDate), fetchDailyDriverStats(selectedDate)])
      .then(([dailyStats, dailyDriverStats]) => { if (mounted) { setStats(dailyStats); setDriverStats(dailyDriverStats) } })
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
    || item.reportedAt?.slice(0, 10) === selectedDate,
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
    return { ...driver, assigned: dailyDriver?.processed ?? 0, delivered: dailyDriver?.delivered ?? 0, earned: Number(dailyDriver?.deliveredAmount ?? 0) }
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
  const [message, setMessage] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ trackingCode: '', recipient: '', phone: '', city: '', address: '', price: '', importComment: '' })
  const searchablePackages = query.trim() ? allPackages : packages
  const filtered = useMemo(() => searchablePackages.filter((item) => matchesPackageSearch(item, query) && (status === 'Tous les statuts' || item.status === status)), [searchablePackages, query, status])
  const pagedPackages = pageItems(filtered, page, TABLE_PAGE_SIZE)
  function updateForm(field: keyof typeof form, value: string) { setForm((current) => ({ ...current, [field]: value })) }
  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await createPackage({ ...form, price: Number(form.price) })
      await onImported()
      setForm({ trackingCode: '', recipient: '', phone: '', city: '', address: '', price: '', importComment: '' })
      setFormOpen(false)
      setPage(1)
    setMessage('Colis ajoute avec succes.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Creation impossible')
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
  return <><div className="page-intro"><div><h2>Tous les colis</h2><p>Suivez chaque colis de la base de donnees.</p></div><div className="package-page-actions"><button className="primary-button" onClick={() => { setFormOpen((current) => !current); setMessage('') }}>{formOpen ? 'Fermer le formulaire' : 'Ajouter manuellement'}</button><ExcelImportButton onImported={onImported} /></div></div>{formOpen && <form className="panel package-form" onSubmit={handleCreate}><h3>Nouveau colis</h3><div className="package-form-grid"><label><span>Code de suivi</span><input required placeholder="Ex. DH22BAAC" value={form.trackingCode} onChange={(event) => updateForm('trackingCode', event.target.value)} /></label><label><span>Destinataire</span><input required placeholder="Nom complet" value={form.recipient} onChange={(event) => updateForm('recipient', event.target.value)} /></label><label><span>Téléphone</span><input required type="tel" placeholder="06..." value={form.phone} onChange={(event) => updateForm('phone', event.target.value)} /></label><label><span>Ville</span><input required placeholder="Ville" value={form.city} onChange={(event) => updateForm('city', event.target.value)} /></label><label><span>Adresse</span><input required placeholder="Adresse de livraison" value={form.address} onChange={(event) => updateForm('address', event.target.value)} /></label><label><span>Montant (DH)</span><input required min="0" step="0.01" type="number" placeholder="0.00" value={form.price} onChange={(event) => updateForm('price', event.target.value)} /></label><label className="package-form-comment"><span>Commentaire (optionnel)</span><input placeholder="Informations complémentaires" value={form.importComment} onChange={(event) => updateForm('importComment', event.target.value)} /></label></div><div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? 'Enregistrement...' : 'Créer le colis'}</button><button type="button" className="secondary-button" disabled={saving} onClick={() => setFormOpen(false)}>Annuler</button></div></form>}<div className="filter-bar"><input className="filter-input" placeholder="Code, nom ou téléphone" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /><select className="filter-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1) }}><option>Tous les statuts</option><option>A CONFIRMER</option><option>A RECEPTIONNER</option><option>EN AGENCE</option><option>A LIVRER</option><option>AFFECTE</option><option>EN LIVRAISON</option><option>AU DEPOT</option><option>REPORTE</option><option>LIVRE</option><option>RETOUR</option><option>RETOUR ENVOYE</option><option>ANNULE</option></select><button className="secondary-button" onClick={() => setCameraOpen(true)}>Scanner camera</button></div>{message && <p className="driver-message">{message}</p>}<section className="panel"><PackageTable packages={pagedPackages} /><Pagination currentPage={page} totalItems={filtered.length} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} /></section>{cameraOpen && <BarcodeScanner onDetected={handleCameraCode} onClose={() => setCameraOpen(false)} />}</>
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
  const [saving, setSaving] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [message, setMessage] = useState('')
  const selectedDriver = drivers.find((driver) => driver.id === Number(driverId))
  const prepared = packages.filter((item) => item.status === 'AFFECTE' && item.driverId === Number(driverId))
  const candidates = packages.filter((item) => (item.status === 'EN AGENCE' || item.status === 'A LIVRER') && !!item.confirmationComment)
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
          <div className="scanner-mark">SCAN</div>
          <p className="scanner-step">ETAPE 2</p>
          <h3>{selectedDriver ? `Scanner pour ${selectedDriver.name}` : 'Choisissez un livreur'}</h3>
          <p>{selectedDriver ? `${prepared.length} colis affecté(s). Scannez les colis confirmés en agence pour les ajouter.` : 'Sélectionnez d abord le livreur qui prend les colis.'}</p>
          <button className="primary-button" disabled={!selectedDriver} onClick={() => setCameraOpen(true)}>Ouvrir la camera</button>
          <label className="manual-scan-label">Ou sélectionner manuellement<select className="filter-select scanner-select" disabled={!selectedDriver || saving} value="" onChange={(event) => { if (event.target.value) void handleCameraCode(candidates.find((item) => item.id === Number(event.target.value))?.trackingCode ?? '') }}><option value="">Choisir un colis en agence ou en stock</option>{candidates.map((item) => <option value={item.id} key={item.id}>{item.trackingCode} - {item.recipient}</option>)}</select></label>
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

function DriverMetrics({ driver }: { driver: Driver }) { return <div className="driver-metrics"><div><strong>{driver.assigned}</strong><span>Total affectes</span></div><div><strong>{driver.inProgress}</strong><span>En cours</span></div><div><strong>{driver.delivered}</strong><span>Livres</span></div><div><strong>{driver.returns}</strong><span>Retours</span></div></div> }

function DriversPage({ drivers, onRefresh, onViewPackages }: { drivers: Driver[]; onRefresh: Refresh; onViewPackages: (driver: Driver) => void }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(1)
  const pagedDrivers = pageItems(drivers, page, DRIVER_PAGE_SIZE)

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
    if (!window.confirm(`Supprimer ${driver.name} ?`)) return
    try { await deleteDriver(driver.id); await onRefresh(); setPage(1); setMessage('Livreur supprime avec succes.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Suppression impossible') }
  }
  return <><div className="page-intro"><div><h2>Livreurs</h2><p>Suivez la charge et la performance de votre équipe.</p></div><button className="primary-button" onClick={startCreate}>Ajouter un livreur</button></div>{open && <form className="panel driver-form" onSubmit={handleSubmit}><h3>{editing ? 'Modifier le livreur' : 'Nouveau livreur'}</h3><div className="form-grid"><label><span>Nom complet</span><input required placeholder="Nom complet" value={name} onChange={(event) => setName(event.target.value)} /></label><label><span>Téléphone</span><input required type="tel" placeholder="Téléphone" value={phone} onChange={(event) => setPhone(event.target.value)} /></label><label><span>{editing ? 'Nouveau mot de passe' : 'Mot de passe'}</span><input required={!editing} minLength={6} type="password" autoComplete={editing ? 'new-password' : 'current-password'} placeholder={editing ? 'Laisser vide pour conserver' : 'Mot de passe'} value={password} onChange={(event) => setPassword(event.target.value)} /></label><div className="form-actions"><button className="primary-button" disabled={saving}>{saving ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Créer le compte'}</button><button type="button" className="secondary-button" disabled={saving} onClick={cancelForm}>Annuler</button></div></div></form>}{message && <p className="form-message">{message}</p>}<section className="assignment-grid">{pagedDrivers.map((driver) => <article className="driver-card" key={driver.id}><div className="driver-card-head"><div className="driver-avatar">{driver.initials}</div><div><h3>{driver.name}</h3><p><span className={`status ${driver.active ? 'livre' : 'retour'}`}>{driver.active ? 'Actif' : 'Inactif'}</span></p></div></div><DriverMetrics driver={driver} /><div className="card-actions"><button type="button" className="secondary-button" onClick={() => onViewPackages(driver)}>Voir les colis</button><button type="button" className="secondary-button" onClick={() => void startEdit(driver)}>Modifier</button><button type="button" className="danger-button" onClick={() => handleDelete(driver)}>Supprimer</button></div></article>)}{drivers.length === 0 && <div className="panel empty-state">Aucun livreur. Ajoutez le premier livreur.</div>}</section><Pagination currentPage={page} totalItems={drivers.length} pageSize={DRIVER_PAGE_SIZE} onPageChange={setPage} /></>
}

function DriverPackagesPage({ driver, packages, selectedDate, onBack }: { driver: Driver; packages: DeliveryPackage[]; selectedDate: string; onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'TOUS' | DeliveryPackage['status']>('TOUS')
  const [page, setPage] = useState(1)
  const [cameraOpen, setCameraOpen] = useState(false)
  const driverPackages = packages.filter((item) => item.driverId === driver.id
    || (item.lastDriverId === driver.id && item.returnedToDepotAt?.slice(0, 10) === selectedDate))
  const filteredPackages = driverPackages.filter((item) => {
    const matchesQuery = matchesPackageSearch(item, query)
    return matchesQuery && (status === 'TOUS' || item.status === status)
  })
  const pagedPackages = pageItems(filteredPackages, page, TABLE_PAGE_SIZE)
  return <><div className="page-intro"><div><button className="text-button" onClick={onBack}>← Retour aux livreurs</button><h2>{driver.name}</h2><p>{driver.phone} · Suivi des colis affectes au livreur.</p></div></div><section className="panel driver-detail-summary"><DriverMetrics driver={driver} /></section><div className="filter-bar"><input className="filter-input" placeholder="Code, nom ou téléphone" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} /><button className="secondary-button" type="button" onClick={() => setCameraOpen(true)}>Scanner</button><select className="filter-select" value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1) }}><option value="TOUS">Tous les statuts</option><option value="A CONFIRMER">A confirmer</option><option value="A RECEPTIONNER">A receptionner</option><option value="EN AGENCE">En agence</option><option value="A LIVRER">A livrer</option><option value="AFFECTE">Affectes</option><option value="EN LIVRAISON">En cours</option><option value="AU DEPOT">Au depot</option><option value="REPORTE">Reportes</option><option value="LIVRE">Livres</option><option value="RETOUR">Retour</option><option value="RETOUR ENVOYE">Retour envoye</option><option value="ANNULE">Annule</option></select></div><section className="panel table-panel"><div className="panel-heading"><h3>Colis de {driver.name}</h3><span className="status a-livrer">{filteredPackages.length} colis</span></div><PackageTable packages={pagedPackages} /><Pagination currentPage={page} totalItems={filteredPackages.length} pageSize={TABLE_PAGE_SIZE} onPageChange={setPage} /></section>{cameraOpen && <BarcodeScanner onDetected={(trackingCode) => { setCameraOpen(false); setQuery(trackingCode); setPage(1) }} onClose={() => setCameraOpen(false)} />}</>
}
function ReturnsPage({ packages, onRefresh }: { packages: DeliveryPackage[]; onRefresh: Refresh }) {
  const [scanned, setScanned] = useState<DeliveryPackage | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [shipmentCameraOpen, setShipmentCameraOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [nextReturnDeliveryDate, setNextReturnDeliveryDate] = useState('')
  const [returnPostponeModalOpen, setReturnPostponeModalOpen] = useState(false)
  const [shipmentPackageIds, setShipmentPackageIds] = useState<number[]>([])
  const [shipmentReference, setShipmentReference] = useState('')
  const [page, setPage] = useState(1)
  const returnCandidates = packages.filter((item) => item.driver && item.status === 'EN LIVRAISON')
  const pendingDecisions = packages.filter((item) => item.status === 'AU DEPOT')
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
      setScanned({ ...scanned, status: 'AU DEPOT', driver: null })
      setMessage(`Colis ${scanned.trackingCode} réceptionné au dépôt. Choisissez la décision.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La reception au depot n'a pas pu etre enregistree.")
    } finally {
      setSaving(false)
    }
  }

  async function decideReturn(status: 'REPORTE' | 'RETOUR' | 'RETOUR DEFINITIF') {
    if (!scanned || saving || scanned.status !== 'AU DEPOT') return
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
        : `Nouvelle livraison de ${scanned.trackingCode} programmée.`)
      setScanned(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "La decision du depot n'a pas pu etre enregistree.")
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
    <div className="scanner-page-heading"><div><p className="eyebrow">FIN DE TOURNEE</p><h2>Scanner les retours</h2><p>Scannez chaque colis non livré avant de le reprendre au livreur.</p></div><span className="status retour">{returnCandidates.length} a recevoir</span></div>
    {message && <p className="driver-message">{message}</p>}
    {pendingDecisions.length > 0 && <section className="panel pending-returns-panel"><div className="panel-heading"><h3>Décisions retour en attente</h3><span className="status retour">{pendingDecisions.length} à décider</span></div><div className="pending-returns-list">{pendingDecisions.map((item) => <button className="pending-return-item" key={item.id} onClick={() => { setScanned(item); setNextReturnDeliveryDate(''); setMessage(`Colis ${item.trackingCode} sélectionné. Choisissez une décision.`) }}><span><strong className="tracking">{item.trackingCode}</strong><small>{item.recipient} · {item.city}</small></span><span>Décider</span></button>)}</div></section>}
    <div className="scanner-layout scanner-workspace return-workspace">
      <section className="panel scanner-box"><div className="scanner-box-content"><div className="scanner-mark">RETOUR</div><p className="scanner-step">RECEPTION</p><h3>Scanner un colis retourné</h3><p>Réceptionnez le colis, puis décidez s'il doit être relivré ou retourné.</p><button className="primary-button" disabled={returnCandidates.length === 0} onClick={() => setCameraOpen(true)}>Ouvrir la camera</button><label className="manual-scan-label">Ou sélectionner manuellement<select className="filter-select scanner-select" disabled={returnCandidates.length === 0} value={scanned?.id ?? ''} onChange={(event) => setScanned(returnCandidates.find((item) => item.id === Number(event.target.value)) ?? null)}><option value="">Choisir un colis</option>{returnCandidates.map((item) => <option value={item.id} key={item.id}>{item.trackingCode} - {item.driver}</option>)}</select></label></div></section>
      <section className="panel scan-result"><div className="scan-result-heading"><div><p className="eyebrow">VERIFICATION</p><h3>{scanned?.status === 'AU DEPOT' ? 'Decision administrateur' : 'Colis retourné'}</h3></div>{scanned && <span className={`status ${scanned.status.toLowerCase().replaceAll(' ', '-')}`}>{scanned.status}</span>}</div>{scanned ? <><div className="scan-code">{scanned.trackingCode}</div><div className="detail-row"><span>Destinataire</span><strong>{scanned.recipient}</strong></div><div className="detail-row"><span>Livreur actuel</span><strong>{scanned.driver ?? 'Aucun (au depot)'}</strong></div><div className="detail-row"><span>Adresse</span><strong>{scanned.address}, {scanned.city}</strong></div>{scanned.status !== 'AU DEPOT' ? <button className="primary-button return-confirm-button" disabled={saving} onClick={() => void receiveAtDepot()}>{saving ? 'Enregistrement...' : 'Confirmer la reception au depot'}</button> : <div className="outcome-actions"><button className="secondary-button" disabled={saving} onClick={() => setReturnPostponeModalOpen(true)}>Reporter</button><button className="danger-button" disabled={saving} onClick={() => void decideReturn('RETOUR DEFINITIF')}>Retour definitif</button></div>}</> : <div className="scan-empty"><div>RETOUR</div><strong>En attente de retour</strong><p>Scannez un colis remis par un livreur.</p></div>}</section>
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
  const refresh: Refresh = useCallback(async () => { const data = await fetchDashboardData(); setPackages(data.packages); setDrivers(data.drivers) }, [])
  useEffect(() => {
    let mounted = true
    fetchDashboardData().then((data) => { if (mounted) { setPackages(data.packages); setDrivers(data.drivers) } }).catch(() => { if (mounted) setError('Le backend est indisponible. Lance Spring Boot sur le port 8080.') }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])
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
    || item.reportedAt?.slice(0, 10) === selectedDate,
  ).map((item) => {
    const reportWasCreatedToday = item.reportedAt?.slice(0, 10) === selectedDate
    const reportIsScheduledLater = Boolean(item.reportScheduledFor && item.reportScheduledFor > selectedDate)
    return reportWasCreatedToday && reportIsScheduledLater ? { ...item, status: 'REPORTE' as DeliveryPackage['status'] } : item
  }), [packages, selectedDate])
  const driversForSelectedDate = useMemo(() => drivers.map((driver) => {
    const driverPackages = packagesForSelectedDate.filter((item) => item.driverId === driver.id
      || (item.lastDriverId === driver.id && item.returnedToDepotAt?.slice(0, 10) === selectedDate))
    const assignedPackages = driverPackages.filter((item) => item.driverId === driver.id)
    const returnedPackages = driverPackages.filter((item) => item.lastDriverId === driver.id
      && item.returnedToDepotAt?.slice(0, 10) === selectedDate)
    return { ...driver, assigned: driverPackages.length, inProgress: assignedPackages.filter((item) => item.status === 'EN LIVRAISON').length, delivered: assignedPackages.filter((item) => item.status === 'LIVRE').length, undelivered: assignedPackages.filter((item) => item.status === 'AU DEPOT').length, returns: returnedPackages.length, earned: assignedPackages.filter((item) => item.status === 'LIVRE').reduce((total, item) => total + Number(item.price ?? 0), 0) }
  }), [drivers, packagesForSelectedDate])
  const pageContent = activePage === 'dashboard' ? <Dashboard packages={packages} drivers={drivers} selectedDate={selectedDate} onNavigate={setActivePage} onImported={refresh} /> : activePage === 'packages' ? <PackagesPage packages={packagesForAdminSelectedDate} allPackages={packages} onImported={refresh} /> : activePage === 'reception' ? <ReceptionPage packages={packagesForSelectedDate} onRefresh={refresh} /> : activePage === 'scanner' ? <ScannerPage packages={packagesForSelectedDate} drivers={driversForSelectedDate} onRefresh={refresh} /> : activePage === 'drivers' ? <DriversPage drivers={driversForSelectedDate} onRefresh={refresh} onViewPackages={showDriverPackages} /> : activePage === 'driver-details' && selectedDriver ? <DriverPackagesPage driver={selectedDriver} packages={packagesForSelectedDate} selectedDate={selectedDate} onBack={() => setActivePage('drivers')} /> : <ReturnsPage packages={packages} onRefresh={refresh} />
  const returnsCount = packages.filter((item) => item.status === 'RETOUR').length
  const pendingReturnCount = packages.filter((item) => item.status === 'AU DEPOT').length
  return <div className="app-shell"><Sidebar activePage={activePage} onNavigate={setActivePage} returnsCount={returnsCount} /><main className="main"><Topbar title={pageTitles[activePage]} selectedDate={selectedDate} maxDate={currentDate} onDateChange={setSelectedDate} onLogout={onLogout} /><div className="content">{pendingReturnCount > 0 && <button className="pending-returns-banner" onClick={() => setActivePage('returns')}><strong>{pendingReturnCount} décision{pendingReturnCount > 1 ? 's' : ''} retour en attente</strong><span>Ouvrir les colis au dépôt →</span></button>}{loading ? <div className="loading-state">Chargement des donnees...</div> : error ? <div className="error-state">{error}<button className="secondary-button" onClick={() => window.location.reload()}>Reessayer</button></div> : pageContent}</div></main></div>
}

function App() {
  const [auth, setAuth] = useState<AuthUser | null>(() => getAuth())
  function logout() { clearAuth(); setAuth(null) }
  if (!auth) return <LoginPage onLogin={() => setAuth(getAuth())} />
  if (auth.role === 'DRIVER') return <DriverPage onLogout={logout} driverName={auth.name} />
  return <AdminApp onLogout={logout} />
}

export default App
