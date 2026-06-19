import { useCallback, useEffect, useMemo, useState } from 'react'
import SearchableSelect, { toSearchableItems } from '../components/SearchableSelect'
import api from '../lib/api'
import { daysAgo, formatCurrency, formatDecimal, formatNumber, logUiError, toInputDate } from './pageUtils'

function getDefaultReportDateRange() {
  const dateEnd = daysAgo(1)
  const dateStart = daysAgo(7)
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
    deltaDirection: 'higher-better',
    formatter: (value) => formatCurrency(value),
  },
  {
    key: 'resultados',
    label: 'Resultados',
    accent: 'primary',
    deltaDirection: 'higher-better',
    formatter: (value) => formatNumber(value),
  },
  {
    key: 'custo_por_resultado',
    label: 'Custo por resultado',
    deltaDirection: 'lower-better',
    formatter: (value) => (value === null || value === undefined ? 'N/A' : formatCurrency(value)),
  },
  {
    key: 'cpc_link',
    label: 'CPC (custo por clique no link)',
    deltaDirection: 'lower-better',
    formatter: (value) => (value === null || value === undefined ? 'N/A' : formatCurrency(value)),
  },
  {
    key: 'ctr_link',
    label: 'CTR (taxa de cliques no link)',
    deltaDirection: 'higher-better',
    formatter: (value) => `${formatDecimal(value, 2)}%`,
  },
  {
    key: 'taxa_video_3s_por_impressoes',
    label: 'Visualizaram o video por 3 segundos / Impressoes',
    deltaDirection: 'higher-better',
    formatter: (value) => (value === null || value === undefined ? 'N/A' : `${formatDecimal(value, 2)}%`),
  },
  {
    key: 'tx_conversao_envio_mensagem',
    label: 'Tx de conversao Envio de Mensagem',
    deltaDirection: 'higher-better',
    formatter: (value) => (value === null || value === undefined ? 'N/A' : `${formatDecimal(value, 2)}%`),
  },
  {
    key: 'cpm',
    label: 'CPM',
    deltaDirection: 'lower-better',
    formatter: (value) => formatCurrency(value),
  },
  {
    key: 'alcance',
    label: 'Alcance',
    deltaDirection: 'higher-better',
    formatter: (value) => formatNumber(value),
  },
  {
    key: 'frequencia',
    label: 'Frequencia',
    deltaDirection: 'higher-better',
    formatter: (value) => formatDecimal(value, 2),
  },
  {
    key: 'impressoes',
    label: 'Impressoes',
    deltaDirection: 'higher-better',
    formatter: (value) => formatNumber(value),
  },
  {
    key: 'cliques_link',
    label: 'Cliques no link',
    deltaDirection: 'higher-better',
    formatter: (value) => formatNumber(value),
  },
]

function formatMetricDelta(metric, change) {
  if (change === null || change === undefined) {
    return { label: 'sem base anterior', tone: 'neutral' }
  }

  const parsed = Number(change)
  if (Number.isNaN(parsed)) {
    return { label: 'sem base anterior', tone: 'neutral' }
  }

  const sign = parsed > 0 ? '+' : ''
  let tone = 'neutral'
  if (parsed !== 0) {
    const positiveIsGood = metric?.deltaDirection !== 'lower-better'
    if (parsed > 0) {
      tone = positiveIsGood ? 'positive' : 'negative'
    } else {
      tone = positiveIsGood ? 'negative' : 'positive'
    }
  }
  return { label: `${sign}${formatDecimal(parsed, 2)}%`, tone }
}

function buildMetricDisplay(metric, metrics, metricChanges) {
  return {
    valueText: metric.formatter(metrics?.[metric.key]),
    delta: formatMetricDelta(metric, metricChanges?.[metric.key]),
  }
}

function buildSelectionSummary(items, selectedIds, emptyLabel, singularLabel, pluralLabel) {
  if (!selectedIds?.length) return emptyLabel
  const selectedItems = items.filter((item) => selectedIds.includes(item.id))
  if (selectedItems.length === 1) return selectedItems[0]?.label || singularLabel
  return `${selectedItems.length} ${pluralLabel}`
}

