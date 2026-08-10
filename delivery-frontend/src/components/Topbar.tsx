type TopbarProps = { title: string; onLogout: () => void }

export function Topbar({ title, onLogout }: TopbarProps) {
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    .format(new Date())
    .toLocaleUpperCase('fr-FR')

  return <header className="topbar">
    <div><p className="eyebrow">{date}</p><h1>{title}</h1></div>
    <div className="topbar-admin"><div className="top-avatar">AM</div><div className="topbar-admin-info"><strong>Admin principal</strong><small>Administrateur</small></div><button className="topbar-link topbar-logout" type="button" onClick={onLogout}>Se deconnecter</button></div>
  </header>
}
