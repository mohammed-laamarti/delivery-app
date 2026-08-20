import type { Page } from '../types'

type SidebarProps = { activePage: Page; onNavigate: (page: Page) => void; returnsCount: number }

const items: { page: Page; label: string; icon: string }[] = [
  { page: 'dashboard', label: 'Vue generale', icon: '▦' },
  { page: 'packages', label: 'Colis', icon: '□' },
  { page: 'scanner', label: 'Scanner sortie', icon: '⌗' },
  { page: 'drivers', label: 'Livreurs', icon: '♙' },
  { page: 'returns', label: 'Retours', icon: '↩' },
]

export function Sidebar({ activePage, onNavigate, returnsCount }: SidebarProps) {
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">D</span><span>delivery<span className="brand-dot">.</span></span></div>
    <div className="workspace-label">ESPACE ADMIN</div>
    <nav aria-label="Navigation principale">
      {items.map((item) => <button key={item.page} className={`nav-item ${activePage === item.page ? 'active' : ''}`} onClick={() => onNavigate(item.page)}>
        <span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
        {item.page === 'returns' && returnsCount > 0 && <span className="nav-count">{returnsCount}</span>}
      </button>)}
    </nav>
  </aside>
}
