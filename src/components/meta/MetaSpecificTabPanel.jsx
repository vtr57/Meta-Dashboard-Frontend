import { useEffect, useMemo, useRef, useState } from 'react'
import Chart from 'chart.js/auto'
import { formatCurrency, formatNumber } from '../../pages/pageUtils'

const SPECIFIC_DESCENDING_DEFAULTS = new Set(['results', 'spend', 'cpr'])
const CHART_COLORS = ['#0b4ea2', '#b91c1c', '#0f766e', '#7e22ce', '#d97706', '#0891b2', '#be185d', '#4d7c0f']

function formatChartDateLabel(value) {
  const [year, month, day] = String(value || '')
    .slice(0, 10)
    .split('-')
    .map((part) => Number(part))
  if (!year || !month || !day) return String(value || '')
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
}

function buildChartModel(seriesByAd, dateStart, dateEnd, selectedAdIds) {
  if (!dateStart || !dateEnd) {
    return { labels: [], datasets: [] }
  }

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
  if (!startDate || !endDate || startDate > endDate) {
    return { labels: [], datasets: [] }
  }

  const labels = []
  for (let cursor = new Date(startDate); cursor <= endDate; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    labels.push(formatIsoDate(cursor))
  }

  const selectedSet = new Set((selectedAdIds || []).filter(Boolean))
  const filteredSeries = (seriesByAd || []).filter((row) => selectedSet.has(row?.ad_id))

  const datasets = filteredSeries.flatMap((row, index) => {
    const color = CHART_COLORS[index % CHART_COLORS.length]
    const rawByDate = new Map()
    for (const point of row?.points || []) {
      const key = String(point?.date || '').slice(0, 10)
      if (key) rawByDate.set(key, point)
    }
    const adLabel = row?.ad_name || row?.ad_id || `Anuncio ${index + 1}`
    return [
      {
        label: `${adLabel}, Gasto`,
        metric: 'spend',
        data: labels.map((label) => {
          const point = rawByDate.get(label)
          return point ? Number(point.spend || 0) : null
        }),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        spanGaps: true,
        tension: 0,
        yAxisID: 'ySpend',
      },
      {
        label: `${adLabel}, Resultados`,
        metric: 'results',
        data: labels.map((label) => {
          const point = rawByDate.get(label)
          return point ? Number(point.results || 0) : null
        }),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 2,
        pointHoverRadius: 4,
        spanGaps: true,
        tension: 0,
        borderDash: [6, 4],
        yAxisID: 'yResults',
      },
    ]
  })

  return { labels, datasets }
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

function MetaSpendTimeseriesChart({ chartModel }) {
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
      type: 'line',
      data: {
        labels: chartModel.labels,
        datasets: chartModel.datasets,
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
            callbacks: {
              title: (items) => formatChartDateLabel(items[0]?.label),
              label: (item) =>
                item.dataset.metric === 'results'
                  ? `${item.dataset.label}: ${formatNumber(item.parsed.y)}`
                  : `${item.dataset.label}: ${formatCurrency(item.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            ticks: {
              color: '#173a67',
              callback: (_, index) => formatChartDateLabel(chartModel.labels[index]),
            },
            grid: {
              color: '#d8e4f7',
            },
          },
          ySpend: {
            type: 'linear',
            position: 'left',
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
          yResults: {
            type: 'linear',
            position: 'right',
            ticks: {
              color: '#173a67',
              callback: (value) => formatNumber(value),
            },
            grid: {
              drawOnChartArea: false,
            },
            title: {
              display: true,
              text: 'Resultados',
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
  }, [chartModel])

  return (
    <div className="chart-wrapper meta-specific-chart-wrapper">
      <canvas
        ref={canvasRef}
        className="chartjs-canvas"
        aria-label="Grafico de gasto e resultados diarios por anuncio"
      />
    </div>
  )
}

export default function MetaSpecificTabPanel({ seriesByAd, rows, loading, errorMsg, dateStart, dateEnd }) {
  const [ordering, setOrdering] = useState('-spend')
  const [selectedAdIds, setSelectedAdIds] = useState(() => rows.map((row) => row?.ad_id).filter(Boolean))

  useEffect(() => {
    const availableIds = rows.map((row) => row?.ad_id).filter(Boolean)
    setSelectedAdIds((current) => {
      const nextSelected = current.filter((adId) => availableIds.includes(adId))
      if (nextSelected.length > 0 || availableIds.length === 0) {
        return nextSelected
      }
      return availableIds
    })
  }, [rows])

  const chartModel = useMemo(
    () => buildChartModel(seriesByAd, dateStart, dateEnd, selectedAdIds),
    [dateEnd, dateStart, selectedAdIds, seriesByAd],
  )
  const sortedRows = useMemo(() => {
    const currentField = ordering.startsWith('-') ? ordering.slice(1) : ordering
    const currentDesc = ordering.startsWith('-')
    const nextRows = [...rows]

    nextRows.sort((left, right) => {
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

    return nextRows
  }, [ordering, rows])

  const toggleOrdering = (field) => {
    const currentField = ordering.startsWith('-') ? ordering.slice(1) : ordering
    const currentDesc = ordering.startsWith('-')
    if (currentField === field) {
      setOrdering(currentDesc ? field : `-${field}`)
      return
    }
    setOrdering(SPECIFIC_DESCENDING_DEFAULTS.has(field) ? `-${field}` : field)
  }

  const sortIndicator = (field) => {
    const currentField = ordering.startsWith('-') ? ordering.slice(1) : ordering
    const currentDesc = ordering.startsWith('-')
    if (currentField !== field) return '↕'
    return currentDesc ? '↓' : '↑'
  }

  const handleSelectedAdsChange = (event) => {
    setSelectedAdIds(Array.from(event.target.selectedOptions, (option) => option.value))
  }

  return (
    <div className="meta-tab-panel">
      <div className="meta-specific-layout">
        <article className="chart-card">
          <h3>Gasto e resultados por anuncio</h3>
          {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}
          {loading ? (
            <p className="hint-neutral">Carregando dados...</p>
          ) : rows.length === 0 ? (
            <div className="chart-placeholder">
              <div className="axis-text">Sem dados no período.</div>
              <div className="axis-text">Cada serie depende dos anuncios selecionados.</div>
              <div className="axis-text">Eixo esquerdo: gasto, eixo direito: resultados.</div>
            </div>
          ) : selectedAdIds.length === 0 || chartModel.datasets.length === 0 ? (
            <div className="chart-placeholder">
              <div className="axis-text">Selecione um ou mais anúncios para exibir o gráfico.</div>
              <div className="axis-text">Eixo esquerdo: gasto, eixo direito: resultados.</div>
            </div>
          ) : (
            <MetaSpendTimeseriesChart chartModel={chartModel} />
          )}
        </article>

        <article className="chart-card">
          <div className="meta-specific-table-header">
            <h3>Gasto por anúncio</h3>
            <span className="hint-neutral meta-specific-table-caption">
              Total de anuncios no resultado: {formatNumber(sortedRows.length)}
            </span>
          </div>
          <label className="meta-specific-select-field">
            <span className="meta-specific-select-label">Anuncios no gráfico</span>
            <select
              multiple
              className="meta-specific-select"
              aria-label="Anuncios plotados no gráfico"
              value={selectedAdIds}
              onChange={handleSelectedAdsChange}
              disabled={loading || sortedRows.length === 0}
              size={Math.min(Math.max(sortedRows.length, 3), 8)}
            >
              {sortedRows.map((row) => (
                <option key={row.ad_id} value={row.ad_id}>
                  {row.ad_name || row.ad_id}
                </option>
              ))}
            </select>
          </label>
          <p className="hint-neutral meta-specific-select-help">
            Selecione um ou mais anuncios para plotar gasto e resultado.
          </p>
          {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}
          <div className="table-wrapper meta-specific-table-wrapper">
            <table className="media-table meta-specific-table">
              <thead>
                <tr>
                  <th>Anúncio</th>
                  <th>
                    <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('results')}>
                      Resultados <span>{sortIndicator('results')}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('spend')}>
                      Valor gasto <span>{sortIndicator('spend')}</span>
                    </button>
                  </th>
                  <th>
                    <button type="button" className="th-sort-btn" onClick={() => toggleOrdering('cpr')}>
                      CPR <span>{sortIndicator('cpr')}</span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="4">Carregando dados...</td>
                  </tr>
                ) : sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan="4">Sem dados no período.</td>
                  </tr>
                ) : (
                  sortedRows.map((row) => (
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
  )
}