function buildMetricTextWithDelta(metric, metrics, metricChanges) {
  const display = buildMetricDisplay(metric, metrics, metricChanges)
  return `${display.valueText} (${display.delta.label})`
}

function buildWhatsappReportMessage({ accountName, metrics, metricChanges }) {
  const valorUsado = buildMetricTextWithDelta(REPORT_METRICS[0], metrics, metricChanges)
  const resultados = buildMetricTextWithDelta(REPORT_METRICS[1], metrics, metricChanges)
  const custoPorMensagem = buildMetricTextWithDelta(REPORT_METRICS[2], metrics, metricChanges)
  const ctr = buildMetricTextWithDelta(REPORT_METRICS[4], metrics, metricChanges)
  const cpm = buildMetricTextWithDelta(REPORT_METRICS[7], metrics, metricChanges)
  const taxaMensagem = buildMetricTextWithDelta(REPORT_METRICS[6], metrics, metricChanges)

  return `*Relatório Meta Ads ${accountName}:*

Olá, bom dia! Segue o relatório da semana passada no Meta Ads para nossas campanhas de mensagens:
* Valor usado: ${valorUsado}
* Mensagens: ${resultados}
* Custo por mensagens: ${custoPorMensagem}
* CTR: ${ctr}
* CPM: ${cpm}
* Tx de mensagem: ${taxaMensagem}

Obs.: 
`
}

