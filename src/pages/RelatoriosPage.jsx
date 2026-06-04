import { useCallback, useEffect, useMemo, useState } from 'react'
import SearchableSelect, { toSearchableItems } from '../components/SearchableSelect'
import api from '../lib/api'
import { daysAgo, formatCurrency, formatDecimal, formatNumber, logUiError, toInputDate } from './pageUtils'

function getDefaultReportDateRange() {
  const dateEnd = daysAgo(1)
  const dateStart = daysAgo(8)
  return {
    date_start: toInputDate(dateStart),
    date_end: toInputDate(dateEnd),
  }
}

const REPORT_METRICS = [
  {
    key: 'valor_usado',
    label: 'Valor usado',
    accent: 'primary',
    formatter: (value) => formatCurrency(value),
  },
  {
    key: 'resultados',
    label: 'Resultados',
    accent: 'primary',
    formatter: (value) => formatNumber(value),
  },
  {
    key: 'custo_por_resultado',
    label: 'Custo por resultado',
    formatter: (value) => (value === null || value === undefined ? 'N/A' : formatCurrency(value)),
  },
  {
    key: 'cpc_link',
    label: 'CPC (custo por clique no link)',
    formatter: (value) => (value === null || value === undefined ? 'N/A' : formatCurrency(value)),
  },
  {
    key: 'ctr_link',
    label: 'CTR (taxa de cliques no link)',
    formatter: (value) => `${formatDecimal(value, 2)}%`,
  },
  {
    key: 'taxa_video_3s_por_impressoes',
    label: 'Visualizaram o video por 3 segundos / Impressoes',
    formatter: (value) => (value === null || value === undefined ? 'N/A' : `${formatDecimal(value, 2)}%`),
  },
  {
    key: 'tx_conversao_envio_mensagem',
    label: 'Tx de conversao Envio de Mensagem',
    formatter: (value) => (value === null || value === undefined ? 'N/A' : `${formatDecimal(value, 2)}%`),
  },
  {
    key: 'cpm',
    label: 'CPM',
    formatter: (value) => formatCurrency(value),
  },
  {
    key: 'alcance',
    label: 'Alcance',
    formatter: (value) => formatNumber(value),
  },
  {
    key: 'frequencia',
    label: 'Frequencia',
    formatter: (value) => formatDecimal(value, 2),
  },
  {
    key: 'impressoes',
    label: 'Impressoes',
    formatter: (value) => formatNumber(value),
  },
  {
    key: 'cliques_link',
    label: 'Cliques no link',
    formatter: (value) => formatNumber(value),
  },
]

function findItemLabel(items, value, fallback) {
  if (!value) return fallback
  const selected = items.find((item) => item.id === value)
  return selected?.label || value
}

