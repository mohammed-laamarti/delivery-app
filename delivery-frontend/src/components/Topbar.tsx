type TopbarProps = { title: string; selectedDate: string; maxDate: string; onDateChange: (date: string) => void; onLogout: () => void }

export function Topbar({ title, selectedDate, maxDate, onDateChange, onLogout }: TopbarProps) {
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    .format(new Date())
    .toLocaleUpperCase('fr-FR')

  return <header className="topbar">
    <div><p className="eyebrow">{date}</p><h1>{title}</h1></div>
    <div className="topbar-right"><label className="global-date-filter"><span>Journée affichée</span><input type="date" value={selectedDate} max={maxDate} onChange={(event) => onDateChange(event.target.value)} /></label><div className="topbar-admin"><div className="top-avatar">AM</div><div className="topbar-admin-info"><strong>Admin principal</strong><small>Administrateur</small></div><button className="topbar-link topbar-logout" type="button" onClick={onLogout}>Se deconnecter</button></div></div>
  </header>
}
