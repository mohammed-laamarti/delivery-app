import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { assignPackage, createDriver, deleteDriver, fetchDashboardData, registerPackageReturn, updateDriver, updatePackageStatus } from './api/client'
import { Sidebar } from './components/Sidebar'
import { Topbar } from './components/Topbar'
import { StatCard } from './components/StatCard'
import { PackageTable } from './components/PackageTable'
import { ExcelImportButton } from './components/ExcelImportButton'
import { LoginPage } from './components/LoginPage'
import { DriverPage } from './components/DriverPage'
import { BarcodeScanner } from './components/BarcodeScanner'
import { clearAuth, getAuth, type AuthUser } from './auth'
import type { DeliveryPackage, Driver, Page, PackageStatus } from './types'

const pageTitles: Record<Page, string> = { dashboard: 'Vue generale', packages: 'Packages', assignment: 'Affectation', scanner: 'Scanner sortie', drivers: 'Livreurs', returns: 'Retours' }
type Refresh = () => Promise<void>

function Dashboard({ packages, drivers, onNavigate, onImported }: { packages: DeliveryPackage[]; drivers: Driver[]; onNavigate: (page: Page) => void; onImported: Refresh }) {
  const count = (status: PackageStatus) => packages.filter((item) => item.status === status).length
  return <>
    <div className="page-intro"><div><h2>Bonjour, Admin</h2><p>Voici l activite de livraison pour aujourd hui.</p></div><ExcelImportButton onImported={onImported} /></div>
    <section className="stats-grid"><StatCard label="Total packages" value={String(packages.length)} detail="Depuis la base de donnees" tone="blue" /><StatCard label="A affecter" value={String(count('A LIVRER'))} detail="A traiter aujourd hui" tone="orange" /><StatCard label="Livres" value={String(count('LIVRE'))} detail="Statut actuel" tone="green" /><StatCard label="Retours" value={String(count('RETOUR'))} detail="A verifier" tone="red" /></section>
    <div className="grid-2"><section className="panel"><div className="panel-heading"><h3>Suivi des packages</h3><button className="text-button" onClick={() => onNavigate('packages')}>Voir le detail</button></div><div className="panel-body"><Progress label="A livrer" value={count('A LIVRER')} total={packages.length} tone="blue" /><Progress label="En livraison" value={count('EN LIVRAISON')} total={packages.length} tone="orange" /><Progress label="Livres" value={count('LIVRE')} total={packages.length} tone="green" /><Progress label="Retours" value={count('RETOUR')} total={packages.length} tone="red" /></div></section><section className="panel"><div className="panel-heading"><h3>Activite des livreurs</h3><button className="text-button" onClick={() => onNavigate('drivers')}>Voir tout</button></div><div className="panel-body"><div className="driver-list">{drivers.map((driver) => <DriverRow driver={driver} key={driver.id} />)}</div></div></section></div>
    <section className="panel table-panel"><div className="panel-heading"><h3>Derniers packages</h3><button className="text-button" onClick={() => onNavigate('packages')}>Voir tous</button></div><PackageTable packages={packages} compact /></section>
  </>
}

