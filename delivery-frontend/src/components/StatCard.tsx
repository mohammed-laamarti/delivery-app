type StatCardProps = { label: string; value: string; detail: string; tone: 'blue' | 'orange' | 'green' | 'red' }

export function StatCard({ label, value, detail, tone }: StatCardProps) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`} aria-hidden="true">{tone === 'blue' ? '□' : tone === 'orange' ? '⇄' : tone === 'green' ? '✓' : '↩'}</div><div><p>{label}</p><strong>{value}</strong><small>{detail}</small></div></article>
}
