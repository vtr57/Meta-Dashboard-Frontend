import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import api from '../lib/api'
import {
  daysAgo,
  formatDate,
  formatDateTime,
  formatNumber,
  logUiError,
  toInputDate,
  truncateText,
} from './pageUtils'

const INSTAGRAM_SYNC_STAGE_ORDER = ['facebook pages', 'instagram business + insights da conta', 'midias + insights das midias']

function normalizeSyncText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function formatSyncStatusLabel(status) {
  if (status === 'running') return 'Em andamento'
  if (status === 'success') return 'Concluida'
  if (status === 'failed') return 'Falhou'
  if (status === 'pending') return 'Na fila'
  return 'Pronta'
}

function computeInstagramSyncProgress(syncRun, logs) {
  if (!syncRun) return 0
  if (syncRun.status === 'success') return 100

  const normalizedMessages = (logs || []).map((row) => normalizeSyncText(row.mensagem))
  let completedStages = 0
  let activeStageCount = 0

  for (const stageName of INSTAGRAM_SYNC_STAGE_ORDER) {
    const stageStartMarker = `[${stageName}] inicio`
    const stageDoneMarker = `[${stageName}] concluido`
    const stageDone = normalizedMessages.some((message) => message.includes(stageDoneMarker))
    if (stageDone) {
      completedStages += 1
      continue
    }
    const stageStarted = normalizedMessages.some((message) => message.includes(stageStartMarker))
    if (stageStarted) {
      activeStageCount += 1
    }
  }

  const totalStages = INSTAGRAM_SYNC_STAGE_ORDER.length || 1
  if (syncRun.status === 'failed') {
    return Math.max(8, Math.round((completedStages / totalStages) * 100))
  }
  if (completedStages === 0 && activeStageCount === 0) {
    return logs.length > 0 ? 8 : 0
  }

  const partialStage = Math.min(activeStageCount, 1) * 0.5
  const rawProgress = ((completedStages + partialStage) / totalStages) * 100
  return Math.min(95, Math.max(8, Math.round(rawProgress)))
}

function InstagramTimeseriesChart({ series }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined

    let context = null
    try {
      context = canvas.getContext('2d')
    } catch {
      context = null
    }
    if (!context) return undefined

    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }

    const toNumber = (value) => {
      if (value === null || value === undefined) return null
      const parsed = Number(value)
      return Number.isFinite(parsed) ? parsed : null
    }

    chartRef.current = new Chart(context, {
      type: 'line',
      data: {
        labels: series.map((row) => row.date),
        datasets: [
          {
            label: 'Impressões',
            data: series.map((row) => toNumber(row.impressions)),
            yAxisID: 'yLeft',
            borderColor: '#1d4ed8',
            backgroundColor: '#1d4ed8',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2,
          },
          {
            label: 'Alcance',
            data: series.map((row) => toNumber(row.reach)),
            yAxisID: 'yLeft',
            borderColor: '#0f766e',
            backgroundColor: '#0f766e',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2,
          },
          {
            label: 'Follower Count',
            data: series.map((row) => toNumber(row.follower_count)),
            yAxisID: 'yRight',
            borderColor: '#b45309',
            backgroundColor: '#b45309',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.2,
            spanGaps: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              color: '#173a67',
              font: {
                size: 12,
                weight: 700,
              },
            },
          },
          tooltip: {
            backgroundColor: '#ffffff',
            titleColor: '#102a4d',
            bodyColor: '#102a4d',
            borderColor: '#9cb8e2',
            borderWidth: 1,
            callbacks: {
              title: (items) => formatDate(items[0]?.label),
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: '#173a67',
              callback: (_, index) => formatDate(series[index]?.date),
            },
            grid: {
              color: '#bdd0ef',
            },
          },
          yLeft: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            ticks: {
              color: '#173a67',
            },
            grid: {
              color: '#bdd0ef',
            },
            title: {
              display: true,
              text: 'Impressões / Alcance',
              color: '#173a67',
              font: {
                size: 12,
                weight: 700,
              },
            },
          },
          yRight: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            ticks: {
              color: '#173a67',
            },
            grid: {
              drawOnChartArea: false,
              color: '#bdd0ef',
            },
            title: {
              display: true,
              text: 'Follower Count',
              color: '#173a67',
              font: {
                size: 12,
                weight: 700,
              },
            },
          },
        },
      },
    })

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [series])

  return (
    <div className="chart-wrapper">
      <canvas ref={canvasRef} className="chartjs-canvas" aria-label="Grafico temporal do Instagram" />
    </div>
  )
}