function Progress({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const percent = total ? Math.round((value / total) * 100) : 0
  return <div className="progress-row"><div className="progress-label"><span>{label}</span><span>{value} packages</span></div><div className="progress-track"><div className={`progress-bar ${tone}-bar`} style={{ width: `${percent}%` }} /></div></div>
}

function DriverRow({ driver }: { driver: Driver }) { return <div className="driver-row"><div className="driver-avatar">{driver.initials}</div><div className="driver-info"><strong>{driver.name}</strong><span>{driver.delivered} livres aujourd hui</span></div><div className="driver-total">{driver.assigned}<small>assignes</small></div></div> }

function PackagesPage({ packages, onImported }: { packages: DeliveryPackage[]; onImported: Refresh }) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Tous les statuts')
  const [cameraOpen, setCameraOpen] = useState(false)
  const [message, setMessage] = useState('')
  const filtered = useMemo(() => packages.filter((item) => `${item.trackingCode} ${item.recipient}`.toLowerCase().includes(query.toLowerCase()) && (status === 'Tous les statuts' || item.status === status)), [packages, query, status])
  function handleCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const item = packages.find((current) => current.trackingCode.toLowerCase() === trackingCode.toLowerCase())
    if (!item) {
      setMessage(`Aucun package ne correspond au code ${trackingCode}.`)
      return
    }
    setQuery(item.trackingCode)
    setStatus('Tous les statuts')
    setMessage(`Package ${item.trackingCode} trouve: ${item.recipient}.`)
  }
  return <><div className="page-intro"><div><h2>Tous les packages</h2><p>Suivez chaque package de la base de donnees.</p></div><ExcelImportButton onImported={onImported} /></div><div className="filter-bar"><input className="filter-input" placeholder="Rechercher par code ou nom" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="filter-select" value={status} onChange={(event) => setStatus(event.target.value)}><option>Tous les statuts</option><option>A LIVRER</option><option>AFFECTE</option><option>EN LIVRAISON</option><option>LIVRE</option><option>RETOUR</option></select><button className="secondary-button" onClick={() => setCameraOpen(true)}>Scanner camera</button></div>{message && <p className="driver-message">{message}</p>}<section className="panel"><PackageTable packages={filtered} /></section>{cameraOpen && <BarcodeScanner onDetected={handleCameraCode} onClose={() => setCameraOpen(false)} />}</>
}

