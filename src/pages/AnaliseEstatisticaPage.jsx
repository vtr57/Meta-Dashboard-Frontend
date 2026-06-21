import Chart from 'chart.js/auto'
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
  ['time_series', 'Análise Temporal'],
  ['trends', 'Tendência e Anomalias'],
  ['correlations', 'Correlação'],
  ['clustering', 'Clusterização'],
  ['executive_insights', 'Insights Executivos'],
]

const CURRENCY_METRICS = new Set(['spend', 'cpc', 'cpm', 'cost_per_result', 'cpl'])
const PERCENT_METRICS = new Set(['ctr', 'click_to_result', 'conversion_rate'])
const CLUSTER_COLORS = ['#0b4ea2', '#2f8b58', '#d18a16', '#8a4fb5', '#c94b4b']

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

function formatTimeSeriesValue(metric, value) {
  if (value === null || value === undefined) return 'N/A'
  if (CURRENCY_METRICS.has(metric)) return formatCurrency(value)
  if (PERCENT_METRICS.has(metric)) return `${formatDecimal(Number(value) * 100, 2)}%`
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

function getCorrelationTone(value) {
  if (value === null || value === undefined) return 'unavailable'
  const absolute = Math.abs(value)
  const intensity = absolute >= 0.6 ? 'strong' : absolute >= 0.3 ? 'moderate' : 'weak'
  if (value > 0) return `positive-${intensity}`
  if (value < 0) return `negative-${intensity}`
  return 'neutral'
}

function getCorrelationStrength(value) {
  if (value === null || value === undefined) return 'indisponível'
  const absolute = Math.abs(value)
  if (absolute < 0.2) return 'muito fraca'
  if (absolute < 0.4) return 'fraca'
  if (absolute < 0.6) return 'moderada'
  if (absolute < 0.8) return 'forte'
  return 'muito forte'
}

function getCorrelationDirection(value) {
  if (value === null || value === undefined || value === 0) return 'neutra'
  return value > 0 ? 'positiva' : 'negativa'
}

function buildCorrelationCell(value, strength, direction) {
  return {
    value: value ?? null,
    strength: strength || getCorrelationStrength(value),
    direction: direction || getCorrelationDirection(value),
  }
}

function normalizeCorrelationData(data) {
  if (!data) return data

  const metrics = Array.isArray(data.metrics) ? data.metrics : []
  const matrix = Array.isArray(data.matrix) ? data.matrix : []

  if (metrics.length && matrix.length) {
    return {
      ...data,
      metrics,
      matrix,
      unavailable_metrics: Array.isArray(data.unavailable_metrics) ? data.unavailable_metrics : [],
    }
  }

  const items = Array.isArray(data.items) ? data.items : []
  if (!items.length) {
    return {
      ...data,
      metrics: [],
      matrix: [],
      unavailable_metrics: Array.isArray(data.unavailable_metrics) ? data.unavailable_metrics : [],
    }
  }

  const metricMap = new Map()
  const correlationMap = new Map()

  items.forEach((item) => {
    if (item.metric_x) {
      metricMap.set(item.metric_x, {
        metric: item.metric_x,
        label: item.metric_x_label || item.metric_x,
      })
    }
    if (item.metric_y) {
      metricMap.set(item.metric_y, {
        metric: item.metric_y,
        label: item.metric_y_label || item.metric_y,
      })
    }

    if (!item.metric_x || !item.metric_y) return
    const cell = buildCorrelationCell(item.correlation, item.strength, item.direction)
    correlationMap.set(`${item.metric_x}:${item.metric_y}`, cell)
    correlationMap.set(`${item.metric_y}:${item.metric_x}`, cell)
  })

  const normalizedMetrics = Array.from(metricMap.values())
  const normalizedMatrix = normalizedMetrics.map((rowMetric) => ({
    metric: rowMetric.metric,
    label: rowMetric.label,
    cells: normalizedMetrics.map((columnMetric) => {
      const cell = correlationMap.get(`${rowMetric.metric}:${columnMetric.metric}`)
      return {
        metric: columnMetric.metric,
        ...buildCorrelationCell(cell?.value, cell?.strength, cell?.direction),
      }
    }),
  }))

  return {
    ...data,
    metrics: normalizedMetrics,
    matrix: normalizedMatrix,
    unavailable_metrics: Array.isArray(data.unavailable_metrics) ? data.unavailable_metrics : [],
  }
}

function CorrelationsPanel({ data }) {
  const normalizedData = normalizeCorrelationData(data)

  if (!normalizedData?.available) return <EmptyState message={normalizedData?.message} />
  if (!normalizedData.metrics.length || !normalizedData.matrix.length) {
    return <EmptyState message={normalizedData.message || 'A matriz de correlação ainda não está disponível para esta amostra.'} />
  }

  return (
    <section className="statistics-correlation-section">
      <header className="statistics-correlation-header">
        <div>
          <p className="statistics-eyebrow">Coeficiente de Pearson</p>
          <h3>Matriz de correlação</h3>
          <p>{normalizedData.sample_size} dias agregados no período selecionado.</p>
        </div>
        <div className="statistics-correlation-legend" aria-label="Legenda da correlação">
          <span className="is-negative">-1 negativa</span>
          <span className="is-neutral">0 neutra</span>
          <span className="is-positive">+1 positiva</span>
        </div>
      </header>

      <div className="statistics-correlation-table-wrap">
        <table className="statistics-correlation-table" aria-label="Matriz de correlação das métricas">
          <thead>
            <tr>
              <th scope="col">Métrica</th>
              {normalizedData.metrics.map((metric) => (
                <th scope="col" key={metric.metric} title={metric.label}>{metric.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {normalizedData.matrix.map((row) => (
              <tr key={row.metric}>
                <th scope="row">{row.label}</th>
                {row.cells.map((cell) => {
                  const column = normalizedData.metrics.find((metric) => metric.metric === cell.metric)
                  const formatted = cell.value === null || cell.value === undefined
                    ? '—'
                    : formatDecimal(cell.value, 2)
                  const description = cell.value === null || cell.value === undefined
                    ? `${row.label} × ${column?.label}: correlação indisponível`
                    : `${row.label} × ${column?.label}: ${formatted}, correlação ${cell.strength} ${cell.direction}`
                  return (
                    <td
                      className={`statistics-correlation-cell is-${getCorrelationTone(cell.value)}`}
                      key={cell.metric}
                      title={description}
                      aria-label={description}
                    >
                      {formatted}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="statistics-correlation-footer">
        <p><i className="fa-solid fa-circle-info" aria-hidden="true" /> Correlação não implica causalidade.</p>
        {normalizedData.unavailable_metrics?.length ? (
          <details>
            <summary>
              {normalizedData.unavailable_metrics.length} {normalizedData.unavailable_metrics.length === 1 ? 'métrica' : 'métricas'} fora da matriz
            </summary>
            <ul>
              {normalizedData.unavailable_metrics.map((metric) => (
                <li key={metric.metric}>
                  <strong>{metric.label}:</strong> {metric.reason}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </section>
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

function ClusterScatterPlot({ data }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    chartRef.current?.destroy()
    chartRef.current = null
    if (!data?.available || !canvasRef.current || !data.points?.length) return undefined

    const grouped = data.points.reduce((groups, point) => {
      const clusterId = Number(point.cluster_id || 0)
      groups[clusterId] = groups[clusterId] || []
      groups[clusterId].push({
        x: point.x,
        y: point.y,
        entityName: point.name,
      })
      return groups
    }, {})
    const context = canvasRef.current.getContext('2d')
    chartRef.current = new Chart(context, {
      type: 'scatter',
      data: {
        datasets: Object.entries(grouped).map(([clusterId, points]) => ({
          label: `Cluster ${Number(clusterId) + 1}`,
          data: points,
          backgroundColor: CLUSTER_COLORS[Number(clusterId) % CLUSTER_COLORS.length],
          borderColor: '#ffffff',
          borderWidth: 1,
          pointRadius: 5,
          pointHoverRadius: 7,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, boxWidth: 8 },
          },
          tooltip: {
            callbacks: {
              label: (contextValue) => {
                const point = contextValue.raw
                return `${point.entityName}: ${formatDecimal(point.x, 2)}, ${formatDecimal(point.y, 2)}`
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: 'PCA 1' },
            grid: { color: 'rgba(88, 118, 155, 0.12)' },
          },
          y: {
            title: { display: true, text: 'PCA 2' },
            grid: { color: 'rgba(88, 118, 155, 0.12)' },
          },
        },
      },
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [data])

  if (!data?.available) return <EmptyState message={data?.message || 'PCA indisponível para esta amostra.'} />
  return (
    <div className="statistics-cluster-chart" aria-label="Gráfico PCA dos clusters">
      <canvas ref={canvasRef} />
    </div>
  )
}

function ClusteringPanel({
  data,
  config,
  onConfigChange,
  onRefresh,
  loading,
  errorMessage,
}) {
  if (loading && !data) return <p className="hint-neutral">Agrupando entidades por padrões de desempenho...</p>

  return (
    <div className="statistics-stack">
      <section className="statistics-cluster-header">
        <div>
          <p className="statistics-eyebrow">Análise exploratória</p>
          <h3>Clusterização</h3>
          <p>Agrupe campanhas, conjuntos e anúncios para encontrar oportunidades e riscos semelhantes.</p>
        </div>
        <div className="statistics-cluster-controls">
          <label>
            <span>Tipo de entidade</span>
            <select
              value={config.entity_type}
              onChange={(event) => onConfigChange('entity_type', event.target.value)}
            >
              <option value="campaign">Campanhas</option>
              <option value="adset">Conjuntos</option>
              <option value="ad">Anúncios</option>
              <option value="lead" disabled>Leads — indisponível</option>
            </select>
          </label>
          <label>
            <span>Algoritmo</span>
            <select value={config.algorithm} disabled>
              <option value="kmeans">K-means</option>
            </select>
          </label>
          <label>
            <span>Clusters</span>
            <select
              value={config.clusters}
              onChange={(event) => onConfigChange('clusters', Number(event.target.value))}
            >
              {[2, 3, 4, 5].map((value) => <option value={value} key={value}>{value}</option>)}
            </select>
          </label>
          <label className="statistics-normalize-control">
            <input
              type="checkbox"
              checked={config.normalize}
              onChange={(event) => onConfigChange('normalize', event.target.checked)}
            />
            Normalizar métricas
          </label>
          <button className="primary-btn" type="button" onClick={onRefresh} disabled={loading}>
            {loading ? 'Analisando...' : 'Analisar grupos'}
          </button>
        </div>
      </section>

      {errorMessage ? <p className="hint-error">{errorMessage}</p> : null}
      {!data?.available ? (
        <EmptyState message={data?.message || 'Carregue a clusterização para visualizar os grupos.'} />
      ) : (
        <>
          {data.warnings?.length ? (
            <div className="statistics-cluster-warnings" role="status">
              {data.warnings.map((warning) => (
                <p key={warning}><i className="fa-solid fa-circle-info" aria-hidden="true" />{warning}</p>
              ))}
            </div>
          ) : null}

          <div className="statistics-cluster-summary">
            <article className="statistics-summary-card">
              <p>Entidades analisadas</p>
              <strong>{formatNumber(data.summary?.total_entities)}</strong>
            </article>
            <article className="statistics-summary-card">
              <p>Clusters encontrados</p>
              <strong>{formatNumber(data.summary?.clusters_count)}</strong>
            </article>
            <article className="statistics-summary-card">
              <p>Mais eficiente</p>
              <strong>{data.summary?.most_efficient_cluster_label || 'N/A'}</strong>
            </article>
            <article className="statistics-summary-card">
              <p>Maior risco</p>
              <strong>{data.summary?.highest_risk_cluster_label || 'N/A'}</strong>
            </article>
          </div>

          <div className="statistics-feature-row" aria-label="Features utilizadas">
            <strong>Features</strong>
            {data.features_used?.map((feature) => <span key={feature.key}>{feature.label}</span>)}
          </div>

          <section className="statistics-cluster-section">
            <div className="statistics-section-heading">
              <div>
                <h3>Mapa dos grupos</h3>
                <p>Proximidade no gráfico indica perfis de desempenho semelhantes, não causalidade.</p>
              </div>
              {data.pca?.explained_variance_ratio?.length ? (
                <span className="statistics-status-badge">
                  Variância explicada {formatDecimal(
                    data.pca.explained_variance_ratio.reduce((total, value) => total + value, 0) * 100,
                    1,
                  )}%
                </span>
              ) : null}
            </div>
            <ClusterScatterPlot data={data.pca} />
          </section>

          <div className="statistics-cluster-grid">
            {data.clusters?.map((cluster) => (
              <article className="statistics-cluster-card" key={cluster.cluster_id}>
                <header>
                  <div>
                    <p className="statistics-eyebrow">Cluster {cluster.cluster_id + 1}</p>
                    <h3>{cluster.label}</h3>
                  </div>
                  <span
                    className="statistics-cluster-dot"
                    style={{ backgroundColor: CLUSTER_COLORS[cluster.cluster_id % CLUSTER_COLORS.length] }}
                    aria-label={`${cluster.size} entidades`}
                  />
                </header>
                <p>{cluster.interpretation}</p>
                <div className="statistics-cluster-metrics">
                  <span>Entidades <strong>{cluster.size}</strong></span>
                  <span>CTR médio <strong>{formatMetricValue('ctr', cluster.summary?.avg_ctr)}</strong></span>
                  <span>Resultados <strong>{formatMetricValue('results', cluster.summary?.avg_results)}</strong></span>
                  <span>Custo/resultado <strong>{formatMetricValue('cost_per_result', cluster.summary?.avg_cost_per_result)}</strong></span>
                </div>
                <strong className="statistics-cluster-action">{cluster.suggested_action}</strong>
              </article>
            ))}
          </div>

          <section className="statistics-cluster-section">
            <div className="statistics-section-heading">
              <div>
                <h3>Entidades clusterizadas</h3>
                <p>Detalhes consolidados do período e distância relativa ao centro do grupo.</p>
              </div>
            </div>
            <div className="statistics-table-wrap">
              <table className="statistics-table statistics-cluster-table">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Cluster</th>
                    <th>Investimento</th>
                    <th>Impressões</th>
                    <th>Cliques</th>
                    <th>CTR</th>
                    <th>CPC</th>
                    <th>Resultados</th>
                    <th>Custo/resultado</th>
                    <th>Conversão</th>
                    <th>Frequência</th>
                    <th>Distância</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items?.map((item) => (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>
                        <span className="statistics-cluster-id">
                          <i
                            style={{ backgroundColor: CLUSTER_COLORS[item.cluster_id % CLUSTER_COLORS.length] }}
                            aria-hidden="true"
                          />
                          {item.cluster_id + 1}
                        </span>
                      </td>
                      <td>{formatMetricValue('spend', item.spend)}</td>
                      <td>{formatMetricValue('impressions', item.impressions)}</td>
                      <td>{formatMetricValue('clicks', item.clicks)}</td>
                      <td>{formatMetricValue('ctr', item.ctr)}</td>
                      <td>{formatMetricValue('cpc', item.cpc)}</td>
                      <td>{formatMetricValue('results', item.results)}</td>
                      <td>{formatMetricValue('cost_per_result', item.cost_per_result)}</td>
                      <td>{formatMetricValue('conversion_rate', item.conversion_rate)}</td>
                      <td>{formatMetricValue('frequency', item.frequency)}</td>
                      <td>{formatDecimal(item.cluster_distance, 3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function TimeSeriesChart({ data }) {
  const canvasRef = useRef(null)
  const chartRef = useRef(null)

  useEffect(() => {
    chartRef.current?.destroy()
    chartRef.current = null
    if (!data?.daily_series?.length || !canvasRef.current) return undefined

    const observedLabels = data.daily_series.map((point) => point.date)
    const forecastPoints = data.forecast?.points || []
    const forecastLabels = forecastPoints.map((point) => point.date)
    const labels = [...observedLabels, ...forecastLabels]
    const observedValues = data.daily_series.map((point) => point[data.metric])
    const movingAverage = data.moving_averages?.['7']?.points?.map((point) => point.moving_average) || []
    const forecastValues = [
      ...new Array(Math.max(observedValues.length - 1, 0)).fill(null),
      observedValues.at(-1) ?? null,
      ...forecastPoints.map((point) => point.predicted_value),
    ]
    const anomalyMap = new Map(
      (data.anomalies || [])
        .filter((item) => item.metric === data.metric)
        .map((item) => [item.date, item.value]),
    )
    const context = canvasRef.current.getContext('2d')
    if (!context) return undefined
    chartRef.current = new Chart(context, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: data.meta?.metric_label || data.metric,
            data: [...observedValues, ...new Array(forecastLabels.length).fill(null)],
            borderColor: '#0b4ea2',
            backgroundColor: 'rgba(11, 78, 162, 0.10)',
            borderWidth: 2,
            pointRadius: 2.5,
            tension: 0.28,
          },
          {
            label: 'Média móvel 7 dias',
            data: [...movingAverage, ...new Array(forecastLabels.length).fill(null)],
            borderColor: '#2f8b58',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.28,
          },
          {
            label: 'Previsão',
            data: forecastValues,
            borderColor: '#d18a16',
            borderDash: [6, 5],
            borderWidth: 2,
            pointRadius: 2.5,
            tension: 0.15,
          },
          {
            label: 'Anomalias',
            data: labels.map((label) => anomalyMap.get(label) ?? null),
            showLine: false,
            pointRadius: 6,
            pointHoverRadius: 8,
            pointBackgroundColor: '#c94b4b',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { usePointStyle: true, boxWidth: 8 },
          },
          tooltip: {
            callbacks: {
              label: (contextValue) => (
                `${contextValue.dataset.label}: ${formatTimeSeriesValue(data.metric, contextValue.raw)}`
              ),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 10 },
          },
          y: {
            beginAtZero: false,
            grid: { color: 'rgba(88, 118, 155, 0.12)' },
          },
        },
      },
    })

    return () => {
      chartRef.current?.destroy()
      chartRef.current = null
    }
  }, [data])

  if (!data?.daily_series?.length) {
    return <EmptyState message="Não há dados diários suficientes para análise temporal." />
  }
  return (
    <div className="statistics-time-chart" aria-label="Série temporal, média móvel, previsão e anomalias">
      <canvas ref={canvasRef} />
    </div>
  )
}

function TimeSeriesPanel({
  data,
  config,
  onConfigChange,
  onRefresh,
  loading,
  errorMessage,
}) {
  if (loading && !data) return <p className="hint-neutral">Calculando tendências e projeções...</p>

  const summary = data?.summary || {}
  const trend = data?.trend || {}
  const goal = data?.goal_projection || {}
  const forecastDays = data?.forecast?.forecast_days || config.forecast_days

  return (
    <div className="statistics-stack">
      <section className="statistics-time-header">
        <div>
          <p className="statistics-eyebrow">Série diária e planejamento</p>
          <h3>Análise Temporal e Previsão</h3>
          <p>Entenda tendências, sazonalidade, previsões e anomalias com base nos dados diários de mídia.</p>
        </div>
        <div className="statistics-time-controls">
          <label>
            <span>Métrica principal</span>
            <select value={config.metric} onChange={(event) => onConfigChange('metric', event.target.value)}>
              <option value="spend">Investimento</option>
              <option value="leads">Leads (Resultados)</option>
              <option value="cpl">CPL (Custo por resultado)</option>
              <option value="ctr">CTR</option>
              <option value="cpc">CPC</option>
              <option value="cpm">CPM</option>
              <option value="frequency">Frequência</option>
              <option value="conversions">Conversões (Resultados)</option>
              <option value="conversion_rate">Taxa de conversão</option>
            </select>
          </label>
          <label>
            <span>Previsão</span>
            <select
              value={config.forecast_days}
              onChange={(event) => onConfigChange('forecast_days', Number(event.target.value))}
            >
              <option value={7}>7 dias</option>
              <option value={14}>14 dias</option>
              <option value={30}>30 dias</option>
            </select>
          </label>
          <label>
            <span>Meta de leads</span>
            <input
              type="number"
              min="1"
              step="1"
              value={config.goal_leads}
              onChange={(event) => onConfigChange('goal_leads', event.target.value)}
              placeholder="Opcional"
            />
          </label>
          <button className="primary-btn" type="button" onClick={onRefresh} disabled={loading}>
            {loading ? 'Calculando...' : 'Atualizar previsão'}
          </button>
        </div>
      </section>

      {errorMessage ? <p className="hint-error">{errorMessage}</p> : null}
      {data?.meta?.result_semantics ? <p className="statistics-inline-notice">{data.meta.result_semantics}</p> : null}
      {data?.warnings?.length ? (
        <div className="statistics-time-warnings" role="status">
          {data.warnings.map((warning) => (
            <p key={warning}><i className="fa-solid fa-circle-info" aria-hidden="true" />{warning}</p>
          ))}
        </div>
      ) : null}

      {!data?.daily_series?.length ? (
        <EmptyState message="Não há dados diários suficientes para análise temporal." />
      ) : (
        <>
          <div className="statistics-time-summary">
            <article className="statistics-summary-card">
              <p>Tendência</p>
              <strong>{trend.available ? trend.interpretation : 'Amostra insuficiente'}</strong>
              <small>{trend.strength ? `Força ${trend.strength}` : 'São necessários 3 dias válidos.'}</small>
            </article>
            <article className="statistics-summary-card">
              <p>Média do período</p>
              <strong>{formatTimeSeriesValue(data.metric, summary.average)}</strong>
              <small>{summary.valid_metric_points || 0} pontos válidos</small>
            </article>
            <article className="statistics-summary-card">
              <p>Média móvel 7 dias</p>
              <strong>{formatTimeSeriesValue(data.metric, summary.moving_average_7d)}</strong>
              <small>Janela completa mais recente</small>
            </article>
            <article className="statistics-summary-card">
              <p>Melhor dia observado</p>
              <strong>{summary.best_weekday || 'Amostra insuficiente'}</strong>
              <small>Comparação pelas médias disponíveis</small>
            </article>
            <article className="statistics-summary-card">
              <p>Anomalias</p>
              <strong>{formatNumber(summary.anomalies_count || 0)}</strong>
              <small>Z-score absoluto a partir de 2,5</small>
            </article>
            <article className="statistics-summary-card">
              <p>Previsão · {forecastDays} dias</p>
              <strong>{formatTimeSeriesValue(data.metric, summary.forecast_total)}</strong>
              <small>{data.forecast?.confidence ? `Confiança ${data.forecast.confidence}` : 'Indisponível'}</small>
            </article>
          </div>

          <section className="statistics-time-section">
            <div className="statistics-section-heading">
              <div>
                <h3>Evolução e previsão</h3>
                <p>Linha diária, média móvel de 7 dias e projeção simples da métrica selecionada.</p>
              </div>
            </div>
            <TimeSeriesChart data={data} />
          </section>

          {goal.available ? (
            <section className="statistics-time-section">
              <div className="statistics-section-heading">
                <div>
                  <h3>Investimento para a meta</h3>
                  <p>{goal.interpretation}</p>
                </div>
                <span className="statistics-status-badge">Confiança {goal.confidence}</span>
              </div>
              <div className="statistics-time-scenarios">
                <article><span>Otimista</span><strong>{formatCurrency(goal.scenarios.optimistic)}</strong></article>
                <article><span>Base</span><strong>{formatCurrency(goal.scenarios.base)}</strong></article>
                <article><span>Conservador</span><strong>{formatCurrency(goal.scenarios.conservative)}</strong></article>
              </div>
            </section>
          ) : null}

          <section className="statistics-time-section">
            <div className="statistics-section-heading">
              <div>
                <h3>Sazonalidade semanal</h3>
                <p>{data.seasonality?.interpretation}</p>
              </div>
            </div>
            <div className="statistics-table-wrap">
              <table className="statistics-table statistics-seasonality-table">
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Dias analisados</th>
                    <th>Investimento médio</th>
                    <th>Leads médios</th>
                    <th>CPL médio</th>
                    <th>CTR médio</th>
                    <th>CPC médio</th>
                    <th>Conversões médias</th>
                    <th>Amostra</th>
                  </tr>
                </thead>
                <tbody>
                  {data.seasonality?.items?.map((item) => (
                    <tr key={item.weekday_number}>
                      <td>{item.weekday}</td>
                      <td>{item.days_count}</td>
                      <td>{formatTimeSeriesValue('spend', item.avg_spend)}</td>
                      <td>{formatTimeSeriesValue('leads', item.avg_leads)}</td>
                      <td>{formatTimeSeriesValue('cpl', item.avg_cpl)}</td>
                      <td>{formatTimeSeriesValue('ctr', item.avg_ctr)}</td>
                      <td>{formatTimeSeriesValue('cpc', item.avg_cpc)}</td>
                      <td>{formatTimeSeriesValue('conversions', item.avg_conversions)}</td>
                      <td>
                        <span className={`statistics-status-badge ${item.sample_warning ? '' : 'is-success'}`}>
                          {item.sample_warning ? 'Baixa' : 'Adequada'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="statistics-time-section">
            <div className="statistics-section-heading">
              <div>
                <h3>Anomalias</h3>
                <p>Pontos fora do padrão estatístico do período, sem inferência automática de causa.</p>
              </div>
            </div>
            {data.anomalies?.length ? (
              <div className="statistics-table-wrap">
                <table className="statistics-table statistics-anomalies-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Métrica</th>
                      <th>Valor</th>
                      <th>Média</th>
                      <th>Z-score</th>
                      <th>Severidade</th>
                      <th>Interpretação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.anomalies.map((item) => (
                      <tr key={`${item.date}-${item.metric}`}>
                        <td>{item.date}</td>
                        <td>{item.metric_label}</td>
                        <td>{formatTimeSeriesValue(item.metric, item.value)}</td>
                        <td>{formatTimeSeriesValue(item.metric, item.mean)}</td>
                        <td>{formatDecimal(item.z_score, 2)}</td>
                        <td><span className="statistics-status-badge">{item.severity === 'high' ? 'Forte' : 'Moderada'}</span></td>
                        <td>{item.interpretation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState message="Nenhuma anomalia foi detectada com a amostra atual." />}
          </section>

          <section className="statistics-time-section">
            <div className="statistics-section-heading">
              <div>
                <h3>Insights temporais</h3>
                <p>Leituras automáticas para orientar investigação e planejamento.</p>
              </div>
            </div>
            <InsightsPanel data={{ available: Boolean(data.insights?.length), items: data.insights, message: 'Sem insights para a amostra atual.' }} />
          </section>
        </>
      )}
    </div>
  )
}

function mergeExecutiveInsights(analysisInsights, clusteringInsights) {
  const baseItems = analysisInsights?.items || []
  const clusterItems = clusteringInsights?.available ? clusteringInsights.items || [] : []
  if (!baseItems.length && !clusterItems.length) return analysisInsights
  return {
    available: true,
    message: '',
    items: [...clusterItems, ...baseItems],
  }
}

function renderPanel(activeTab, analysis, clusteringContext, timeSeriesContext) {
  if (activeTab === 'overview') return <OverviewPanel data={analysis?.overview} />
  if (activeTab === 'stability') return <StabilityPanel data={analysis?.stability} />
  if (activeTab === 'funnel') return <FunnelPanel data={analysis?.funnel} />
  if (activeTab === 'ab_tests') return <AbTestsPanel data={analysis?.ab_tests} />
  if (activeTab === 'saturation') return <SaturationPanel data={analysis?.saturation} />
  if (activeTab === 'trends') return <TrendsPanel data={analysis?.trends} />
  if (activeTab === 'correlations') return <CorrelationsPanel data={analysis?.correlations} />
  if (activeTab === 'time_series') return <TimeSeriesPanel {...timeSeriesContext} />
  if (activeTab === 'clustering') return <ClusteringPanel {...clusteringContext} />
  if (activeTab === 'executive_insights') {
    return (
      <InsightsPanel
        data={mergeExecutiveInsights(
          analysis?.executive_insights,
          clusteringContext.data?.executive_insights,
        )}
      />
    )
  }
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
  const [clusteringConfig, setClusteringConfig] = useState({
    entity_type: 'campaign',
    algorithm: 'kmeans',
    clusters: 3,
    normalize: true,
  })
  const [clustering, setClustering] = useState(null)
  const [clusteringLoading, setClusteringLoading] = useState(false)
  const [clusteringError, setClusteringError] = useState('')
  const [clusteringRequested, setClusteringRequested] = useState(false)
  const [timeSeriesConfig, setTimeSeriesConfig] = useState({
    metric: 'cpl',
    forecast_days: 7,
    goal_leads: '',
  })
  const [timeSeries, setTimeSeries] = useState(null)
  const [timeSeriesLoading, setTimeSeriesLoading] = useState(false)
  const [timeSeriesError, setTimeSeriesError] = useState('')
  const [timeSeriesRequested, setTimeSeriesRequested] = useState(false)
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

  const loadClustering = useCallback(async () => {
    setClusteringRequested(true)
    setClusteringLoading(true)
    setClusteringError('')
    try {
      const params = {
        date_start: filters.date_start,
        date_end: filters.date_end,
        entity_type: clusteringConfig.entity_type,
        algorithm: clusteringConfig.algorithm,
        clusters: clusteringConfig.clusters,
        normalize: clusteringConfig.normalize,
      }
      if (filters.ad_account_ids.length) params.ad_account_id = filters.ad_account_ids
      if (filters.campaign_ids.length) params.campaign_id = filters.campaign_ids
      if (filters.adset_ids.length) params.adset_id = filters.adset_ids
      if (filters.ad_ids.length) params.ad_id = filters.ad_ids
      const response = await api.get('/api/statistics/clustering', { params })
      setClustering(response.data)
    } catch (error) {
      logUiError('analise-estatistica', 'statistics-clustering', error)
      setClusteringError(error.response?.data?.detail || 'Falha ao atualizar a clusterização.')
      setClustering(null)
    } finally {
      setClusteringLoading(false)
    }
  }, [clusteringConfig, filters])

  const loadTimeSeries = useCallback(async () => {
    setTimeSeriesRequested(true)
    setTimeSeriesLoading(true)
    setTimeSeriesError('')
    try {
      const params = {
        date_start: filters.date_start,
        date_end: filters.date_end,
        metric: timeSeriesConfig.metric,
        forecast_days: timeSeriesConfig.forecast_days,
      }
      if (timeSeriesConfig.goal_leads) params.goal_leads = timeSeriesConfig.goal_leads
      if (filters.ad_account_ids.length) params.ad_account_id = filters.ad_account_ids
      if (filters.campaign_ids.length) params.campaign_id = filters.campaign_ids
      if (filters.adset_ids.length) params.adset_id = filters.adset_ids
      if (filters.ad_ids.length) params.ad_id = filters.ad_ids
      const response = await api.get('/api/statistics/time-series', { params })
      setTimeSeries(response.data)
    } catch (error) {
      logUiError('analise-estatistica', 'statistics-time-series', error)
      setTimeSeriesError(error.response?.data?.detail || 'Falha ao atualizar a análise temporal.')
      setTimeSeries(null)
    } finally {
      setTimeSeriesLoading(false)
    }
  }, [filters, timeSeriesConfig])

  useEffect(() => {
    loadFilters()
  }, [loadFilters])

  useEffect(() => {
    if (initialAnalysisLoaded.current) return
    initialAnalysisLoaded.current = true
    loadAnalysis()
  }, [loadAnalysis])

  useEffect(() => {
    if (activeTab !== 'clustering' || clusteringRequested || clusteringLoading) return
    loadClustering()
  }, [activeTab, clusteringLoading, clusteringRequested, loadClustering])

  useEffect(() => {
    if (activeTab !== 'time_series' || timeSeriesRequested || timeSeriesLoading) return
    loadTimeSeries()
  }, [activeTab, loadTimeSeries, timeSeriesLoading, timeSeriesRequested])

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
    if (activeTab === 'clustering') loadClustering()
    if (activeTab === 'time_series') loadTimeSeries()
  }

  const updateClusteringConfig = (field, value) => {
    setClusteringConfig((current) => ({ ...current, [field]: value }))
    setClustering(null)
    setClusteringError('')
  }

  const updateTimeSeriesConfig = (field, value) => {
    setTimeSeriesConfig((current) => ({ ...current, [field]: value }))
    setTimeSeries(null)
    setTimeSeriesError('')
    setTimeSeriesRequested(false)
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
        {analysisLoading && !analysis && activeTab !== 'clustering'
          ? <p className="hint-neutral">Calculando análise estatística...</p>
          : renderPanel(activeTab, analysis, {
            data: clustering,
            config: clusteringConfig,
            onConfigChange: updateClusteringConfig,
            onRefresh: loadClustering,
            loading: clusteringLoading,
            errorMessage: clusteringError,
          }, {
            data: timeSeries,
            config: timeSeriesConfig,
            onConfigChange: updateTimeSeriesConfig,
            onRefresh: loadTimeSeries,
            loading: timeSeriesLoading,
            errorMessage: timeSeriesError,
          })}
      </div>
    </section>
  )
}
