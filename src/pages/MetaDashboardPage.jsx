import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import api from '../lib/api'
import {
  daysAgo,
  formatCorrelation,
  formatCurrency,
  formatDecimal,
  formatNumber,
  logUiError,
  toInputDate,
} from './pageUtils'

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

export default function MetaDashboardPage() {
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
  const chartSeries = useMemo(
    () => normalizeSeriesToDateRange(series, filters.date_start, filters.date_end),
    [series, filters.date_start, filters.date_end],
  )

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

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  useEffect(() => {
    loadDashboardData()
  }, [loadDashboardData])

  const updateFilter = (field, value) => {
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

  return (
    <section className="view-card">
      <h2>Dashboard Meta</h2>
      <div className="filter-grid">
        <select
          value={filters.ad_account_id}
          onChange={(event) => updateFilter('ad_account_id', event.target.value)}
          disabled={filtersLoading}
        >
          <option value="">Todos os ad accounts</option>
          {options.ad_accounts.map((row) => (
            <option key={row.id_meta_ad_account} value={row.id_meta_ad_account}>
              {row.name || row.id_meta_ad_account}
            </option>
          ))}
        </select>
        <select
          value={filters.campaign_id}
          onChange={(event) => updateFilter('campaign_id', event.target.value)}
          disabled={filtersLoading}
        >
          <option value="">Todas as campaigns</option>
          {options.campaigns.map((row) => (
            <option key={row.id_meta_campaign} value={row.id_meta_campaign}>
              {row.name || row.id_meta_campaign}
            </option>
          ))}
        </select>
        <select
          value={filters.adset_id}
          onChange={(event) => updateFilter('adset_id', event.target.value)}
          disabled={filtersLoading}
        >
          <option value="">Todos os adsets</option>
          {options.adsets.map((row) => (
            <option key={row.id_meta_adset} value={row.id_meta_adset}>
              {row.name || row.id_meta_adset}
            </option>
          ))}
        </select>
        <select
          value={filters.ad_id}
          onChange={(event) => updateFilter('ad_id', event.target.value)}
          disabled={filtersLoading}
        >
          <option value="">Todos os ads</option>
          {options.ads.map((row) => (
            <option key={row.id_meta_ad} value={row.id_meta_ad}>
              {row.name || row.id_meta_ad}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={filters.date_start}
          onChange={(event) => updateFilter('date_start', event.target.value)}
        />
        <input
          type="date"
          value={filters.date_end}
          onChange={(event) => updateFilter('date_end', event.target.value)}
        />
      </div>
      <div className="filter-actions">
        <button type="button" className="primary-btn" onClick={loadDashboardData} disabled={dataLoading}>
          {dataLoading ? 'Atualizando...' : 'Aplicar filtros'}
        </button>
      </div>

      <div className="chart-and-kpis">
        <article className="chart-card">
          <h3>Serie temporal de insights</h3>
          {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}
          {series.length === 0 ? (
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
    </section>
  )
}