export default function RelatoriosPage() {
  const defaultDateRange = useMemo(() => getDefaultReportDateRange(), [])
  const [filters, setFilters] = useState({
    ad_account_id: '',
    campaign_id: '',
    date_start: defaultDateRange.date_start,
    date_end: defaultDateRange.date_end,
  })
  const [options, setOptions] = useState({ ad_accounts: [], campaigns: [] })
  const [metrics, setMetrics] = useState(null)
  const [filtersLoading, setFiltersLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const adAccountItems = useMemo(
    () => toSearchableItems(options.ad_accounts, 'id_meta_ad_account'),
    [options.ad_accounts],
  )
  const campaignItems = useMemo(
    () => toSearchableItems(options.campaigns, 'id_meta_campaign'),
    [options.campaigns],
  )
  const selectedAccountLabel = useMemo(
    () => findItemLabel(adAccountItems, filters.ad_account_id, 'Todas as contas acessiveis'),
    [adAccountItems, filters.ad_account_id],
  )
  const selectedCampaignLabel = useMemo(
    () => findItemLabel(campaignItems, filters.campaign_id, 'Todas as campaigns da selecao'),
    [campaignItems, filters.campaign_id],
  )

  const loadFilters = useCallback(async () => {
    setFiltersLoading(true)
    setErrorMsg('')
    try {
      const params = {}
      if (filters.ad_account_id) params.ad_account_id = filters.ad_account_id
      const response = await api.get('/api/meta/filters', { params })
      setOptions({
        ad_accounts: response.data?.ad_accounts || [],
        campaigns: response.data?.campaigns || [],
  })
    } catch (error) {
      logUiError('relatorios', 'meta-filters', error)
      setErrorMsg('Falha ao carregar os filtros de relatorios.')
    } finally {
      setFiltersLoading(false)
    }
  }, [filters.ad_account_id])

  const loadReport = useCallback(async () => {
    setReportLoading(true)
    setErrorMsg('')
    try {
      const params = {
        date_start: filters.date_start,
        date_end: filters.date_end,
      }
      if (filters.ad_account_id) params.ad_account_id = filters.ad_account_id
      if (filters.campaign_id) params.campaign_id = filters.campaign_id
      const response = await api.get('/api/meta/report-summary', { params })
      setMetrics(response.data?.metrics || null)
    } catch (error) {
      logUiError('relatorios', 'meta-report-summary', error)
      setErrorMsg(error.response?.data?.detail || 'Falha ao carregar o relatorio.')
      setMetrics(null)
    } finally {
      setReportLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  const updateFilter = (field, value) => {
    setFilters((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'ad_account_id') {
        next.campaign_id = ''
      }
      return next
    })
  }

  return (
    <section className="view-card view-card-meta reports-view">
      <div className="reports-header">
        <div>
          <h2>Relatorios</h2>
          <p className="hint-neutral reports-subtitle">
            Acompanhe um resumo consolidado por conta de anuncio e campanha com foco nas metricas-chave.
          </p>
        </div>
      </div>

      <div className="filter-grid meta-filter-grid reports-filter-grid">
        <SearchableSelect
          value={filters.ad_account_id}
          items={adAccountItems}
          onChange={(nextValue) => updateFilter('ad_account_id', nextValue)}
          placeholder="Todas as contas"
          ariaLabel="Filtro de conta de anuncio"
          disabled={filtersLoading}
        />
        <SearchableSelect
          value={filters.campaign_id}
          items={campaignItems}
          onChange={(nextValue) => updateFilter('campaign_id', nextValue)}
          placeholder="Todas as campaigns"
          ariaLabel="Filtro de campaign"
          disabled={filtersLoading}
        />
        <input
          type="date"
          value={filters.date_start}
          onChange={(event) => updateFilter('date_start', event.target.value)}
          aria-label="Data inicial do relatorio"
        />
        <input
          type="date"
          value={filters.date_end}
          onChange={(event) => updateFilter('date_end', event.target.value)}
          aria-label="Data final do relatorio"
        />
      </div>

      <div className="reports-context-grid">
        <article className="reports-context-card">
          <p className="reports-context-label">Conta selecionada</p>
          <p className="reports-context-value">{selectedAccountLabel}</p>
        </article>
        <article className="reports-context-card">
          <p className="reports-context-label">Campanha selecionada</p>
          <p className="reports-context-value">{selectedCampaignLabel}</p>
        </article>
        <article className="reports-context-card">
          <p className="reports-context-label">Periodo</p>
          <p className="reports-context-value">
            {filters.date_start} ate {filters.date_end}
          </p>
        </article>
      </div>

      {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}

      {reportLoading ? (
        <p className="hint-neutral">Carregando relatorio...</p>
      ) : (
        <div className="reports-metrics-grid">
          {REPORT_METRICS.map((metric) => (
            <article
              key={metric.key}
              className={`reports-metric-card ${metric.accent ? `reports-metric-card-${metric.accent}` : ''}`}
            >
              <p className="reports-metric-label">{metric.label}</p>
              <p className="reports-metric-value">{metric.formatter(metrics?.[metric.key])}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
