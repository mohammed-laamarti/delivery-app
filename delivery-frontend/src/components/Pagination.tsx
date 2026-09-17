type PaginationProps = {
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

export function Pagination({ currentPage, totalItems, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize)
  if (totalPages <= 1) return null

  const page = Math.max(1, Math.min(currentPage, totalPages))
  const firstItem = (page - 1) * pageSize + 1
  const lastItem = Math.min(page * pageSize, totalItems)
  // Keep the controls bounded even when the list contains thousands of pages.
  const start = Math.max(2, Math.min(page - 1, totalPages - 3))
  const end = Math.min(totalPages - 1, Math.max(page + 1, 4))
  const pages: (number | 'start-gap' | 'end-gap')[] = totalPages <= 7
    ? Array.from({ length: totalPages }, (_, index) => index + 1)
    : [1, ...(start > 2 ? ['start-gap' as const] : []),
      ...Array.from({ length: end - start + 1 }, (_, index) => start + index),
      ...(end < totalPages - 1 ? ['end-gap' as const] : []), totalPages]

  return <nav className="pagination" aria-label="Pagination">
    <span>{firstItem}-{lastItem} sur {totalItems}</span>
    <div className="pagination-actions">
      <button className="pagination-button" disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Page precedente">Precedent</button>
      {pages.map((item) => typeof item === 'number'
        ? <button key={item} className={`pagination-button ${item === page ? 'active' : ''}`} onClick={() => onPageChange(item)} aria-current={item === page ? 'page' : undefined}>{item}</button>
        : <span key={item} className="pagination-ellipsis" aria-hidden="true">…</span>)}
      <button className="pagination-button" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} aria-label="Page suivante">Suivant</button>
    </div>
  </nav>
}