function AssignmentPage({ packages, drivers, onRefresh }: { packages: DeliveryPackage[]; drivers: Driver[]; onRefresh: Refresh }) {
  const [selectedDriver, setSelectedDriver] = useState<Record<number, string>>({})
  const [savingId, setSavingId] = useState<number | null>(null)
  const waiting = packages.filter((item) => item.status === 'A LIVRER')
  async function handleAssign(item: DeliveryPackage) {
    const driverId = Number(selectedDriver[item.id])
    if (!driverId) return
    setSavingId(item.id)
    try { await assignPackage(item.id, driverId); await onRefresh() } finally { setSavingId(null) }
  }
  return <><div className="page-intro"><div><h2>Affectation des packages</h2><p>Choisissez un livreur puis affectez chaque package.</p></div></div><section className="assignment-grid">{drivers.map((driver) => <article className="driver-card" key={driver.id}><div className="driver-card-head"><div className="driver-avatar">{driver.initials}</div><div><h3>{driver.name}</h3><p>Disponible pour les livraisons</p></div></div><div className="driver-metrics"><div><strong>{driver.assigned}</strong><span>Assignes</span></div><div><strong>{driver.delivered}</strong><span>Livres</span></div><div><strong>{driver.returns}</strong><span>Retours</span></div></div></article>)}</section><section className="panel table-panel"><div className="panel-heading"><h3>Packages a affecter</h3><span className="status a-livrer">{waiting.length} en attente</span></div><div className="assignment-list">{waiting.map((item) => <div className="assignment-line" key={item.id}><div><strong className="tracking">{item.trackingCode}</strong><span>{item.recipient} - {item.city}</span></div><select className="filter-select" value={selectedDriver[item.id] ?? ''} onChange={(event) => setSelectedDriver((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choisir un livreur</option>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</select><button className="primary-button" disabled={!selectedDriver[item.id] || savingId === item.id} onClick={() => handleAssign(item)}>{savingId === item.id ? 'Enregistrement...' : 'Affecter'}</button></div>)}{waiting.length === 0 && <div className="empty-state">Aucun package en attente.</div>}</div></section></>
}

function ScannerPage({ packages, drivers, onRefresh }: { packages: DeliveryPackage[]; drivers: Driver[]; onRefresh: Refresh }) {
  const [scanned, setScanned] = useState<DeliveryPackage | null>(null)
  const [driverId, setDriverId] = useState('')
  const [saving, setSaving] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [message, setMessage] = useState('')
  const selectedDriver = drivers.find((driver) => driver.id === Number(driverId))
  const candidates = packages.filter((item) => item.status === 'AFFECTE' && item.driverId === Number(driverId))
  async function confirmExit() {
    if (!scanned) return
    setSaving(true)
    try { await updatePackageStatus(scanned.id, 'EN LIVRAISON'); await onRefresh(); setScanned(null) } finally { setSaving(false) }
  }
  function handleCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const item = candidates.find((current) => current.trackingCode.toLowerCase() === trackingCode.toLowerCase())
    if (!item) {
      setMessage(`Le code ${trackingCode} ne correspond a aucun package affecte.`)
      return
    }
    setScanned(item)
    setMessage(`Package ${item.trackingCode} detecte.`)
  }
  function changeDriver(value: string) {
    setDriverId(value)
    setScanned(null)
    setMessage('')
  }
  return <>
    <div className="scanner-page-heading">
      <div><p className="eyebrow">SORTIE DE TOURNEE</p><h2>Scanner avant sortie</h2><p>Controlez les packages remis au livreur avant son depart.</p></div>
      <label className="scanner-driver-picker"><span>1</span><select value={driverId} onChange={(event) => changeDriver(event.target.value)}><option value="">Choisir un livreur</option>{drivers.map((driver) => <option value={driver.id} key={driver.id}>{driver.name}</option>)}</select></label>
    </div>
    {message && <p className="driver-message">{message}</p>}
    <div className="scanner-layout scanner-workspace">
      <section className="panel scanner-box">
        <div className="scanner-box-content">
          <div className="scanner-mark">SCAN</div>
          <p className="scanner-step">ETAPE 2</p>
          <h3>{selectedDriver ? `Scanner pour ${selectedDriver.name}` : 'Choisissez un livreur'}</h3>
          <p>{selectedDriver ? `${candidates.length} package(s) affecte(s) en attente de sortie.` : 'Selectionnez d abord le livreur qui prend les packages.'}</p>
          <button className="primary-button" disabled={!selectedDriver} onClick={() => setCameraOpen(true)}>Ouvrir la camera</button>
          <label className="manual-scan-label">Ou selectionner manuellement<select className="filter-select scanner-select" disabled={!selectedDriver} value={scanned?.id ?? ''} onChange={(event) => setScanned(candidates.find((item) => item.id === Number(event.target.value)) ?? null)}><option value="">Choisir un package</option>{candidates.map((item) => <option value={item.id} key={item.id}>{item.trackingCode} - {item.recipient}</option>)}</select></label>
        </div>
      </section>
      <section className="panel scan-result">
        <div className="scan-result-heading"><div><p className="eyebrow">ETAPE 3</p><h3>Verification du package</h3></div>{scanned && <span className="status affecte">PRET</span>}</div>
        {scanned ? <><div className="scan-code">{scanned.trackingCode}</div><div className="detail-row"><span>Destinataire</span><strong>{scanned.recipient}</strong></div><div className="detail-row"><span>Adresse</span><strong>{scanned.address}, {scanned.city}</strong></div><div className="detail-row"><span>Montant</span><strong>{scanned.price} DH</strong></div><div className="detail-row"><span>Livreur</span><strong>{selectedDriver?.name}</strong></div><button className="primary-button scan-confirm-button" disabled={saving} onClick={confirmExit}>{saving ? 'Enregistrement...' : 'Confirmer la sortie'}</button></> : <div className="scan-empty"><div>CODE</div><strong>En attente de scan</strong><p>Le package detecte apparaitra ici pour verification.</p></div>}
      </section>
    </div>
    {cameraOpen && <BarcodeScanner onDetected={handleCameraCode} onClose={() => setCameraOpen(false)} />}
  </>
}

function DriversPage({ drivers, onRefresh }: { drivers: Driver[]; onRefresh: Refresh }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Driver | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  function startCreate() { setEditing(null); setName(''); setPhone(''); setPassword(''); setMessage(''); setOpen(true) }
  function startEdit(driver: Driver) { setEditing(driver); setName(driver.name); setPhone(''); setPassword(''); setMessage(''); setOpen(true) }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      if (editing) await updateDriver(editing.id, name, phone, password, editing.active)
      else await createDriver(name, phone, password)
      await onRefresh(); setOpen(false); setEditing(null); setMessage(editing ? 'Livreur modifie avec succes.' : 'Livreur ajoute avec succes.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Operation impossible') } finally { setSaving(false) }
  }
  async function handleDelete(driver: Driver) {
    if (!window.confirm(`Supprimer ${driver.name} ?`)) return
    try { await deleteDriver(driver.id); await onRefresh(); setMessage('Livreur supprime avec succes.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Suppression impossible') }
  }
  return <><div className="page-intro"><div><h2>Livreurs</h2><p>Suivez la charge et la performance de votre equipe.</p></div><button className="primary-button" onClick={startCreate}>Ajouter un livreur</button></div>{open && <form className="panel driver-form" onSubmit={handleSubmit}><h3>{editing ? 'Modifier le livreur' : 'Nouveau livreur'}</h3><div className="form-grid"><input required placeholder="Nom complet" value={name} onChange={(event) => setName(event.target.value)} /><input required placeholder="Telephone" value={phone} onChange={(event) => setPhone(event.target.value)} /><input required={!editing} minLength={6} type="password" placeholder={editing ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe'} value={password} onChange={(event) => setPassword(event.target.value)} /><button className="primary-button" disabled={saving}>{saving ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Creer le compte'}</button></div></form>}{message && <p className="form-message">{message}</p>}<section className="assignment-grid">{drivers.map((driver) => <article className="driver-card" key={driver.id}><div className="driver-card-head"><div className="driver-avatar">{driver.initials}</div><div><h3>{driver.name}</h3><p><span className={`status ${driver.active ? 'livre' : 'retour'}`}>{driver.active ? 'Actif' : 'Inactif'}</span></p></div></div><div className="driver-metrics"><div><strong>{driver.assigned}</strong><span>Assignes</span></div><div><strong>{driver.delivered}</strong><span>Livres</span></div><div><strong>{driver.returns}</strong><span>Retours</span></div></div><div className="card-actions"><button type="button" className="secondary-button" onClick={() => startEdit(driver)}>Modifier</button><button type="button" className="danger-button" onClick={() => handleDelete(driver)}>Supprimer</button></div></article>)}{drivers.length === 0 && <div className="panel empty-state">Aucun livreur. Ajoutez le premier livreur.</div>}</section></>
}
function ReturnsPage({ packages, onRefresh }: { packages: DeliveryPackage[]; onRefresh: Refresh }) {
  const [scanned, setScanned] = useState<DeliveryPackage | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const returnCandidates = packages.filter((item) => item.driver && item.status !== 'LIVRE' && item.status !== 'RETOUR')
  const returnedPackages = packages.filter((item) => item.status === 'RETOUR')

  function handleCameraCode(trackingCode: string) {
    setCameraOpen(false)
    const item = returnCandidates.find((current) => current.trackingCode.toLowerCase() === trackingCode.toLowerCase())
    if (!item) {
      setMessage(`Le code ${trackingCode} ne correspond a aucun package a retourner.`)
      return
    }
    setScanned(item)
    setMessage(`Package ${item.trackingCode} detecte. Verifiez puis confirmez le retour.`)
  }

  async function confirmReturn() {
    if (!scanned || saving) return
    setSaving(true)
    try {
      await registerPackageReturn(scanned.id)
      await onRefresh()
      setMessage(`Retour de ${scanned.trackingCode} enregistre. Le package n est plus affecte au livreur.`)
      setScanned(null)
    } catch {
      setMessage("Le retour n'a pas pu etre enregistre.")
    } finally {
      setSaving(false)
    }
  }

  return <>
    <div className="scanner-page-heading"><div><p className="eyebrow">FIN DE TOURNEE</p><h2>Scanner les retours</h2><p>Scannez chaque package non livre avant de le reprendre au livreur.</p></div><span className="status retour">{returnCandidates.length} a recevoir</span></div>
    {message && <p className="driver-message">{message}</p>}
    <div className="scanner-layout scanner-workspace return-workspace">
      <section className="panel scanner-box"><div className="scanner-box-content"><div className="scanner-mark">RETOUR</div><p className="scanner-step">RECEPTION</p><h3>Scanner un package retourne</h3><p>Le package sera retire du livreur apres confirmation.</p><button className="primary-button" disabled={returnCandidates.length === 0} onClick={() => setCameraOpen(true)}>Ouvrir la camera</button><label className="manual-scan-label">Ou selectionner manuellement<select className="filter-select scanner-select" disabled={returnCandidates.length === 0} value={scanned?.id ?? ''} onChange={(event) => setScanned(returnCandidates.find((item) => item.id === Number(event.target.value)) ?? null)}><option value="">Choisir un package</option>{returnCandidates.map((item) => <option value={item.id} key={item.id}>{item.trackingCode} - {item.driver}</option>)}</select></label></div></section>
      <section className="panel scan-result"><div className="scan-result-heading"><div><p className="eyebrow">VERIFICATION</p><h3>Package retourne</h3></div>{scanned && <span className="status retour">RETOUR</span>}</div>{scanned ? <><div className="scan-code">{scanned.trackingCode}</div><div className="detail-row"><span>Destinataire</span><strong>{scanned.recipient}</strong></div><div className="detail-row"><span>Livreur actuel</span><strong>{scanned.driver}</strong></div><div className="detail-row"><span>Adresse</span><strong>{scanned.address}, {scanned.city}</strong></div><button className="danger-button return-confirm-button" disabled={saving} onClick={() => void confirmReturn()}>{saving ? 'Enregistrement...' : 'Confirmer le retour et desaffecter'}</button></> : <div className="scan-empty"><div>RETOUR</div><strong>En attente de retour</strong><p>Scannez un package remis par un livreur.</p></div>}</section>
    </div>
    <section className="panel table-panel return-table"><div className="panel-heading"><h3>Retours enregistres</h3><span className="status retour">{returnedPackages.length} retour(s)</span></div><PackageTable packages={returnedPackages} /></section>
    {cameraOpen && <BarcodeScanner onDetected={handleCameraCode} onClose={() => setCameraOpen(false)} />}
  </>
}

