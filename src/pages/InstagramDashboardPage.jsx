import { useCallback, useEffect, useState } from 'react'
import api from '../lib/api'
import { formatDateTime, formatNumber, logUiError, toInputDate, truncateText } from './pageUtils'

export default function InstagramDashboardPage() {
  const pageSize = 20
  const [filters, setFilters] = useState({
    instagram_account_id: '',
    date_start: '2000-01-01',
    date_end: toInputDate(new Date()),
  })
  const [accounts, setAccounts] = useState([])
  const [kpis, setKpis] = useState(null)
  const [rows, setRows] = useState([])
  const [tableTotal, setTableTotal] = useState(0)
  const [ordering, setOrdering] = useState('-date')
  const [currentPage, setCurrentPage] = useState(1)
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageStart = (currentPage - 1) * pageSize
  const pageRows = rows.slice(pageStart, pageStart + pageSize)

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true)
    try {
      const response = await api.get('/api/instagram/accounts')
      setAccounts(response.data?.accounts || [])
    } catch (error) {
      logUiError('dashboard-instagram', 'instagram-accounts', error)
      setErrorMsg('Falha ao carregar contas de Instagram.')
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  const loadDashboardData = useCallback(
    async (orderingOverride) => {
      setDataLoading(true)
      setErrorMsg('')
      try {
        const resolvedOrdering = orderingOverride || ordering
        const baseParams = {
          date_start: filters.date_start,
          date_end: filters.date_end,
          ordering: resolvedOrdering,
        }
        if (filters.instagram_account_id) {
          baseParams.instagram_account_id = filters.instagram_account_id
        }

        const kpisPromise = api.get('/api/instagram/kpis', { params: baseParams })
        let fetchedTotal = 0
        let fetchedOffset = 0
        let iterations = 0
        const allRows = []

        while (true) {
          const tableRes = await api.get('/api/instagram/media-table', {
            params: {
              ...baseParams,
              limit: 500,
              offset: fetchedOffset,
            },
          })
          const payload = tableRes.data || {}
          const chunk = payload.rows || []
          fetchedTotal = Number(payload.total || 0)
          allRows.push(...chunk)
          fetchedOffset += chunk.length
          iterations += 1

          if (chunk.length === 0 || fetchedOffset >= fetchedTotal || iterations >= 2000) {
            break
          }
        }

        const kpisRes = await kpisPromise
        setKpis(kpisRes.data?.kpis || null)
        setRows(allRows)
        setTableTotal(fetchedTotal)
        setOrdering(resolvedOrdering)
        setCurrentPage(1)
      } catch (error) {
        logUiError('dashboard-instagram', 'instagram-kpis-media-table', error)
        setErrorMsg(error.response?.data?.detail || 'Falha ao carregar dashboard Instagram.')
      } finally {
        setDataLoading(false)
      }
    },
    [filters, ordering],
  )

  useEffect(() => {
    loadAccounts()
  }, [loadAccounts])

  useEffect(() => {
    loadDashboardData(ordering)
  }, [loadDashboardData, ordering])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const applyFilters = () => {
    loadDashboardData(ordering)
  }

  const toggleOrdering = (field) => {
    const descendingDefaults = new Set(['date', 'reach', 'views', 'likes', 'comments', 'saved', 'shares', 'plays'])
    const currentField = ordering.startsWith('-') ? ordering.slice(1) : ordering
    const currentDesc = ordering.startsWith('-')
    let nextOrdering
    if (currentField === field) {
      nextOrdering = currentDesc ? field : `-${field}`
    } else {
      nextOrdering = descendingDefaults.has(field) ? `-${field}` : field
    }
    loadDashboardData(nextOrdering)
  }

  const sortIndicator = (field) => {
    const currentField = ordering.startsWith('-') ? ordering.slice(1) : ordering
    const currentDesc = ordering.startsWith('-')
    if (currentField !== field) return '↕'
    return currentDesc ? '↓' : '↑'
  }

  return (
    <section className="view-card">
      <h2>Dashboard Instagram</h2>
      <div className="filter-grid">
        <select
          value={filters.instagram_account_id}
          onChange={(event) =>
            setFilters((prev) => ({ ...prev, instagram_account_id: event.target.value }))
          }
          disabled={accountsLoading}
        >
          <option value="">Todas as contas Instagram</option>
          {accounts.map((row) => (
            <option key={row.id_meta_instagram} value={row.id_meta_instagram}>
              {row.name || row.id_meta_instagram}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filters.date_start}
          onChange={(event) => setFilters((prev) => ({ ...prev, date_start: event.target.value }))}
        />
        <input
          type="date"
          value={filters.date_end}
          onChange={(event) => setFilters((prev) => ({ ...prev, date_end: event.target.value }))}
        />
      </div>
      <div className="filter-actions">
        <button type="button" className="primary-btn" onClick={applyFilters} disabled={dataLoading}>
          {dataLoading ? 'Atualizando...' : 'Aplicar filtros'}
        </button>
      </div>

      {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}
      <div className="instagram-kpis">
        <div className="mini-kpi">Alcance: {formatNumber(kpis?.alcance)}</div>
        <div className="mini-kpi">Impressões: {formatNumber(kpis?.impressoes)}</div>
        <div className="mini-kpi">Curtidas: {formatNumber(kpis?.curtidas)}</div>
        <div className="mini-kpi">Comentários: {formatNumber(kpis?.comentarios)}</div>
        <div className="mini-kpi">Salvos: {formatNumber(kpis?.salvos)}</div>
        <div className="mini-kpi">Compartilhamentos: {formatNumber(kpis?.compartilhamentos)}</div>
      </div>

      <div className="table-wrapper">
        <table className="media-table">
          <thead>
            <tr>
              <th>
                <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('date')}>
                  Data <span>{sortIndicator('date')}</span>
                </button>
              </th>
              <th>
                <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('tipo')}>
                  Tipo <span>{sortIndicator('tipo')}</span>
                </button>
              </th>
              <th>
                <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('caption')}>
                  Legenda <span>{sortIndicator('caption')}</span>
                </button>
              </th>
              <th>
                <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('reach')}>
                  Reach <span>{sortIndicator('reach')}</span>
                </button>
              </th>
              <th>
                <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('views')}>
                  Views <span>{sortIndicator('views')}</span>
                </button>
              </th>
              <th>
                <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('likes')}>
                  Likes <span>{sortIndicator('likes')}</span>
                </button>
              </th>
              <th>
                <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('comments')}>
                  Comentários <span>{sortIndicator('comments')}</span>
                </button>
              </th>
              <th>
                <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('saved')}>
                  Saved <span>{sortIndicator('saved')}</span>
                </button>
              </th>
              <th>
                <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('shares')}>
                  Shares <span>{sortIndicator('shares')}</span>
                </button>
              </th>
              <th>
                <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('plays')}>
                  Plays <span>{sortIndicator('plays')}</span>
                </button>
              </th>
              <th>
                <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('link')}>
                  Link <span>{sortIndicator('link')}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan="11">Sem dados para o periodo selecionado.</td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={row.id_meta_media}>
                  <td>{formatDateTime(row.date)}</td>
                  <td>{row.tipo || '-'}</td>
                  <td>{row.caption ? truncateText(row.caption, 100) : '-'}</td>
                  <td>{formatNumber(row.reach)}</td>
                  <td>{formatNumber(row.views)}</td>
                  <td>{formatNumber(row.likes)}</td>
                  <td>{formatNumber(row.comments)}</td>
                  <td>{formatNumber(row.saved)}</td>
                  <td>{formatNumber(row.shares)}</td>
                  <td>{formatNumber(row.plays)}</td>
                  <td>
                    {row.link ? (
                      <a href={row.link} target="_blank" rel="noreferrer">
                        Abrir
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="table-pagination">
        <span className="hint-neutral">
          Pagina {formatNumber(currentPage)} de {formatNumber(totalPages)} | Mostrando{' '}
          {formatNumber(rows.length === 0 ? 0 : pageStart + 1)}-{formatNumber(Math.min(pageStart + pageSize, rows.length))}
        </span>
        <div className="pagination-controls">
          <button
            type="button"
            className="primary-btn"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage <= 1 || dataLoading}
          >
            Anterior
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage >= totalPages || dataLoading}
          >
            Proxima
          </button>
        </div>
      </div>
      <p className="hint-neutral">Total de posts no resultado: {formatNumber(tableTotal)}</p>
    </section>
  )
}
