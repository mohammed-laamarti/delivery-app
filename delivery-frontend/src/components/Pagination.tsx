type PaginationProps = {
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

export function Pagination({ currentPage, totalItems, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize)
  if (totalPages <= 1) return null

  const page = Math.min(currentPage, totalPages)
  const firstItem = (page - 1) * pageSize + 1
  const lastItem = Math.min(page * pageSize, totalItems)
  const pages = Array.from({ length: totalPages }, (_, index) => index + 1)

  return <nav className="pagination" aria-label="Pagination">
    <span>{firstItem}-{lastItem} sur {totalItems}</span>
    <div className="pagination-actions">
      <button className="pagination-button" disabled={page === 1} onClick={() => onPageChange(page - 1)} aria-label="Page precedente">Precedent</button>
      {pages.map((item) => <button key={item} className={`pagination-button ${item === page ? 'active' : ''}`} onClick={() => onPageChange(item)} aria-current={item === page ? 'page' : undefined}>{item}</button>)}
      <button className="pagination-button" disabled={page === totalPages} onClick={() => onPageChange(page + 1)} aria-label="Page suivante">Suivant</button>
    </div>
  </nav>
}
