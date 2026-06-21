import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import SearchableSelect from '../components/SearchableSelect'
import { toSearchableItems } from '../components/searchableSelectUtils'
import api from '../lib/api'
import { daysAgo, formatCurrency, formatDecimal, formatNumber, logUiError, toInputDate } from './pageUtils'

const TABS = [
  ['overview', 'Visão Geral'],
  ['stability', 'Estabilidade'],
  ['funnel', 'Funil e Qualidade'],
  ['segments', 'Segmentações'],
  ['ab_tests', 'Testes A/B'],
  ['saturation', 'Saturação'],
  ['cohorts', 'Coortes'],
  ['trends', 'Tendência e Anomalias'],
  ['correlations', 'Correlação'],
  ['executive_insights', 'Insights Executivos'],
]

const CURRENCY_METRICS = new Set(['spend', 'cpc', 'cpm', 'cost_per_result'])
const PERCENT_METRICS = new Set(['ctr', 'click_to_result'])

function getDefaultDateRange() {
  return {
    date_start: toInputDate(daysAgo(30)),
    date_end: toInputDate(daysAgo(1)),
  }
}

function formatMetricValue(metric, value) {
  if (value === null || value === undefined) return 'N/A'
  if (CURRENCY_METRICS.has(metric)) return formatCurrency(value)
  if (PERCENT_METRICS.has(metric)) return `${formatDecimal(value, 2)}%`
  if (metric === 'frequency') return formatDecimal(value, 2)
  return formatNumber(value)
}

function EmptyState({ message }) {
  return (
    <div className="statistics-empty-state" role="status">
      <i className="fa-regular fa-folder-open" aria-hidden="true" />
      <p>{message}</p>
    </div>
  )
}

function OverviewPanel({ data }) {
  if (!data?.available) return <EmptyState message={data?.message || 'Não há dados para a visão geral.'} />
  return (
    <div className="statistics-kpi-grid">
      {data.metrics.map((metric) => (
        <article className="statistics-kpi-card" key={metric.metric}>
          <p className="statistics-kpi-label">{metric.label}</p>
          <p className="statistics-kpi-value">{formatMetricValue(metric.metric, metric.current_value)}</p>
          <span className={`statistics-change statistics-change-${metric.direction}`}>
            {metric.percent_change === null || metric.percent_change === undefined
              ? 'Sem base anterior'
              : `${metric.percent_change > 0 ? '+' : ''}${formatDecimal(metric.percent_change, 2)}%`}
          </span>
          <p className="statistics-card-note">{metric.interpretation}</p>
        </article>
      ))}
    </div>
  )
}

