type TopbarProps = { title: string; onSearch: (value: string) => void }

export function Topbar({ title, onSearch }: TopbarProps) {
  return <header className="topbar">
    <div><p className="eyebrow">SAMEDI 08 AOÛT 2026</p><h1>{title}</h1></div>
    <div className="topbar-actions">
      <label className="search"><span aria-hidden="true">⌕</span><input aria-label="Rechercher" placeholder="Rechercher un package..." onChange={(event) => onSearch(event.target.value)} /></label>
      <button className="icon-button" aria-label="Notifications"><span className="notification-dot" />♧</button>
      <div className="top-avatar">AM</div>
    </div>
  </header>
}