function AdminApp({ onLogout }: { onLogout: () => void }) {
  const [activePage, setActivePage] = useState<Page>('dashboard')
  const [query, setQuery] = useState('')
  const [packages, setPackages] = useState<DeliveryPackage[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refresh: Refresh = useCallback(async () => { const data = await fetchDashboardData(); setPackages(data.packages); setDrivers(data.drivers) }, [])
  useEffect(() => {
    let mounted = true
    fetchDashboardData().then((data) => { if (mounted) { setPackages(data.packages); setDrivers(data.drivers) } }).catch(() => { if (mounted) setError('Le backend est indisponible. Lance Spring Boot sur le port 8080.') }).finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])
  const pageContent = activePage === 'dashboard' ? <Dashboard packages={packages} drivers={drivers} onNavigate={setActivePage} onImported={refresh} /> : activePage === 'packages' ? <PackagesPage packages={packages} onImported={refresh} /> : activePage === 'assignment' ? <AssignmentPage packages={packages} drivers={drivers} onRefresh={refresh} /> : activePage === 'scanner' ? <ScannerPage packages={packages} drivers={drivers} onRefresh={refresh} /> : activePage === 'drivers' ? <DriversPage drivers={drivers} onRefresh={refresh} /> : <ReturnsPage packages={packages} onRefresh={refresh} />
  const returnsCount = packages.filter((item) => item.status === 'RETOUR').length
  return <div className="app-shell"><Sidebar activePage={activePage} onNavigate={setActivePage} returnsCount={returnsCount} onLogout={onLogout} /><main className="main"><Topbar title={pageTitles[activePage]} onSearch={setQuery} /><div className="content">{query && <div className="search-note">Recherche active : {query}</div>}{loading ? <div className="loading-state">Chargement des donnees...</div> : error ? <div className="error-state">{error}<button className="secondary-button" onClick={() => window.location.reload()}>Reessayer</button></div> : pageContent}</div></main></div>
}

function App() {
  const [auth, setAuth] = useState<AuthUser | null>(() => getAuth())
  function logout() { clearAuth(); setAuth(null) }
  if (!auth) return <LoginPage onLogin={() => setAuth(getAuth())} />
  if (auth.role === 'DRIVER') return <DriverPage onLogout={logout} />
  return <AdminApp onLogout={logout} />
}

export default App
