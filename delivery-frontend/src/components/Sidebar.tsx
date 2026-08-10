import type { Page } from '../types'

type SidebarProps = { activePage: Page; onNavigate: (page: Page) => void; returnsCount: number; onLogout?: () => void }

const items: { page: Page; label: string; icon: string }[] = [
  { page: 'dashboard', label: 'Vue générale', icon: '▦' },
  { page: 'packages', label: 'Packages', icon: '□' },
  { page: 'assignment', label: 'Affectation', icon: '⇄' },
  { page: 'scanner', label: 'Scanner sortie', icon: '⌗' },
  { page: 'drivers', label: 'Livreurs', icon: '♙' },
  { page: 'returns', label: 'Retours', icon: '↩' },
]

export function Sidebar({ activePage, onNavigate, returnsCount, onLogout }: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">D</span><span>delivery<span className="brand-dot">.</span></span></div>
      <div className="workspace-label">ESPACE ADMIN</div>
      <nav aria-label="Navigation principale">
        {items.map((item) => (
          <button key={item.page} className={`nav-item ${activePage === item.page ? 'active' : ''}`} onClick={() => onNavigate(item.page)}>
            <span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
            {item.page === 'returns' && returnsCount > 0 && <span className="nav-count">{returnsCount}</span>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button className="nav-item"><span className="nav-icon">⚙</span><span>Paramètres</span></button>
        {onLogout && <button className="nav-item" onClick={onLogout}><span className="nav-icon">↪</span><span>Se déconnecter</span></button>}
        <div className="account-mini"><div className="avatar">AM</div><div><strong>Admin principal</strong><small>Administrateur</small></div><span className="more">•••</span></div>
      </div>
    </aside>
  )
}