export default function InstagramDashboardPage() {
  const pageSize = 20
  const [filters, setFilters] = useState({
    instagram_account_id: '',
    date_start: toInputDate(daysAgo(30)),
    date_end: toInputDate(new Date()),
  })
  const [accounts, setAccounts] = useState([])
  const [kpis, setKpis] = useState(null)
  const [timeseries, setTimeseries] = useState([])
  const [rows, setRows] = useState([])
  const [tableTotal, setTableTotal] = useState(0)
  const [ordering, setOrdering] = useState('-date')
  const [currentPage, setCurrentPage] = useState(1)
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [syncRun, setSyncRun] = useState(null)
  const [syncLogs, setSyncLogs] = useState([])
  const [syncLoading, setSyncLoading] = useState(false)
  const [syncFeedback, setSyncFeedback] = useState('')
  const [syncErrorMsg, setSyncErrorMsg] = useState('')
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageStart = (currentPage - 1) * pageSize
  const pageRows = rows.slice(pageStart, pageStart + pageSize)
  const syncInProgress = !!syncRun && !syncRun.is_finished
  const syncProgress = useMemo(() => computeInstagramSyncProgress(syncRun, syncLogs), [syncRun, syncLogs])
  const syncStatusLabel = syncRun ? formatSyncStatusLabel(syncRun.status) : 'Pronta'
  const syncStatusClass = syncRun ? `status-${syncRun.status}` : 'status-idle'

  const chartSeries = useMemo(
    () =>
      (timeseries || []).map((row) => ({
        date: row.date,
        impressions: Number(row.impressions || 0),
        reach: Number(row.reach || 0),
        follower_count:
          row.follower_count === null || row.follower_count === undefined
            ? null
            : Number(row.follower_count || 0),
      })),
    [timeseries],
  )

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
        const timeseriesPromise = api.get('/api/instagram/timeseries', { params: baseParams })
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

        const [kpisRes, timeseriesRes] = await Promise.all([kpisPromise, timeseriesPromise])
        setKpis(kpisRes.data?.kpis || null)
        setTimeseries(timeseriesRes.data?.timeseries || [])
        setRows(allRows)
        setTableTotal(fetchedTotal)
        setOrdering(resolvedOrdering)
        setCurrentPage(1)
      } catch (error) {
        logUiError('dashboard-instagram', 'instagram-kpis-timeseries-media-table', error)
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

  useEffect(() => {
    if (!syncRun?.id || syncRun?.is_finished) return
    let canceled = false
    let timer
    let sinceId = 0

    const poll = async () => {
      try {
        const response = await api.get(`/api/meta/sync/${syncRun.id}/logs`, {
          params: { since_id: sinceId },
        })
        const payload = response.data || {}
        const incomingLogs = payload.logs || []
        if (incomingLogs.length > 0) {
          setSyncLogs((prev) => [...prev, ...incomingLogs])
        }
        sinceId = payload.next_since_id || sinceId
        const run = payload.sync_run || {}
        const finished = !!run.is_finished
        setSyncRun((prev) => ({
          id: prev?.id || syncRun.id,
          status: run.status || prev?.status || syncRun.status,
          is_finished: finished,
          sync_scope: prev?.sync_scope || 'instagram',
        }))
        if (!finished && !canceled) {
          timer = window.setTimeout(poll, 2000)
          return
        }
        if (finished) {
          if (run.status === 'success') {
            setSyncFeedback('Sincronizacao da conta concluida com sucesso.')
            setSyncErrorMsg('')
            loadDashboardData(ordering)
          } else {
            setSyncErrorMsg('A sincronizacao da conta finalizou com erro.')
            setSyncFeedback('')
          }
        }
      } catch (error) {
        logUiError('dashboard-instagram', 'instagram-sync-logs', error)
        if (!canceled) {
          timer = window.setTimeout(poll, 2000)
        }
      }
    }

    poll()
    return () => {
      canceled = true
      if (timer) window.clearTimeout(timer)
    }
  }, [syncRun?.id, syncRun?.is_finished, loadDashboardData, ordering])

  const applyFilters = () => {
    loadDashboardData(ordering)
  }

  const handleSyncSelected = async () => {
    if (!filters.instagram_account_id) {
      setSyncErrorMsg('Selecione uma conta de Instagram para sincronizar.')
      setSyncFeedback('')
      return
    }

    setSyncLoading(true)
    setSyncErrorMsg('')
    setSyncFeedback('')
    try {
      const response = await api.post('/api/instagram/sync-selected', {
        instagram_account_id: filters.instagram_account_id,
        date_start: filters.date_start,
        date_end: filters.date_end,
      })
      const runId = response.data?.sync_run_id
      if (runId) {
        setSyncLogs([])
        setSyncRun({
          id: runId,
          status: response.data?.status || 'pending',
          is_finished: false,
          sync_scope: response.data?.sync_scope || 'instagram',
        })
        setSyncFeedback('Sincronizacao da conta iniciada.')
      }
    } catch (error) {
      logUiError('dashboard-instagram', 'instagram-sync-selected', error)
      setSyncErrorMsg(error.response?.data?.detail || 'Falha ao iniciar sincronizacao da conta.')
      setSyncFeedback('')
    } finally {
      setSyncLoading(false)
    }
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
          aria-label="Filtro de conta Instagram"
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
          aria-label="Data inicial Instagram"
        />
        <input
          type="date"
          value={filters.date_end}
          onChange={(event) => setFilters((prev) => ({ ...prev, date_end: event.target.value }))}
          aria-label="Data final Instagram"
        />
      </div>
      <div className="filter-actions">
        <button type="button" className="primary-btn" onClick={applyFilters} disabled={dataLoading}>
          {dataLoading ? 'Atualizando...' : 'Aplicar filtros'}
        </button>
      </div>

      {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}

      <div className="chart-and-kpis instagram-overview-grid">
        <article className="chart-card">
          <h3>Serie temporal da conta</h3>
          {chartSeries.length === 0 ? (
            <div className="chart-placeholder">
              <strong>Sem série diária disponível.</strong>
              <span>Sincronize o Instagram e aplique um período com dados para montar o gráfico.</span>
            </div>
          ) : (
            <InstagramTimeseriesChart series={chartSeries} />
          )}
        </article>

        <article className="kpis-card">
          <div className="connection-card-title instagram-sync-header">
            <h3>Resumo do período</h3>
            <span className={`sync-status-badge ${syncStatusClass}`}>{syncStatusLabel}</span>
          </div>
          <div className="instagram-sync-panel">
            <button
              type="button"
              className="primary-btn sync-primary-btn instagram-sync-btn"
              onClick={handleSyncSelected}
              disabled={syncLoading || syncInProgress || !filters.instagram_account_id}
            >
              {syncLoading || syncInProgress ? 'Sincronizando...' : 'Sincronizar conta selecionada'}
            </button>
            <p className="sync-group-caption">
              Sincroniza apenas a conta escolhida e respeita o período filtrado acima.
            </p>
            {syncFeedback ? <p className="hint-ok">{syncFeedback}</p> : null}
            {syncErrorMsg ? <p className="hint-error">{syncErrorMsg}</p> : null}
            <div
              className="sync-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(syncProgress)}
            >
              <div className="sync-progress-fill" style={{ width: `${syncProgress}%` }} />
            </div>
            <p className="sync-progress-value">{Math.round(syncProgress)}% concluido</p>
          </div>
          <div className="kpi-grid instagram-kpi-grid">
            <div className="mini-kpi">Alcance: {formatNumber(kpis?.alcance)}</div>
            <div className="mini-kpi">Impressões: {formatNumber(kpis?.impressoes)}</div>
            <div className="mini-kpi">Contas engajadas: {formatNumber(kpis?.contas_engajadas)}</div>
            <div className="mini-kpi">Total de interações: {formatNumber(kpis?.total_interacoes)}</div>
          </div>
        </article>
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
