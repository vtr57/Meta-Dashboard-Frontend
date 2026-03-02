import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import api from '../lib/api'
import {
  daysAgo,
  formatCorrelation,
  formatCurrency,
  formatDateTime,
  formatDecimal,
  formatNumber,
  logUiError,
  toInputDate,
} from './pageUtils'

const META_SYNC_STAGE_ORDER_ALL = [
  'ad accounts',
  'campaigns',
  'adsets',
  'ads',
  'ad insights (somente anuncio)',
  'facebook pages',
  'instagram business + insights da conta',
  'midias + insights das midias',
]

const META_SYNC_STAGE_ORDER_META = [
  'ad accounts',
  'campaigns',
  'adsets',
  'ads',
  'ad insights (somente anuncio)',
]

const SPECIFIC_DESCENDING_DEFAULTS = new Set(['results', 'spend', 'cpr'])

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

function getMetaSyncStageOrder(syncScope) {
  if (String(syncScope || '').toLowerCase() === 'meta') {
    return META_SYNC_STAGE_ORDER_META
  }
  return META_SYNC_STAGE_ORDER_ALL
}

function computeMetaSyncProgress(syncRun, logs) {
  if (!syncRun) return 0
  if (syncRun.status === 'success') return 100

  const stageOrder = getMetaSyncStageOrder(syncRun.sync_scope)
  const normalizedMessages = (logs || []).map((row) => normalizeSyncText(row.mensagem))
  let completedStages = 0
  let activeStageCount = 0

  for (const stageName of stageOrder) {
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

  const totalStages = stageOrder.length
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

function formatChartDateLabel(value) {
  const [year, month, day] = String(value || '')
    .slice(0, 10)
    .split('-')
    .map((part) => Number(part))
  if (!year || !month || !day) return String(value || '')
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

function MetaTimeseriesChart({ series }) {
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

    const toNumber = (value) => Number(value || 0)
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
            tension: 0,
          },
          {
            label: 'Alcance',
            data: series.map((row) => toNumber(row.reach)),
            yAxisID: 'yLeft',
            borderColor: '#0f766e',
            backgroundColor: '#0f766e',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: 'Gasto',
            data: series.map((row) => toNumber(row.spend)),
            yAxisID: 'yRight',
            borderColor: '#b91c1c',
            backgroundColor: '#b91c1c',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
          },
          {
            label: 'Results',
            data: series.map((row) => toNumber(row.results)),
            yAxisID: 'yRight',
            borderColor: '#7e22ce',
            backgroundColor: '#7e22ce',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0,
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
          },
        },
        scales: {
          x: {
            ticks: {
              color: '#173a67',
            },
            grid: {
              color: '#bdd0ef',
            },
          },
          yLeft: {
            type: 'linear',
            position: 'left',
            ticks: {
              color: '#173a67',
            },
            grid: {
              color: '#bdd0ef',
            },
            title: {
              display: true,
              text: 'Alcance / Impressões',
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
            ticks: {
              color: '#173a67',
            },
            grid: {
              drawOnChartArea: false,
              color: '#bdd0ef',
            },
            title: {
              display: true,
              text: 'Gasto / Results',
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
      <canvas ref={canvasRef} className="chartjs-canvas" aria-label="Grafico temporal de insights Meta" />
    </div>
  )
}

function MetaSpendTimeseriesChart({ series }) {
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

    chartRef.current = new Chart(context, {
      type: 'bar',
      data: {
        labels: series.map((row) => row.date),
        datasets: [
          {
            label: 'Gastos diários',
            data: series.map((row) => Number(row.spend || 0)),
            backgroundColor: '#0b4ea2',
            borderColor: '#082f6e',
            borderWidth: 1,
            borderRadius: 6,
            maxBarThickness: 32,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: '#ffffff',
            titleColor: '#102a4d',
            bodyColor: '#102a4d',
            borderColor: '#9cb8e2',
            borderWidth: 1,
            callbacks: {
              title: (items) => formatChartDateLabel(items[0]?.label),
              label: (item) => `Valor gasto: ${formatCurrency(item.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: '#173a67',
              callback: (_, index) => formatChartDateLabel(series[index]?.date),
            },
            grid: {
              color: '#d8e4f7',
            },
          },
          y: {
            ticks: {
              color: '#173a67',
              callback: (value) => formatCurrency(value),
            },
            grid: {
              color: '#d8e4f7',
            },
            title: {
              display: true,
              text: 'Gasto',
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
    <div className="chart-wrapper meta-specific-chart-wrapper">
      <canvas ref={canvasRef} className="chartjs-canvas" aria-label="Grafico de gastos diários por anúncio" />
    </div>
  )
}

function normalizeSeriesToDateRange(series, dateStart, dateEnd) {
  if (!dateStart || !dateEnd) return series || []

  const parseIsoDate = (value) => {
    const [year, month, day] = String(value || '')
      .slice(0, 10)
      .split('-')
      .map((part) => Number(part))
    if (!year || !month || !day) return null
    return new Date(Date.UTC(year, month - 1, day))
  }
  const formatIsoDate = (value) => value.toISOString().slice(0, 10)

  const startDate = parseIsoDate(dateStart)
  const endDate = parseIsoDate(dateEnd)
  if (!startDate || !endDate || startDate > endDate) return series || []

  const rawByDate = new Map()
  for (const row of series || []) {
    const key = String(row?.date || '').slice(0, 10)
    if (key) rawByDate.set(key, row)
  }

  const normalized = []
  for (let cursor = new Date(startDate); cursor <= endDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = formatIsoDate(cursor)
    const source = rawByDate.get(key)
    normalized.push({
      date: key,
      impressions: source?.impressions ?? null,
      reach: source?.reach ?? null,
      spend: source?.spend ?? null,
      results: source?.results ?? source?.clicks ?? null,
      clicks: source?.clicks ?? null,
    })
  }

  return normalized
}

function normalizeSpendSeriesToDateRange(series, dateStart, dateEnd) {
  if (!dateStart || !dateEnd) return series || []

  const parseIsoDate = (value) => {
    const [year, month, day] = String(value || '')
      .slice(0, 10)
      .split('-')
      .map((part) => Number(part))
    if (!year || !month || !day) return null
    return new Date(Date.UTC(year, month - 1, day))
  }
  const formatIsoDate = (value) => value.toISOString().slice(0, 10)

  const startDate = parseIsoDate(dateStart)
  const endDate = parseIsoDate(dateEnd)
  if (!startDate || !endDate || startDate > endDate) return series || []

  const rawByDate = new Map()
  for (const row of series || []) {
    const key = String(row?.date || '').slice(0, 10)
    if (key) rawByDate.set(key, row)
  }

  const normalized = []
  for (let cursor = new Date(startDate); cursor <= endDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = formatIsoDate(cursor)
    const source = rawByDate.get(key)
    normalized.push({
      date: key,
      spend: source?.spend ?? null,
    })
  }

  return normalized
}

function toSearchableItems(rows, idField) {
  return (rows || [])
    .map((row) => {
      const id = String(row?.[idField] || '').trim()
      if (!id) return null
      const name = String(row?.name || '').trim()
      const label = name && name !== id ? `${name} (${id})` : id
      return {
        id,
        label,
        searchIndex: `${name} ${id}`.toLowerCase(),
      }
    })
    .filter(Boolean)
}

function SearchableMetaFilter({
  value,
  items,
  placeholder,
  disabled,
  onChange,
  ariaLabel,
}) {
  const rootRef = useRef(null)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const selected = items.find((item) => item.id === value)
    setQuery(selected ? selected.label : '')
  }, [items, value])

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current) return
      if (rootRef.current.contains(event.target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const filteredItems = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return items.slice(0, 80)
    return items.filter((item) => item.searchIndex.includes(normalized)).slice(0, 80)
  }, [items, query])

  const selectValue = useCallback(
    (nextValue) => {
      if (!nextValue) {
        onChange('')
        setQuery('')
        setMenuOpen(false)
        return
      }
      const selected = items.find((item) => item.id === nextValue)
      onChange(nextValue)
      setQuery(selected ? selected.label : '')
      setMenuOpen(false)
    },
    [items, onChange],
  )

  const commitTypedValue = useCallback(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      onChange('')
      setQuery('')
      return
    }

    const exactMatch = items.find(
      (item) => item.id.toLowerCase() === normalized || item.label.toLowerCase() === normalized,
    )
    if (exactMatch) {
      onChange(exactMatch.id)
      setQuery(exactMatch.label)
      return
    }

    const selected = items.find((item) => item.id === value)
    setQuery(selected ? selected.label : '')
  }, [items, onChange, query, value])

  const handleInputBlur = () => {
    window.setTimeout(() => {
      if (!rootRef.current) return
      if (rootRef.current.contains(document.activeElement)) return
      commitTypedValue()
      setMenuOpen(false)
    }, 0)
  }

  const handleInputChange = (event) => {
    const nextValue = event.target.value
    setQuery(nextValue)
    setMenuOpen(true)
    if (!nextValue.trim()) {
      onChange('')
    }
  }

  const handleInputKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      if (filteredItems.length > 0) {
        selectValue(filteredItems[0].id)
      } else {
        commitTypedValue()
        setMenuOpen(false)
      }
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      const selected = items.find((item) => item.id === value)
      setQuery(selected ? selected.label : '')
      setMenuOpen(false)
    }
  }

  return (
    <div className="searchable-select" ref={rootRef}>
      <input
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={() => setMenuOpen(true)}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
      />
      {menuOpen && !disabled ? (
        <div className="searchable-select-menu" role="listbox" aria-label={ariaLabel}>
          <button
            type="button"
            className={`searchable-select-option ${value === '' ? 'is-selected' : ''}`}
            onMouseDown={(event) => {
              event.preventDefault()
              selectValue('')
            }}
          >
            {placeholder}
          </button>
          {filteredItems.length === 0 ? (
            <p className="searchable-select-empty">Nenhum resultado.</p>
          ) : (
            filteredItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`searchable-select-option ${value === item.id ? 'is-selected' : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault()
                  selectValue(item.id)
                }}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function formatSpecificCpr(value) {
  if (value === null || value === undefined) return '-'
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '-'
  return formatCurrency(parsed)
}

function getSpecificSortValue(row, field) {
  if (field === 'results') return Number(row?.results || 0)
  if (field === 'spend') return Number(row?.spend || 0)
  if (field === 'cpr') {
    const parsed = Number(row?.cpr)
    return Number.isFinite(parsed) ? parsed : null
  }
  return String(row?.[field] || '').toLowerCase()
}

export default function MetaDashboardPage() {
  const [activeTab, setActiveTab] = useState('general')
  const [filters, setFilters] = useState({
    ad_account_id: '',
    campaign_id: '',
    adset_id: '',
    ad_id: '',
    date_start: toInputDate(daysAgo(30)),
    date_end: toInputDate(new Date()),
  })
  const [options, setOptions] = useState({
    ad_accounts: [],
    campaigns: [],
    adsets: [],
    ads: [],
  })
  const [series, setSeries] = useState([])
  const [kpis, setKpis] = useState(null)
  const [filtersLoading, setFiltersLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [specificSeries, setSpecificSeries] = useState([])
  const [specificRows, setSpecificRows] = useState([])
  const [specificLoading, setSpecificLoading] = useState(false)
  const [specificErrorMsg, setSpecificErrorMsg] = useState('')
  const [specificOrdering, setSpecificOrdering] = useState('-spend')
  const [anotacoes, setAnotacoes] = useState([])
  const [anotacaoTexto, setAnotacaoTexto] = useState('')
  const [anotacoesLoading, setAnotacoesLoading] = useState(false)
  const [anotacoesSubmitting, setAnotacoesSubmitting] = useState(false)
  const [anotacaoDeletingId, setAnotacaoDeletingId] = useState(null)
  const [anotacoesError, setAnotacoesError] = useState('')
  const [anotacoesFeedback, setAnotacoesFeedback] = useState('')
  const [sync1dRun, setSync1dRun] = useState(null)
  const [sync1dLogs, setSync1dLogs] = useState([])
  const [sync1dStarting, setSync1dStarting] = useState(false)
  const [sync1dError, setSync1dError] = useState('')
  const [sync1dFeedback, setSync1dFeedback] = useState('')

  const chartSeries = useMemo(
    () => normalizeSeriesToDateRange(series, filters.date_start, filters.date_end),
    [series, filters.date_start, filters.date_end],
  )
  const specificChartSeries = useMemo(
    () => normalizeSpendSeriesToDateRange(specificSeries, filters.date_start, filters.date_end),
    [specificSeries, filters.date_start, filters.date_end],
  )
  const resultadosTotais = useMemo(
    () =>
      series.reduce((acc, row) => {
        const raw = row?.results ?? row?.clicks ?? 0
        const parsed = Number(raw)
        return acc + (Number.isFinite(parsed) ? parsed : 0)
      }, 0),
    [series],
  )
  const cpr = useMemo(() => {
    const gastoTotal = Number(kpis?.gasto_total || 0)
    if (!Number.isFinite(gastoTotal) || resultadosTotais <= 0) {
      return null
    }
    return gastoTotal / resultadosTotais
  }, [kpis?.gasto_total, resultadosTotais])
  const sync1dProgress = useMemo(() => computeMetaSyncProgress(sync1dRun, sync1dLogs), [sync1dRun, sync1dLogs])
  const sync1dInProgress = !!sync1dRun && !sync1dRun.is_finished
  const sync1dStatusLabel = formatSyncStatusLabel(sync1dRun?.status)
  const adAccountItems = useMemo(
    () => toSearchableItems(options.ad_accounts, 'id_meta_ad_account'),
    [options.ad_accounts],
  )
  const campaignItems = useMemo(
    () => toSearchableItems(options.campaigns, 'id_meta_campaign'),
    [options.campaigns],
  )
  const adsetItems = useMemo(
    () => toSearchableItems(options.adsets, 'id_meta_adset'),
    [options.adsets],
  )
  const adItems = useMemo(
    () => toSearchableItems(options.ads, 'id_meta_ad'),
    [options.ads],
  )
  const selectedAdAccountLabel = useMemo(() => {
    if (!filters.ad_account_id) return ''
    const selected = adAccountItems.find((item) => item.id === filters.ad_account_id)
    return selected?.label || filters.ad_account_id
  }, [adAccountItems, filters.ad_account_id])
  const sortedSpecificRows = useMemo(() => {
    const currentField = specificOrdering.startsWith('-') ? specificOrdering.slice(1) : specificOrdering
    const currentDesc = specificOrdering.startsWith('-')
    const rows = [...specificRows]
    rows.sort((left, right) => {
      const leftValue = getSpecificSortValue(left, currentField)
      const rightValue = getSpecificSortValue(right, currentField)

      const leftNull = leftValue === null || leftValue === undefined
      const rightNull = rightValue === null || rightValue === undefined
      if (leftNull && rightNull) return 0
      if (leftNull) return 1
      if (rightNull) return -1

      if (typeof leftValue === 'string' || typeof rightValue === 'string') {
        return currentDesc
          ? String(rightValue).localeCompare(String(leftValue), 'pt-BR')
          : String(leftValue).localeCompare(String(rightValue), 'pt-BR')
      }
      return currentDesc ? rightValue - leftValue : leftValue - rightValue
    })
    return rows
  }, [specificOrdering, specificRows])

  const loadFilters = useCallback(async () => {
    setFiltersLoading(true)
    setErrorMsg('')
    try {
      const params = {}
      if (filters.ad_account_id) params.ad_account_id = filters.ad_account_id
      if (filters.campaign_id) params.campaign_id = filters.campaign_id
      if (filters.adset_id) params.adset_id = filters.adset_id
      const response = await api.get('/api/meta/filters', { params })
      setOptions({
        ad_accounts: response.data?.ad_accounts || [],
        campaigns: response.data?.campaigns || [],
        adsets: response.data?.adsets || [],
        ads: response.data?.ads || [],
      })
    } catch (error) {
      logUiError('dashboard-meta', 'meta-filters', error)
      setErrorMsg('Falha ao carregar filtros do dashboard Meta.')
    } finally {
      setFiltersLoading(false)
    }
  }, [filters.ad_account_id, filters.campaign_id, filters.adset_id])

  const loadDashboardData = useCallback(async () => {
    setDataLoading(true)
    setErrorMsg('')
    try {
      const params = {
        date_start: filters.date_start,
        date_end: filters.date_end,
      }
      if (filters.ad_account_id) params.ad_account_id = filters.ad_account_id
      if (filters.campaign_id) params.campaign_id = filters.campaign_id
      if (filters.adset_id) params.adset_id = filters.adset_id
      if (filters.ad_id) params.ad_id = filters.ad_id

      const [timeseriesRes, kpisRes] = await Promise.all([
        api.get('/api/meta/timeseries', { params }),
        api.get('/api/meta/kpis', { params }),
      ])
      setSeries(timeseriesRes.data?.series || [])
      setKpis(kpisRes.data?.kpis || null)
    } catch (error) {
      logUiError('dashboard-meta', 'meta-timeseries-kpis', error)
      setErrorMsg(error.response?.data?.detail || 'Falha ao carregar dados do dashboard Meta.')
    } finally {
      setDataLoading(false)
    }
  }, [filters])

  const loadSpecificData = useCallback(async () => {
    setSpecificLoading(true)
    setSpecificErrorMsg('')
    try {
      const params = {
        date_start: filters.date_start,
        date_end: filters.date_end,
      }
      if (filters.ad_account_id) params.ad_account_id = filters.ad_account_id
      if (filters.campaign_id) params.campaign_id = filters.campaign_id
      if (filters.adset_id) params.adset_id = filters.adset_id

      const response = await api.get('/api/meta/specific-insights', { params })
      setSpecificSeries(response.data?.timeseries_daily || [])
      setSpecificRows(response.data?.rows_by_ad || [])
    } catch (error) {
      logUiError('dashboard-meta', 'meta-specific-insights', error)
      setSpecificErrorMsg(error.response?.data?.detail || 'Falha ao carregar dados específicos do dashboard Meta.')
    } finally {
      setSpecificLoading(false)
    }
  }, [filters.ad_account_id, filters.campaign_id, filters.adset_id, filters.date_end, filters.date_start])

  const loadAnotacoes = useCallback(async () => {
    if (!filters.ad_account_id) {
      setAnotacoes([])
      setAnotacoesError('')
      setAnotacoesFeedback('')
      return
    }

    setAnotacoesLoading(true)
    setAnotacoesError('')
    try {
      const response = await api.get('/api/meta/anotacoes', {
        params: { ad_account_id: filters.ad_account_id },
      })
      setAnotacoes(response.data?.anotacoes || [])
    } catch (error) {
      logUiError('dashboard-meta', 'meta-anotacoes-get', error)
      setAnotacoesError('Falha ao carregar anotacoes da conta selecionada.')
    } finally {
      setAnotacoesLoading(false)
    }
  }, [filters.ad_account_id])

  const loadFiltersRef = useRef(loadFilters)
  const loadDashboardDataRef = useRef(loadDashboardData)
  const loadSpecificDataRef = useRef(loadSpecificData)

  useEffect(() => {
    loadFiltersRef.current = loadFilters
  }, [loadFilters])

  useEffect(() => {
    loadDashboardDataRef.current = loadDashboardData
  }, [loadDashboardData])

  useEffect(() => {
    loadSpecificDataRef.current = loadSpecificData
  }, [loadSpecificData])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  useEffect(() => {
    if (activeTab !== 'specific') return
    loadSpecificData()
  }, [activeTab, loadSpecificData])

  useEffect(() => {
    loadAnotacoes()
  }, [loadAnotacoes])

  useEffect(() => {
    if (!sync1dRun?.id || sync1dRun?.is_finished) return undefined

    let canceled = false
    let timer
    let sinceId = 0

    const poll = async () => {
      try {
        const response = await api.get(`/api/meta/sync/${sync1dRun.id}/logs`, {
          params: { since_id: sinceId },
        })
        const payload = response.data || {}
        const incomingLogs = payload.logs || []
        if (incomingLogs.length > 0) {
          setSync1dLogs((prev) => [...prev, ...incomingLogs])
          sinceId = payload.next_since_id || sinceId
        }

        const run = payload.sync_run || {}
        const finished = !!run.is_finished
        setSync1dRun((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            status: run.status || prev.status,
            is_finished: finished,
          }
        })

        if (!finished && !canceled) {
          timer = window.setTimeout(poll, 2000)
        } else if (finished) {
          if (run.status === 'success') {
            setSync1dFeedback('Sincronização total de 1 dia concluída.')
            await Promise.allSettled([
              loadDashboardDataRef.current(),
              loadFiltersRef.current(),
              loadSpecificDataRef.current(),
            ])
          } else {
            setSync1dError('Sincronização total de 1 dia finalizou com erro.')
          }
        }
      } catch (error) {
        logUiError('dashboard-meta', 'meta-sync-1d-logs', error)
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
  }, [sync1dRun?.id, sync1dRun?.is_finished])

  const handleSyncTotal1d = async () => {
    if (sync1dInProgress) return
    setSync1dStarting(true)
    setSync1dError('')
    setSync1dFeedback('')
    setSync1dLogs([])
    try {
      const response = await api.post('/api/meta/sync/start/insights-1d')
      const syncRunId = response.data?.sync_run_id
      if (!syncRunId) {
        setSync1dError('Não foi possível iniciar a sincronização de 1 dia.')
        return
      }
      setSync1dRun({
        id: syncRunId,
        status: response.data?.status || 'pending',
        sync_scope: response.data?.sync_scope || 'all',
        is_finished: false,
      })
      setSync1dFeedback('Sincronização total de 1 dia iniciada.')
    } catch (error) {
      logUiError('dashboard-meta', 'meta-sync-1d-start', error)
      setSync1dError(error.response?.data?.detail || 'Falha ao iniciar sincronização de 1 dia.')
    } finally {
      setSync1dStarting(false)
    }
  }

  const updateFilter = (field, value) => {
    if (field === 'ad_account_id') {
      setAnotacaoTexto('')
      setAnotacoesError('')
      setAnotacoesFeedback('')
    }
    setFilters((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'ad_account_id') {
        next.campaign_id = ''
        next.adset_id = ''
        next.ad_id = ''
      }
      if (field === 'campaign_id') {
        next.adset_id = ''
        next.ad_id = ''
      }
      if (field === 'adset_id') {
        next.ad_id = ''
      }
      return next
    })
  }

  const handleSalvarAnotacao = async () => {
    const observacoes = anotacaoTexto.trim()
    if (!filters.ad_account_id) {
      setAnotacoesFeedback('')
      setAnotacoesError('Selecione um ad account para salvar anotacoes.')
      return
    }
    if (!observacoes) {
      setAnotacoesFeedback('')
      setAnotacoesError('Digite uma anotacao antes de salvar.')
      return
    }

    setAnotacoesSubmitting(true)
    setAnotacoesError('')
    setAnotacoesFeedback('')
    try {
      const response = await api.post('/api/meta/anotacoes', {
        id_meta_ad_account: filters.ad_account_id,
        observacoes,
      })
      const novaAnotacao = response.data?.anotacao
      if (novaAnotacao) {
        setAnotacoes((prev) => [novaAnotacao, ...prev])
      } else {
        await loadAnotacoes()
      }
      setAnotacaoTexto('')
      setAnotacoesFeedback('Anotação criada com sucesso.')
    } catch (error) {
      logUiError('dashboard-meta', 'meta-anotacoes-post', error)
      setAnotacoesError(error.response?.data?.detail || 'Falha ao salvar anotacao.')
    } finally {
      setAnotacoesSubmitting(false)
    }
  }

  const handleExcluirAnotacao = async (anotacaoId) => {
    if (!anotacaoId) return

    setAnotacaoDeletingId(anotacaoId)
    setAnotacoesError('')
    try {
      await api.delete(`/api/meta/anotacoes/${anotacaoId}`)
      setAnotacoes((prev) => prev.filter((item) => item.id !== anotacaoId))
    } catch (error) {
      logUiError('dashboard-meta', 'meta-anotacoes-delete', error)
      setAnotacoesError(error.response?.data?.detail || 'Falha ao excluir anotacao.')
    } finally {
      setAnotacaoDeletingId(null)
    }
  }

  const toggleSpecificOrdering = (field) => {
    const currentField = specificOrdering.startsWith('-') ? specificOrdering.slice(1) : specificOrdering
    const currentDesc = specificOrdering.startsWith('-')
    if (currentField === field) {
      setSpecificOrdering(currentDesc ? field : `-${field}`)
      return
    }
    setSpecificOrdering(SPECIFIC_DESCENDING_DEFAULTS.has(field) ? `-${field}` : field)
  }

  const specificSortIndicator = (field) => {
    const currentField = specificOrdering.startsWith('-') ? specificOrdering.slice(1) : specificOrdering
    const currentDesc = specificOrdering.startsWith('-')
    if (currentField !== field) return '↕'
    return currentDesc ? '↓' : '↑'
  }

  return (
    <section className="view-card">
      <h2>Dashboard Meta</h2>

      <div className="meta-tab-list" role="tablist" aria-label="Visões do dashboard Meta">
        <button
          id="meta-tab-general"
          type="button"
          role="tab"
          aria-selected={activeTab === 'general'}
          aria-controls="meta-panel-general"
          className={`meta-tab-btn ${activeTab === 'general' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          Geral
        </button>
        <button
          id="meta-tab-specific"
          type="button"
          role="tab"
          aria-selected={activeTab === 'specific'}
          aria-controls="meta-panel-specific"
          className={`meta-tab-btn ${activeTab === 'specific' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('specific')}
        >
          Específica
        </button>
      </div>

      <div className={`filter-grid meta-filter-grid ${activeTab === 'specific' ? 'is-specific' : ''}`}>
        <SearchableMetaFilter
          value={filters.ad_account_id}
          items={adAccountItems}
          onChange={(nextValue) => updateFilter('ad_account_id', nextValue)}
          placeholder="Todos os ad accounts"
          ariaLabel="Filtro de ad account"
          disabled={filtersLoading}
        />
        <SearchableMetaFilter
          value={filters.campaign_id}
          items={campaignItems}
          onChange={(nextValue) => updateFilter('campaign_id', nextValue)}
          placeholder="Todas as campaigns"
          ariaLabel="Filtro de campaign"
          disabled={filtersLoading}
        />
        <SearchableMetaFilter
          value={filters.adset_id}
          items={adsetItems}
          onChange={(nextValue) => updateFilter('adset_id', nextValue)}
          placeholder="Todos os adsets"
          ariaLabel="Filtro de adset"
          disabled={filtersLoading}
        />
        {activeTab === 'general' ? (
          <SearchableMetaFilter
            value={filters.ad_id}
            items={adItems}
            onChange={(nextValue) => updateFilter('ad_id', nextValue)}
            placeholder="Todos os ads"
            ariaLabel="Filtro de ads"
            disabled={filtersLoading}
          />
        ) : null}
        <input
          type="date"
          value={filters.date_start}
          onChange={(event) => updateFilter('date_start', event.target.value)}
          aria-label="Data inicial"
        />
        <input
          type="date"
          value={filters.date_end}
          onChange={(event) => updateFilter('date_end', event.target.value)}
          aria-label="Data final"
        />
      </div>

      {activeTab === 'general' ? (
        <div id="meta-panel-general" role="tabpanel" aria-labelledby="meta-tab-general" className="meta-tab-panel">
          <div className="chart-and-kpis">
            <article className="chart-card">
              <h3>Serie temporal de insights</h3>
              {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}
              {dataLoading ? (
                <p className="hint-neutral">Carregando dados...</p>
              ) : series.length === 0 ? (
                <div className="chart-placeholder">
                  <div className="axis-text">Sem dados para os filtros selecionados.</div>
                  <div className="axis-text">Eixo esquerdo: alcance / impressoes</div>
                  <div className="axis-text">Eixo direito: gasto / results</div>
                </div>
              ) : (
                <MetaTimeseriesChart series={chartSeries} />
              )}
            </article>

            <article className="kpis-card">
              <h3>KPIs</h3>
              <div className="meta-sync-1d-panel">
                <div className="meta-sync-1d-header">
                  <button
                    type="button"
                    className="primary-btn meta-sync-1d-btn"
                    onClick={handleSyncTotal1d}
                    disabled={sync1dStarting || sync1dInProgress}
                  >
                    <i className={`fa-solid ${sync1dInProgress ? 'fa-spinner fa-spin' : 'fa-rotate'}`} aria-hidden="true" />{' '}
                    {sync1dInProgress ? 'Sincronizando 1 dia...' : 'Sincronizar Total (1 dia)'}
                  </button>
                  {sync1dRun ? (
                    <span className={`sync-status-badge status-${sync1dRun.status || 'idle'}`}>{sync1dStatusLabel}</span>
                  ) : null}
                </div>
                <div
                  className="sync-progress-track meta-sync-1d-track"
                  role="progressbar"
                  aria-label="Progresso da sincronização total de 1 dia"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(sync1dProgress)}
                >
                  <div className="sync-progress-fill" style={{ width: `${sync1dProgress}%` }} />
                </div>
                <p className="sync-progress-value meta-sync-1d-value">{Math.round(sync1dProgress)}% concluído</p>
                {sync1dFeedback ? <p className="hint-ok meta-sync-1d-feedback">{sync1dFeedback}</p> : null}
                {sync1dError ? <p className="hint-error meta-sync-1d-feedback">{sync1dError}</p> : null}
              </div>
              <div className="kpi-grid">
                <article className="kpi-tile">
                  <p className="kpi-label">Gasto Total</p>
                  <p className="kpi-value">{formatCurrency(kpis?.gasto_total)}</p>
                </article>
                <article className="kpi-tile">
                  <p className="kpi-label">Impressão Total</p>
                  <p className="kpi-value">{formatNumber(kpis?.impressao_total)}</p>
                </article>
                <article className="kpi-tile">
                  <p className="kpi-label">Alcance Total</p>
                  <p className="kpi-value">{formatNumber(kpis?.alcance_total)}</p>
                </article>
                <article className="kpi-tile">
                  <p className="kpi-label">Resultados Totais</p>
                  <p className="kpi-value">{formatNumber(resultadosTotais)}</p>
                </article>
                <article className="kpi-tile">
                  <p className="kpi-label">CPR</p>
                  <p className="kpi-value">{cpr === null ? 'N/A' : formatCurrency(cpr)}</p>
                </article>
                <article className="kpi-tile">
                  <p className="kpi-label">CTR Médio</p>
                  <p className="kpi-value">{formatDecimal(kpis?.ctr_medio, 2)}%</p>
                </article>
                <article className="kpi-tile">
                  <p className="kpi-label">CPM Médio</p>
                  <p className="kpi-value">{formatCurrency(kpis?.cpm_medio)}</p>
                </article>
                <article className="kpi-tile">
                  <p className="kpi-label">CPC Médio</p>
                  <p className="kpi-value">{formatCurrency(kpis?.cpc_medio)}</p>
                </article>
                <article className="kpi-tile">
                  <p className="kpi-label">Frequência Média</p>
                  <p className="kpi-value">{formatDecimal(kpis?.frequencia_media, 2)}</p>
                </article>
                <article className="kpi-tile">
                  <p className="kpi-label">Correlação Gasto x Results</p>
                  <p className="kpi-value">{formatCorrelation(kpis?.correlacao_gasto_resultados)}</p>
                </article>
              </div>
            </article>
          </div>

          <div className="meta-notes-layout">
            <article className="meta-notes-card">
              <div className="meta-notes-header">
                <h3>Nova anotação</h3>
                {anotacoesFeedback ? <span className="meta-notes-inline-feedback">{anotacoesFeedback}</span> : null}
              </div>
              <p className="meta-notes-account">
                Conta selecionada: <strong>{selectedAdAccountLabel || 'Nenhuma conta selecionada'}</strong>
              </p>
              <textarea
                className="meta-notes-input"
                value={anotacaoTexto}
                onChange={(event) => setAnotacaoTexto(event.target.value)}
                placeholder="Escreva uma observacao sobre esta conta..."
                disabled={!filters.ad_account_id || anotacoesSubmitting}
              />
              <div className="meta-notes-actions">
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleSalvarAnotacao}
                  disabled={!filters.ad_account_id || anotacoesSubmitting}
                >
                  {anotacoesSubmitting ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
              {anotacoesError ? <p className="hint-error">{anotacoesError}</p> : null}
            </article>
            <article className="meta-notes-card">
              <h3>Anotações da conta</h3>
              {!filters.ad_account_id ? (
                <p className="hint-neutral">Selecione um ad account para visualizar as anotacoes.</p>
              ) : anotacoesLoading ? (
                <p className="hint-neutral">Carregando anotacoes...</p>
              ) : anotacoes.length === 0 ? (
                <p className="hint-neutral">Nenhuma anotacao cadastrada para esta conta.</p>
              ) : (
                <div className="meta-notes-list">
                  {anotacoes.map((item) => (
                    <article key={item.id} className="meta-note-item">
                      <button
                        type="button"
                        className="meta-note-delete-btn"
                        onClick={() => handleExcluirAnotacao(item.id)}
                        disabled={anotacaoDeletingId === item.id}
                        aria-label="Excluir anotação"
                        title="Excluir anotação"
                      >
                        <i
                          className={`fa-solid ${anotacaoDeletingId === item.id ? 'fa-spinner fa-spin' : 'fa-trash'}`}
                          aria-hidden="true"
                        />
                      </button>
                      <p>{item.observacoes}</p>
                      <small>{formatDateTime(item.data_criacao)}</small>
                    </article>
                  ))}
                </div>
              )}
            </article>
          </div>
        </div>
      ) : (
        <div id="meta-panel-specific" role="tabpanel" aria-labelledby="meta-tab-specific" className="meta-tab-panel">
          <div className="meta-specific-layout">
            <article className="chart-card">
              <h3>Gastos diários</h3>
              {specificErrorMsg ? <p className="hint-error">{specificErrorMsg}</p> : null}
              {specificLoading ? (
                <p className="hint-neutral">Carregando dados...</p>
              ) : specificChartSeries.every((row) => row.spend === null || row.spend === undefined) ? (
                <div className="chart-placeholder">
                  <div className="axis-text">Sem dados no período.</div>
                  <div className="axis-text">Eixo X: dia</div>
                  <div className="axis-text">Eixo Y: gasto</div>
                </div>
              ) : (
                <MetaSpendTimeseriesChart series={specificChartSeries} />
              )}
            </article>

            <article className="chart-card">
              <div className="meta-specific-table-header">
                <h3>Gasto por anúncio</h3>
                <span className="hint-neutral meta-specific-table-caption">
                  Total de anúncios no resultado: {formatNumber(sortedSpecificRows.length)}
                </span>
              </div>
              {specificErrorMsg ? <p className="hint-error">{specificErrorMsg}</p> : null}
              <div className="table-wrapper meta-specific-table-wrapper">
                <table className="media-table">
                  <thead>
                    <tr>
                      <th>Anúncio</th>
                      <th>
                        <button type="button" className="th-sort-btn" onClick={() => toggleSpecificOrdering('results')}>
                          Resultados <span>{specificSortIndicator('results')}</span>
                        </button>
                      </th>
                      <th>
                        <button type="button" className="th-sort-btn" onClick={() => toggleSpecificOrdering('spend')}>
                          Valor gasto <span>{specificSortIndicator('spend')}</span>
                        </button>
                      </th>
                      <th>
                        <button type="button" className="th-sort-btn" onClick={() => toggleSpecificOrdering('cpr')}>
                          CPR <span>{specificSortIndicator('cpr')}</span>
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {specificLoading ? (
                      <tr>
                        <td colSpan="4">Carregando dados...</td>
                      </tr>
                    ) : sortedSpecificRows.length === 0 ? (
                      <tr>
                        <td colSpan="4">Sem dados no período.</td>
                      </tr>
                    ) : (
                      sortedSpecificRows.map((row) => (
                        <tr key={row.ad_id}>
                          <td>{row.ad_name || row.ad_id}</td>
                          <td>{formatNumber(row.results)}</td>
                          <td>{formatCurrency(row.spend)}</td>
                          <td>{formatSpecificCpr(row.cpr)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
        </div>
      )}
    </section>
  )
}