function StabilityPanel({ data }) {
  if (!data?.available) return <EmptyState message={data?.message} />
  return (
    <div className="statistics-table-wrap">
      <table className="statistics-table">
        <thead>
          <tr>
            <th>Entidade</th>
            <th>Métrica</th>
            <th>Média</th>
            <th>Mediana</th>
            <th>CV</th>
            <th>Classificação</th>
            <th>Dias zerados</th>
          </tr>
        </thead>
        <tbody>
          {data.items.slice(0, 30).map((item) => (
            <tr key={`${item.entity_id}-${item.metric}`}>
              <td>{item.entity_name}</td>
              <td>{item.metric_label}</td>
              <td>{formatMetricValue(item.metric, item.mean)}</td>
              <td>{formatMetricValue(item.metric, item.median)}</td>
              <td>{item.coefficient_of_variation === null ? 'N/A' : formatDecimal(item.coefficient_of_variation, 2)}</td>
              <td><span className="statistics-status-badge">{item.stability_label}</span></td>
              <td>{item.zero_result_days}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FunnelPanel({ data }) {
  if (!data?.available) return <EmptyState message={data?.message} />
  return (
    <div className="statistics-stack">
      <p className="statistics-inline-notice">{data.message}</p>
      <div className="statistics-flow-grid">
        {data.steps.map((step, index) => (
          <article className={`statistics-flow-card ${step.available ? '' : 'is-unavailable'}`} key={step.key}>
            <span className="statistics-flow-index">{index + 1}</span>
            <p>{step.label}</p>
            <strong>{step.available ? formatNumber(step.value) : 'Indisponível'}</strong>
            {step.note ? <small>{step.note}</small> : null}
          </article>
        ))}
      </div>
      <div className="statistics-compact-grid">
        {[...(data.rates || []), ...(data.costs || [])].map((item) => (
          <article className="statistics-summary-card" key={item.key}>
            <p>{item.label}</p>
            <strong>{item.available ? formatMetricValue(item.key, item.value) : 'N/A'}</strong>
          </article>
        ))}
      </div>
    </div>
  )
}

function AbTestsPanel({ data }) {
  if (!data?.available) return <EmptyState message={data?.message} />
  return (
    <div className="statistics-list-grid">
      {data.comparisons.map((item) => (
        <article className="statistics-detail-card" key={`${item.test_type}-${item.metric}`}>
          <div className="statistics-detail-card-header">
            <div>
              <p className="statistics-eyebrow">{item.test_type === 'two_proportion_z' ? 'Teste de proporção' : 'Teste de média'}</p>
              <h3>{item.metric_label}</h3>
            </div>
            <span className={`statistics-status-badge ${item.is_significant ? 'is-success' : ''}`}>
              {item.is_significant ? 'Significativo' : 'Sem significância'}
            </span>
          </div>
          <p>{item.entity_a.name} × {item.entity_b.name}</p>
          <div className="statistics-detail-metrics">
            <span>p-value <strong>{item.p_value === undefined ? 'N/A' : formatDecimal(item.p_value, 4)}</strong></span>
            <span>Confiança <strong>{item.confidence_level || 95}%</strong></span>
          </div>
          <p className="statistics-card-note">{item.interpretation}</p>
        </article>
      ))}
    </div>
  )
}

function SaturationPanel({ data }) {
  if (!data?.available) return <EmptyState message={data?.message} />
  return (
    <div className="statistics-list-grid">
      {data.items.map((item) => (
        <article className="statistics-detail-card" key={item.entity_id}>
          <div className="statistics-detail-card-header">
            <h3>{item.entity_name}</h3>
            <span className={`statistics-risk-badge statistics-risk-${item.status.replace(' ', '-')}`}>
              {item.saturation_score}/100 · {item.status}
            </span>
          </div>
          <p className="statistics-card-note">{item.interpretation}</p>
          <div className="statistics-evidence-list">
            {item.evidence.length ? item.evidence.map((evidence) => <span key={evidence}>{evidence}</span>) : <span>Sem sinais combinados</span>}
          </div>
        </article>
      ))}
    </div>
  )
}

function TrendsPanel({ data }) {
  if (!data?.available) return <EmptyState message={data?.message} />
  return (
    <div className="statistics-stack">
      <div className="statistics-compact-grid">
        {data.metrics.map((metric) => (
          <article className="statistics-summary-card" key={metric.metric}>
            <p>{metric.label}</p>
            <strong>{metric.available ? metric.trend : 'Indisponível'}</strong>
            <small>Inclinação: {metric.slope === null ? 'N/A' : formatDecimal(metric.slope, 2)}</small>
          </article>
        ))}
      </div>
      <section className="statistics-subsection">
        <h3>Anomalias detectadas</h3>
        {data.anomalies?.length ? (
          <div className="statistics-anomaly-list">
            {data.anomalies.map((item) => (
              <article key={`${item.date}-${item.metric}`}>
                <div>
                  <strong>{item.metric_label}</strong>
                  <span>{item.date}</span>
                </div>
                <p>{item.interpretation}</p>
                <span className="statistics-status-badge">z-score {formatDecimal(item.z_score, 2)}</span>
              </article>
            ))}
          </div>
        ) : <EmptyState message="Nenhuma anomalia forte foi detectada na amostra atual." />}
      </section>
    </div>
  )
}

function CorrelationsPanel({ data }) {
  if (!data?.available) return <EmptyState message={data?.message} />
  return (
    <div className="statistics-list-grid">
      {data.items.map((item) => (
        <article className="statistics-detail-card" key={`${item.metric_x}-${item.metric_y}`}>
          <p className="statistics-eyebrow">{item.direction} · {item.strength}</p>
          <h3>{item.metric_x_label} × {item.metric_y_label}</h3>
          <p className="statistics-correlation-value">{formatDecimal(item.correlation, 2)}</p>
          <p>{item.interpretation}</p>
          <small>{item.causality_warning}</small>
        </article>
      ))}
    </div>
  )
}

function InsightsPanel({ data }) {
  if (!data?.available) return <EmptyState message={data?.message} />
  return (
    <div className="statistics-list-grid">
      {data.items.map((item, index) => (
        <article className={`statistics-insight-card statistics-insight-${item.type}`} key={`${item.title}-${index}`}>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
          {item.evidence?.length ? (
            <div className="statistics-evidence-list">
              {item.evidence.map((evidence) => <span key={evidence}>{evidence}</span>)}
            </div>
          ) : null}
          <strong>{item.suggested_action}</strong>
        </article>
      ))}
    </div>
  )
}

function renderPanel(activeTab, analysis) {
  if (activeTab === 'overview') return <OverviewPanel data={analysis?.overview} />
  if (activeTab === 'stability') return <StabilityPanel data={analysis?.stability} />
  if (activeTab === 'funnel') return <FunnelPanel data={analysis?.funnel} />
  if (activeTab === 'ab_tests') return <AbTestsPanel data={analysis?.ab_tests} />
  if (activeTab === 'saturation') return <SaturationPanel data={analysis?.saturation} />
  if (activeTab === 'trends') return <TrendsPanel data={analysis?.trends} />
  if (activeTab === 'correlations') return <CorrelationsPanel data={analysis?.correlations} />
  if (activeTab === 'executive_insights') return <InsightsPanel data={analysis?.executive_insights} />
  return <EmptyState message={analysis?.[activeTab]?.message || 'Dados indisponíveis para esta análise.'} />
}

export default function AnaliseEstatisticaPage() {
  const defaultRange = useMemo(() => getDefaultDateRange(), [])
  const [filters, setFilters] = useState({
    ad_account_ids: [],
    campaign_ids: [],
    adset_ids: [],
    ad_ids: [],
    date_start: defaultRange.date_start,
    date_end: defaultRange.date_end,
    compare: true,
  })
  const [options, setOptions] = useState({ ad_accounts: [], campaigns: [], adsets: [], ads: [] })
  const [activeTab, setActiveTab] = useState('overview')
  const [analysis, setAnalysis] = useState(null)
  const [filtersLoading, setFiltersLoading] = useState(false)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const initialAnalysisLoaded = useRef(false)

  const items = useMemo(() => ({
    ad_accounts: toSearchableItems(options.ad_accounts, 'id_meta_ad_account'),
    campaigns: toSearchableItems(options.campaigns, 'id_meta_campaign'),
    adsets: toSearchableItems(options.adsets, 'id_meta_adset'),
    ads: toSearchableItems(options.ads, 'id_meta_ad'),
  }), [options])

  const loadFilters = useCallback(async () => {
    setFiltersLoading(true)
    try {
      const params = {}
      if (filters.ad_account_ids.length) params.ad_account_id = filters.ad_account_ids
      if (filters.campaign_ids.length) params.campaign_id = filters.campaign_ids
      if (filters.adset_ids.length) params.adset_id = filters.adset_ids
      const response = await api.get('/api/meta/filters', { params })
      setOptions({
        ad_accounts: response.data?.ad_accounts || [],
        campaigns: response.data?.campaigns || [],
        adsets: response.data?.adsets || [],
        ads: response.data?.ads || [],
      })
    } catch (error) {
      logUiError('analise-estatistica', 'meta-filters', error)
      setErrorMessage('Falha ao carregar os filtros da análise.')
    } finally {
      setFiltersLoading(false)
    }
  }, [filters.ad_account_ids, filters.adset_ids, filters.campaign_ids])

  const loadAnalysis = useCallback(async () => {
    setAnalysisLoading(true)
    setErrorMessage('')
    try {
      const params = {
        date_start: filters.date_start,
        date_end: filters.date_end,
        compare: filters.compare,
      }
      if (filters.ad_account_ids.length) params.ad_account_id = filters.ad_account_ids
      if (filters.campaign_ids.length) params.campaign_id = filters.campaign_ids
      if (filters.adset_ids.length) params.adset_id = filters.adset_ids
      if (filters.ad_ids.length) params.ad_id = filters.ad_ids
      const response = await api.get('/api/statistics/analysis', { params })
      setAnalysis(response.data)
    } catch (error) {
      logUiError('analise-estatistica', 'statistics-analysis', error)
      setErrorMessage(error.response?.data?.detail || 'Falha ao atualizar a análise estatística.')
      setAnalysis(null)
    } finally {
      setAnalysisLoading(false)
    }
  }, [filters])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  useEffect(() => {
    if (initialAnalysisLoaded.current) return
    initialAnalysisLoaded.current = true
    loadAnalysis()
  }, [loadAnalysis])

  const updateFilter = (field, value) => {
    setFilters((current) => {
      const next = { ...current, [field]: value }
      if (field === 'ad_account_ids') {
        next.campaign_ids = []
        next.adset_ids = []
        next.ad_ids = []
      } else if (field === 'campaign_ids') {
        next.adset_ids = []
        next.ad_ids = []
      } else if (field === 'adset_ids') {
        next.ad_ids = []
      }
      return next
    })
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    loadAnalysis()
  }

  return (
    <section className="view-card view-card-meta statistics-view">
      <header className="statistics-header">
        <div>
          <p className="statistics-eyebrow">Inteligência de mídia</p>
          <h2>Análise Estatística</h2>
          <p>Compare desempenho, estabilidade, qualidade e tendência das campanhas com base estatística.</p>
        </div>
      </header>

      <form className="statistics-filter-panel" onSubmit={handleSubmit}>
        <div className="statistics-filter-grid">
          <SearchableSelect
            value={filters.ad_account_ids}
            items={items.ad_accounts}
            onChange={(value) => updateFilter('ad_account_ids', value)}
            placeholder="Todas as contas"
            ariaLabel="Filtro estatístico de conta"
            disabled={filtersLoading}
            multiple
          />
          <SearchableSelect
            value={filters.campaign_ids}
            items={items.campaigns}
            onChange={(value) => updateFilter('campaign_ids', value)}
            placeholder="Todas as campanhas"
            ariaLabel="Filtro estatístico de campanha"
            disabled={filtersLoading}
            multiple
          />
          <SearchableSelect
            value={filters.adset_ids}
            items={items.adsets}
            onChange={(value) => updateFilter('adset_ids', value)}
            placeholder="Todos os conjuntos"
            ariaLabel="Filtro estatístico de conjunto"
            disabled={filtersLoading}
            multiple
          />
          <SearchableSelect
            value={filters.ad_ids}
            items={items.ads}
            onChange={(value) => updateFilter('ad_ids', value)}
            placeholder="Todos os anúncios"
            ariaLabel="Filtro estatístico de anúncio"
            disabled={filtersLoading}
            multiple
          />
          <input
            type="date"
            value={filters.date_start}
            onChange={(event) => updateFilter('date_start', event.target.value)}
            aria-label="Data inicial da análise estatística"
          />
          <input
            type="date"
            value={filters.date_end}
            onChange={(event) => updateFilter('date_end', event.target.value)}
            aria-label="Data final da análise estatística"
          />
        </div>
        <div className="statistics-filter-actions">
          <label className="statistics-compare-control">
            <input
              type="checkbox"
              checked={filters.compare}
              onChange={(event) => updateFilter('compare', event.target.checked)}
            />
            Comparar com período anterior
          </label>
          <button className="primary-btn" type="submit" disabled={analysisLoading}>
            {analysisLoading ? 'Atualizando...' : 'Atualizar análise'}
          </button>
        </div>
      </form>

      {errorMessage ? <p className="hint-error">{errorMessage}</p> : null}
      {analysis?.meta?.result_semantics ? <p className="statistics-inline-notice">{analysis.meta.result_semantics}</p> : null}

      <div className="statistics-tab-shell">
        <div className="statistics-tabs" role="tablist" aria-label="Seções da análise estatística">
          {TABS.map(([id, label]) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === id}
              className={activeTab === id ? 'is-active' : ''}
              key={id}
              onClick={() => setActiveTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="statistics-panel" role="tabpanel">
        {analysisLoading && !analysis ? <p className="hint-neutral">Calculando análise estatística...</p> : renderPanel(activeTab, analysis)}
      </div>
    </section>
  )
}