export default function RelatoriosPage() {
  const defaultDateRange = useMemo(() => getDefaultReportDateRange(), [])
  const [filters, setFilters] = useState({
    ad_account_ids: [],
    campaign_ids: [],
    date_start: defaultDateRange.date_start,
    date_end: defaultDateRange.date_end,
  })
  const [options, setOptions] = useState({ ad_accounts: [], campaigns: [] })
  const [metrics, setMetrics] = useState(null)
  const [metricChanges, setMetricChanges] = useState({})
  const [filtersLoading, setFiltersLoading] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')

  const adAccountItems = useMemo(
    () => toSearchableItems(options.ad_accounts, 'id_meta_ad_account'),
    [options.ad_accounts],
  )
  const campaignItems = useMemo(
    () => toSearchableItems(options.campaigns, 'id_meta_campaign'),
    [options.campaigns],
  )
  const selectedAccountLabel = useMemo(
    () =>
      buildSelectionSummary(
        adAccountItems,
        filters.ad_account_ids,
        'Todas as contas acessiveis',
        'Conta selecionada',
        'contas selecionadas',
      ),
    [adAccountItems, filters.ad_account_ids],
  )
  const selectedCampaignLabel = useMemo(
    () =>
      buildSelectionSummary(
        campaignItems,
        filters.campaign_ids,
        'Todas as campaigns da selecao',
        'Campaign selecionada',
        'campaigns selecionadas',
      ),
    [campaignItems, filters.campaign_ids],
  )
  const reportAccountName = useMemo(() => {
    if (filters.ad_account_ids.length === 0) {
      if (options.ad_accounts.length === 1) {
        const singleName = String(options.ad_accounts[0]?.name || '').trim()
        return singleName || 'Conta de anúncio'
      }
      return 'Conta de anúncio'
    }
    if (filters.ad_account_ids.length > 1) {
      return `${filters.ad_account_ids.length} contas selecionadas`
    }
    const selected = options.ad_accounts.find((item) => item?.id_meta_ad_account === filters.ad_account_ids[0])
    const name = String(selected?.name || '').trim()
    return name || selectedAccountLabel || 'Conta de anúncio'
  }, [filters.ad_account_ids, options.ad_accounts, selectedAccountLabel])
  const generatedWhatsappMessage = useMemo(
    () => buildWhatsappReportMessage({ accountName: reportAccountName, metrics, metricChanges }),
    [metricChanges, metrics, reportAccountName],
  )

  const loadFilters = useCallback(async () => {
    setFiltersLoading(true)
    setErrorMsg('')
    try {
      const params = {}
      if (filters.ad_account_ids.length > 0) params.ad_account_id = filters.ad_account_ids
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
  }, [filters.ad_account_ids])

  const loadReport = useCallback(async () => {
    setReportLoading(true)
    setErrorMsg('')
    try {
      const params = {
        date_start: filters.date_start,
        date_end: filters.date_end,
      }
      if (filters.ad_account_ids.length > 0) params.ad_account_id = filters.ad_account_ids
      if (filters.campaign_ids.length > 0) params.campaign_id = filters.campaign_ids
      const response = await api.get('/api/meta/report-summary', { params })
      setMetrics(response.data?.metrics || null)
      setMetricChanges(response.data?.metric_changes || {})
    } catch (error) {
      logUiError('relatorios', 'meta-report-summary', error)
      setErrorMsg(error.response?.data?.detail || 'Falha ao carregar o relatorio.')
      setMetrics(null)
      setMetricChanges({})
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

  useEffect(() => {
    setReportMessage(generatedWhatsappMessage)
  }, [generatedWhatsappMessage])

  const updateFilter = (field, value) => {
    setFilters((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'ad_account_ids') {
        next.campaign_ids = []
      }
      return next
    })
  }

  const handleCopyMessage = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(reportMessage)
      } else {
        const tempTextArea = document.createElement('textarea')
        tempTextArea.value = reportMessage
        document.body.appendChild(tempTextArea)
        tempTextArea.select()
        document.execCommand('copy')
        document.body.removeChild(tempTextArea)
      }
      setCopyFeedback('Mensagem copiada.')
      window.setTimeout(() => setCopyFeedback(''), 1800)
    } catch (error) {
      logUiError('relatorios', 'copy-whatsapp-message', error)
      setCopyFeedback('Falha ao copiar.')
      window.setTimeout(() => setCopyFeedback(''), 2200)
    }
  }

  return (
    <section className="view-card view-card-meta reports-view">
      <div className="reports-header">
        <div>
          <h2>Relatorios</h2>
        </div>
      </div>

      <div className="filter-grid meta-filter-grid reports-filter-grid">
        <SearchableSelect
          value={filters.ad_account_ids}
          items={adAccountItems}
          onChange={(nextValue) => updateFilter('ad_account_ids', nextValue)}
          placeholder="Todas as contas"
          ariaLabel="Filtro de conta de anuncio"
          disabled={filtersLoading}
          multiple
        />
        <SearchableSelect
          value={filters.campaign_ids}
          items={campaignItems}
          onChange={(nextValue) => updateFilter('campaign_ids', nextValue)}
          placeholder="Todas as campaigns"
          ariaLabel="Filtro de campaign"
          disabled={filtersLoading}
          multiple
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
          {REPORT_METRICS.map((metric) => {
            const display = buildMetricDisplay(metric, metrics, metricChanges)
            return (
              <article
                key={metric.key}
                className={`reports-metric-card ${metric.accent ? `reports-metric-card-${metric.accent}` : ''}`}
              >
                <p className="reports-metric-label">{metric.label}</p>
                <div className="reports-metric-value-group">
                  <p className="reports-metric-value">{display.valueText}</p>
                  <span className={`reports-metric-delta reports-metric-delta-${display.delta.tone}`}>
                    {display.delta.label}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <article className="reports-message-card">
        <div className="reports-message-header">
          <div>
            <h3>Mensagem para WhatsApp</h3>
            <p className="hint-neutral reports-message-subtitle">Texto pronto para copiar e colar com as métricas atuais.</p>
          </div>
          <div className="reports-message-actions">
            {copyFeedback ? <span className="reports-copy-feedback">{copyFeedback}</span> : null}
            <button
              type="button"
              className="reports-copy-btn"
              aria-label="Copiar mensagem para WhatsApp"
              title="Copiar mensagem para WhatsApp"
              onClick={handleCopyMessage}
            >
              <i className="fa-regular fa-copy" aria-hidden="true" />
            </button>
          </div>
        </div>
        <textarea
          className="reports-message-textarea"
          value={reportMessage}
          onChange={(event) => setReportMessage(event.target.value)}
          aria-label="Mensagem de relatório para WhatsApp"
          spellCheck={false}
        />
      </article>
    </section>
  )
}
