import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../lib/api'
import { formatDate, formatDecimal, formatNumber, logUiError, toInputDate } from './pageUtils'

const FORMA_PAGAMENTO_OPTIONS = ['PIX', 'CARTAO CREDITO']
const PERIODO_COBRANCA_OPTIONS = ['SEMANAL', 'MENSAL']

function toLocalDate(value) {
  const raw = String(value || '').slice(0, 10)
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(year, month - 1, day)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function formatSaldoSyncFeedback(saldoSync) {
  if (!saldoSync || typeof saldoSync !== 'object') return ''

  const updatedClientes = Number(saldoSync.updated_clientes || 0)
  const totalAdAccounts = Number(saldoSync.total_ad_accounts || 0)
  const errorCount = Number(saldoSync.error_count || 0)
  const parseErrorCount = Number(saldoSync.parse_error_count || 0)
  const totalIssues = errorCount + parseErrorCount

  if (saldoSync.skipped) {
    const detail = String(saldoSync.detail || '').trim()
    return detail ? `Sincronizaão de saldo nao executada: ${detail}.` : 'Sincronizaão de saldo nao executada.'
  }

  const parts = [`Saldo sincronizado para ${formatNumber(updatedClientes)} cliente(s)`]
  if (totalAdAccounts > 0) {
    parts.push(`${formatNumber(totalAdAccounts)} conta(s) consultada(s)`)
  }
  if (totalIssues > 0) {
    parts.push(`${formatNumber(totalIssues)} ocorrencia(s) na consulta`)
  }
  return `${parts.join(' | ')}.`
}

function toNumeric(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(toNumeric(value))
}

function getSaldoCoverageDays(row) {
  const saldo = toNumeric(row?.saldo_atual)
  const gasto = toNumeric(row?.gasto_diario)
  if (gasto <= 0) return Number.POSITIVE_INFINITY
  return saldo / gasto
}

function getFinancialStatus(row) {
  const coverage = getSaldoCoverageDays(row)
  if (coverage <= 3) {
    return { value: 'critico', label: 'Critico', className: 'danger' }
  }
  if (coverage <= 7) {
    return { value: 'atencao', label: 'Atencao', className: 'warning' }
  }
  return { value: 'ok', label: 'OK', className: 'ok' }
}

function getRenovacaoStatus(dataRenovacao) {
  const renovacao = toLocalDate(dataRenovacao)
  if (!renovacao) {
    return { className: 'neutral', caption: 'Data invalida' }
  }
  const now = new Date()
  const hoje = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.floor((renovacao.getTime() - hoje.getTime()) / 86400000)

  if (diffDays <= 3) {
    const caption = diffDays < 0 ? `Atrasado ${Math.abs(diffDays)} dia(s)` : `Vence em ${Math.max(diffDays, 0)} dia(s)`
    return { className: 'danger', caption }
  }
  if (diffDays <= 7) {
    return { className: 'warning', caption: `Vence em ${diffDays} dia(s)` }
  }
  return { className: 'ok', caption: 'OK' }
}

export function ClientesCadastrarPage() {
  const [adAccounts, setAdAccounts] = useState([])
  const [name, setName] = useState('')
  const [nome, setNome] = useState('')
  const [dataRenovacaoCreditos, setDataRenovacaoCreditos] = useState(toInputDate(new Date()))
  const [nichoAtuacao, setNichoAtuacao] = useState('')
  const [valorInvestido, setValorInvestido] = useState('')
  const [formaPagamento, setFormaPagamento] = useState('')
  const [periodoCobranca, setPeriodoCobranca] = useState('')
  const [saldoAtual, setSaldoAtual] = useState('')
  const [gastoDiario, setGastoDiario] = useState('')
  const [accountsLoading, setAccountsLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const loadAdAccounts = useCallback(async () => {
    setAccountsLoading(true)
    setErrorMsg('')
    try {
      const response = await api.get('/api/empresa/ad-accounts')
      setAdAccounts(response.data?.ad_accounts || [])
    } catch (error) {
      logUiError('clientes-cadastrar', 'empresa-ad-accounts', error)
      setErrorMsg('Falha ao carregar AdAccounts para cadastro.')
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAdAccounts()
  }, [loadAdAccounts])

  const selectedAdAccount = useMemo(
    () => adAccounts.find((row) => String(row.id) === String(nome)) || null,
    [adAccounts, nome],
  )

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setErrorMsg('')
    setFeedback('')

    try {
      await api.post('/api/empresa/clientes', {
        name,
        nome,
        data_renovacao_creditos: dataRenovacaoCreditos,
        nicho_atuacao: nichoAtuacao.trim(),
        valor_investido: valorInvestido,
        forma_pagamento: formaPagamento,
        periodo_cobranca: periodoCobranca,
        saldo_atual: saldoAtual,
        gasto_diario: gastoDiario,
      })
      setFeedback('Cliente cadastrado com sucesso.')
      setName('')
      setNome('')
      setDataRenovacaoCreditos(toInputDate(new Date()))
      setNichoAtuacao('')
      setValorInvestido('')
      setFormaPagamento('')
      setPeriodoCobranca('')
      setSaldoAtual('')
      setGastoDiario('')
    } catch (error) {
      logUiError('clientes-cadastrar', 'empresa-clientes-post', error)
      setErrorMsg(error.response?.data?.detail || 'Falha ao cadastrar cliente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="view-card clientes-view clientes-cadastrar-view">
      <p className="clientes-breadcrumb">Clientes &gt; Novo cliente</p>
      <h2>Clientes / Cadastrar</h2>
      <p className="view-description">
        Cadastre clientes informando o AdAccount, data de renovacao e dados financeiros/comerciais.
      </p>

      <form className="clientes-cadastro-form" onSubmit={handleSubmit}>
        <div className="clientes-cadastro-grid">
          <article className="clientes-cadastro-card">
            <h3>
              <i className="fa-solid fa-address-card" aria-hidden="true" /> Informacoes basicas
            </h3>
            <div className="clientes-cadastro-fields">
              <div className="clientes-campo">
                <label htmlFor="cliente-name">
                  Nome do cliente <span className="required-mark">*</span>
                </label>
                <input
                  id="cliente-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={submitting}
                  placeholder="Digite o nome do cliente"
                  required
                />
              </div>

              <div className="clientes-campo">
                <label htmlFor="cliente-nicho">
                  Nicho de atuacao <span className="optional-mark">(opcional)</span>
                </label>
                <input
                  id="cliente-nicho"
                  type="text"
                  value={nichoAtuacao}
                  onChange={(event) => setNichoAtuacao(event.target.value)}
                  disabled={submitting}
                  placeholder="Ex.: Ecommerce"
                />
              </div>

              <div className="clientes-campo clientes-campo-wide">
                <label htmlFor="cliente-nome">
                  AdAccount <span className="required-mark">*</span>
                </label>
                <select
                  id="cliente-nome"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                  disabled={accountsLoading || submitting}
                  required
                >
                  <option value="">Selecione um AdAccount</option>
                  {adAccounts.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name || 'Sem nome'} - ID: {row.id_meta_ad_account}
                    </option>
                  ))}
                </select>

                {selectedAdAccount ? (
                  <div className="adaccount-details">
                    <div>
                      <strong>{selectedAdAccount.name || 'Sem nome'}</strong>
                      <p>ID: {selectedAdAccount.id_meta_ad_account}</p>
                    </div>
                    <span className="adaccount-badge">Ativa</span>
                  </div>
                ) : (
                  <p className="adaccount-placeholder">Selecione um AdAccount para visualizar os detalhes.</p>
                )}
              </div>
            </div>
          </article>

          <article className="clientes-cadastro-card">
            <h3>
              <i className="fa-solid fa-file-invoice-dollar" aria-hidden="true" /> Contrato / Cobranca
            </h3>
            <div className="clientes-cadastro-fields">
              <div className="clientes-campo">
                <label htmlFor="cliente-forma-pagamento">
                  Forma de pagamento <span className="required-mark">*</span>
                </label>
                <select
                  id="cliente-forma-pagamento"
                  value={formaPagamento}
                  onChange={(event) => setFormaPagamento(event.target.value)}
                  disabled={submitting}
                  required
                >
                  <option value="">Selecione uma forma de pagamento</option>
                  {FORMA_PAGAMENTO_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="clientes-campo">
                <label htmlFor="cliente-periodo-cobranca">
                  Periodo de cobranca <span className="required-mark">*</span>
                </label>
                <select
                  id="cliente-periodo-cobranca"
                  value={periodoCobranca}
                  onChange={(event) => setPeriodoCobranca(event.target.value)}
                  disabled={submitting}
                  required
                >
                  <option value="">Selecione um periodo de cobranca</option>
                  {PERIODO_COBRANCA_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="clientes-campo clientes-campo-wide">
                <label htmlFor="data-renovacao">
                  Data de renovacao dos creditos <span className="required-mark">*</span>
                </label>
                <input
                  id="data-renovacao"
                  type="date"
                  value={dataRenovacaoCreditos}
                  onChange={(event) => setDataRenovacaoCreditos(event.target.value)}
                  disabled={submitting}
                  required
                />
              </div>
            </div>
          </article>

          <article className="clientes-cadastro-card">
            <h3>
              <i className="fa-solid fa-sack-dollar" aria-hidden="true" /> Dados financeiros
            </h3>
            <div className="clientes-cadastro-fields">
              <div className="clientes-campo">
                <label htmlFor="cliente-valor-investido">
                  Valor investido <span className="optional-mark">(opcional)</span>
                </label>
                <div className="currency-input">
                  <span>R$</span>
                  <input
                    id="cliente-valor-investido"
                    type="number"
                    step="0.01"
                    value={valorInvestido}
                    onChange={(event) => setValorInvestido(event.target.value)}
                    disabled={submitting}
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div className="clientes-campo">
                <label htmlFor="cliente-saldo-atual">
                  Saldo atual <span className="optional-mark">(opcional)</span>
                </label>
                <div className="currency-input">
                  <span>R$</span>
                  <input
                    id="cliente-saldo-atual"
                    type="number"
                    step="0.01"
                    value={saldoAtual}
                    onChange={(event) => setSaldoAtual(event.target.value)}
                    disabled={submitting}
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div className="clientes-campo clientes-campo-wide">
                <label htmlFor="cliente-gasto-diario">
                  Gasto diario <span className="optional-mark">(opcional)</span>
                </label>
                <div className="currency-input">
                  <span>R$</span>
                  <input
                    id="cliente-gasto-diario"
                    type="number"
                    step="0.01"
                    value={gastoDiario}
                    onChange={(event) => setGastoDiario(event.target.value)}
                    disabled={submitting}
                    placeholder="0,00"
                  />
                </div>
              </div>
            </div>
          </article>
        </div>

        <div className="clientes-submit-row">
          {feedback ? <p className="hint-ok clientes-submit-feedback">{feedback}</p> : null}
          <button
            type="submit"
            className="primary-btn clientes-submit-btn"
            disabled={
              submitting ||
              accountsLoading ||
              !name ||
              !nome ||
              !dataRenovacaoCreditos ||
              !formaPagamento ||
              !periodoCobranca
            }
          >
            <i className="fa-solid fa-user-plus" aria-hidden="true" /> {submitting ? 'Salvando...' : 'Criar cliente'}
          </button>
        </div>
      </form>

      {accountsLoading ? <p className="hint-neutral">Carregando AdAccounts...</p> : null}
      {!accountsLoading && adAccounts.length === 0 ? (
        <p className="hint-warning">Nenhum AdAccount disponivel para cadastro.</p>
      ) : null}
      {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}
    </section>
  )
}

export function ClientesVisualizarPage() {
  const [clientes, setClientes] = useState([])
  const [adAccounts, setAdAccounts] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [showOnlySelected, setShowOnlySelected] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [nichoFilter, setNichoFilter] = useState('')
  const [formaFilter, setFormaFilter] = useState('')
  const [periodoFilter, setPeriodoFilter] = useState('')
  const [statusFinanceiroFilter, setStatusFinanceiroFilter] = useState('')
  const [bulkPeriodoCobranca, setBulkPeriodoCobranca] = useState('')
  const [bulkFormaPagamento, setBulkFormaPagamento] = useState('')
  const [loading, setLoading] = useState(false)
  const [deletingLoading, setDeletingLoading] = useState(false)
  const [bulkUpdating, setBulkUpdating] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingForm, setEditingForm] = useState({
    name: '',
    nome: '',
    data_renovacao_creditos: '',
    nicho_atuacao: '',
    valor_investido: '',
    forma_pagamento: '',
    periodo_cobranca: '',
    saldo_atual: '',
    gasto_diario: '',
  })
  const [feedback, setFeedback] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const filteredClientes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return clientes.filter((row) => {
      if (showOnlySelected && !selectedSet.has(row.id)) return false
      if (term) {
        const haystack = [
          row.name,
          row.nome,
          row.id_meta_ad_account,
          row.nicho_atuacao,
        ]
          .map((part) => String(part || '').toLowerCase())
          .join(' ')
        if (!haystack.includes(term)) return false
      }
      if (nichoFilter && String(row.nicho_atuacao || '') !== nichoFilter) return false
      if (formaFilter && String(row.forma_pagamento || '') !== formaFilter) return false
      if (periodoFilter && String(row.periodo_cobranca || '') !== periodoFilter) return false
      if (statusFinanceiroFilter && getFinancialStatus(row).value !== statusFinanceiroFilter) return false
      return true
    })
  }, [
    clientes,
    showOnlySelected,
    selectedSet,
    searchTerm,
    nichoFilter,
    formaFilter,
    periodoFilter,
    statusFinanceiroFilter,
  ])
  const allSelected =
    filteredClientes.length > 0 && filteredClientes.every((row) => selectedSet.has(row.id))
  const isBusy = loading || deletingLoading || bulkUpdating || savingEdit
  const nichoOptions = useMemo(
    () =>
      Array.from(
        new Set(
          clientes
            .map((row) => String(row.nicho_atuacao || '').trim())
            .filter((value) => value.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [clientes],
  )
  const resumo = useMemo(() => {
    const totalClientes = filteredClientes.length
    const investimentoTotal = filteredClientes.reduce((acc, row) => acc + toNumeric(row.valor_investido), 0)
    const saldoTotal = filteredClientes.reduce((acc, row) => acc + toNumeric(row.saldo_atual), 0)
    const criticos = filteredClientes.filter((row) => getFinancialStatus(row).value === 'critico').length
    return { totalClientes, investimentoTotal, saldoTotal, criticos }
  }, [filteredClientes])

  const loadAdAccounts = useCallback(async () => {
    try {
      const response = await api.get('/api/empresa/ad-accounts')
      setAdAccounts(response.data?.ad_accounts || [])
    } catch (error) {
      logUiError('clientes-visualizar', 'empresa-ad-accounts', error)
      setErrorMsg('Falha ao carregar AdAccounts para edicao.')
    }
  }, [])

  const loadClientes = useCallback(async () => {
    setLoading(true)
    setErrorMsg('')
    setFeedback('')
    try {
      const response = await api.get('/api/empresa/clientes', {
        params: { refresh_saldo: 1 },
      })
      const rows = response.data?.clientes || []
      const saldoSyncFeedback = formatSaldoSyncFeedback(response.data?.saldo_sync)
      setClientes(rows)
      setSelectedIds([])
      setShowOnlySelected(false)
      setEditingId(null)
      setFeedback(
        saldoSyncFeedback
          ? `Total de clientes encontrados: ${formatNumber(rows.length)}. ${saldoSyncFeedback}`
          : `Total de clientes encontrados: ${formatNumber(rows.length)}.`,
      )
    } catch (error) {
      logUiError('clientes-visualizar', 'empresa-clientes-get', error)
      setErrorMsg(error.response?.data?.detail || 'Falha ao carregar clientes.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadClientes()
  }, [loadClientes])

  useEffect(() => {
    loadAdAccounts()
  }, [loadAdAccounts])

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((value) => value !== id)
      }
      return [...prev, id]
    })
  }

  const toggleSelectAll = (checked) => {
    if (!checked) {
      setSelectedIds([])
      return
    }
    const visibleIds = filteredClientes.map((row) => row.id)
    setSelectedIds((prev) => {
      const merged = new Set(prev)
      visibleIds.forEach((id) => merged.add(id))
      return Array.from(merged)
    })
  }

  const handleVisualizarSelecionados = async () => {
    if (selectedIds.length === 0) {
      setErrorMsg('Selecione ao menos um cliente para visualizar.')
      setFeedback('')
      return
    }
    setErrorMsg('')
    setFeedback('')
    setShowOnlySelected(true)
    setEditingId(null)
    setFeedback(`Exibindo ${formatNumber(selectedIds.length)} cliente(s) selecionado(s).`)
  }

  const handleVerTodos = () => {
    setShowOnlySelected(false)
    setErrorMsg('')
    setFeedback(`Exibindo todos os clientes (${formatNumber(clientes.length)}).`)
  }

  const startEdit = (row) => {
    setEditingId(row.id)
    setEditingForm({
      name: row.name || '',
      nome: row.nome_id ? String(row.nome_id) : '',
      data_renovacao_creditos: String(row.data_renovacao_creditos || '').slice(0, 10),
      nicho_atuacao: row.nicho_atuacao || '',
      valor_investido: row.valor_investido !== null && row.valor_investido !== undefined ? String(row.valor_investido) : '',
      forma_pagamento: row.forma_pagamento || '',
      periodo_cobranca: row.periodo_cobranca || '',
      saldo_atual: row.saldo_atual !== null && row.saldo_atual !== undefined ? String(row.saldo_atual) : '',
      gasto_diario: row.gasto_diario !== null && row.gasto_diario !== undefined ? String(row.gasto_diario) : '',
    })
    setErrorMsg('')
    setFeedback('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingForm({
      name: '',
      nome: '',
      data_renovacao_creditos: '',
      nicho_atuacao: '',
      valor_investido: '',
      forma_pagamento: '',
      periodo_cobranca: '',
      saldo_atual: '',
      gasto_diario: '',
    })
  }

  const handleEditFieldChange = (field, value) => {
    setEditingForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSalvarEdicao = async () => {
    if (!editingId) return

    const resolvedName = editingForm.name.trim()
    if (
      !resolvedName ||
      !editingForm.nome ||
      !editingForm.data_renovacao_creditos ||
      !editingForm.forma_pagamento ||
      !editingForm.periodo_cobranca
    ) {
      setErrorMsg(
        'Preencha name, AdAccount, data de renovacao, forma de pagamento e periodo de cobranca para salvar a edicao.',
      )
      setFeedback('')
      return
    }

    setSavingEdit(true)
    setErrorMsg('')
    setFeedback('')
    try {
      const response = await api.patch(`/api/empresa/clientes/${editingId}`, {
        name: resolvedName,
        nome: editingForm.nome,
        data_renovacao_creditos: editingForm.data_renovacao_creditos,
        nicho_atuacao: editingForm.nicho_atuacao.trim(),
        valor_investido: editingForm.valor_investido,
        forma_pagamento: editingForm.forma_pagamento,
        periodo_cobranca: editingForm.periodo_cobranca,
        saldo_atual: editingForm.saldo_atual,
        gasto_diario: editingForm.gasto_diario,
      })
      const updatedRow = response.data?.cliente
      if (updatedRow) {
        setClientes((prev) => prev.map((row) => (row.id === updatedRow.id ? updatedRow : row)))
      }
      setFeedback('Cliente atualizado com sucesso.')
      cancelEdit()
    } catch (error) {
      logUiError('clientes-visualizar', 'empresa-cliente-patch', error)
      setErrorMsg(error.response?.data?.detail || 'Falha ao atualizar cliente.')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleExcluirSelecionados = async () => {
    if (selectedIds.length === 0) {
      setErrorMsg('Selecione ao menos um cliente para excluir.')
      setFeedback('')
      return
    }

    const shouldDelete = window.confirm(
      `Confirma a exclusao de ${selectedIds.length} cliente(s) selecionado(s)?`,
    )
    if (!shouldDelete) {
      return
    }

    const idsToDelete = [...selectedIds]
    setDeletingLoading(true)
    setErrorMsg('')
    setFeedback('')
    try {
      const response = await api.delete('/api/empresa/clientes', {
        params: { ids: idsToDelete.join(',') },
      })
      const deletedCount = Number(response.data?.deleted_count || 0)
      setClientes((prev) => prev.filter((row) => !idsToDelete.includes(row.id)))
      setSelectedIds([])
      if (editingId !== null && idsToDelete.includes(editingId)) {
        cancelEdit()
      }
      setFeedback(
        deletedCount > 0
          ? `${formatNumber(deletedCount)} cliente(s) excluido(s) com sucesso.`
          : 'Nenhum cliente foi excluido.',
      )
    } catch (error) {
      logUiError('clientes-visualizar', 'empresa-clientes-delete', error)
      setErrorMsg(error.response?.data?.detail || 'Falha ao excluir clientes selecionados.')
    } finally {
      setDeletingLoading(false)
    }
  }

  const handleBulkUpdate = async (field, value, successLabel) => {
    const parsedValue = String(value || '').trim()
    if (selectedIds.length === 0) {
      setErrorMsg('Selecione ao menos um cliente para atualizar em massa.')
      setFeedback('')
      return
    }
    if (!parsedValue) {
      setErrorMsg(`Selecione um valor para ${successLabel.toLowerCase()}.`)
      setFeedback('')
      return
    }

    setBulkUpdating(true)
    setErrorMsg('')
    setFeedback('')
    try {
      const responses = await Promise.all(
        selectedIds.map((id) =>
          api.patch(`/api/empresa/clientes/${id}`, {
            [field]: parsedValue,
          }),
        ),
      )
      const updatesMap = new Map(
        responses
          .map((response) => response.data?.cliente)
          .filter(Boolean)
          .map((cliente) => [cliente.id, cliente]),
      )
      setClientes((prev) => prev.map((row) => updatesMap.get(row.id) || row))
      setFeedback(`${formatNumber(selectedIds.length)} cliente(s) atualizado(s): ${successLabel}.`)
      if (field === 'periodo_cobranca') setBulkPeriodoCobranca('')
      if (field === 'forma_pagamento') setBulkFormaPagamento('')
    } catch (error) {
      logUiError('clientes-visualizar', `empresa-clientes-bulk-${field}`, error)
      setErrorMsg(error.response?.data?.detail || 'Falha ao atualizar clientes em massa.')
    } finally {
      setBulkUpdating(false)
    }
  }

  const handleRowClick = (event, row) => {
    if (editingId !== null || isBusy) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest('button, input, select, a, textarea, label')) return
    startEdit(row)
  }

  return (
    <section className="view-card clientes-view clientes-visualizar-view">
      <p className="clientes-breadcrumb">Clientes &gt; Carteira</p>
      <h2>Clientes / Visualizar</h2>
      <p className="view-description">Gerencie carteira, risco financeiro e dados comerciais dos clientes.</p>

      <div className="clientes-summary-grid">
        <article className="clientes-summary-card">
          <p className="clientes-summary-label">Total de clientes</p>
          <p className="clientes-summary-value">{formatNumber(resumo.totalClientes)}</p>
        </article>
        <article className="clientes-summary-card">
          <p className="clientes-summary-label">Investimento total mensal</p>
          <p className="clientes-summary-value">{formatCurrency(resumo.investimentoTotal)}</p>
        </article>
        <article className="clientes-summary-card">
          <p className="clientes-summary-label">Saldo total disponivel</p>
          <p className="clientes-summary-value">{formatCurrency(resumo.saldoTotal)}</p>
        </article>
        <article className="clientes-summary-card clientes-summary-card-danger">
          <p className="clientes-summary-label">Clientes com saldo critico</p>
          <p className="clientes-summary-value">{formatNumber(resumo.criticos)}</p>
        </article>
      </div>

      <div className="clientes-filters-panel">
        <div className="clientes-search-box">
          <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar por cliente, AdAccount ou ID Meta..."
            disabled={isBusy}
          />
        </div>
        <div className="clientes-filter-grid">
          <select value={nichoFilter} onChange={(event) => setNichoFilter(event.target.value)} disabled={isBusy}>
            <option value="">Todos os nichos</option>
            {nichoOptions.map((nicho) => (
              <option key={nicho} value={nicho}>
                {nicho}
              </option>
            ))}
          </select>
          <select value={formaFilter} onChange={(event) => setFormaFilter(event.target.value)} disabled={isBusy}>
            <option value="">Todas as formas</option>
            {FORMA_PAGAMENTO_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select value={periodoFilter} onChange={(event) => setPeriodoFilter(event.target.value)} disabled={isBusy}>
            <option value="">Todos os periodos</option>
            {PERIODO_COBRANCA_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <select
            value={statusFinanceiroFilter}
            onChange={(event) => setStatusFinanceiroFilter(event.target.value)}
            disabled={isBusy}
          >
            <option value="">Status financeiro</option>
            <option value="critico">Critico</option>
            <option value="atencao">Atencao</option>
            <option value="ok">OK</option>
          </select>
        </div>
      </div>

      <div className="clientes-actions-toolbar">
        <div className="clientes-actions-group">
          <button type="button" className="primary-btn" onClick={handleVerTodos} disabled={isBusy}>
            {loading ? 'Atualizando...' : 'Ver todos'}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleVisualizarSelecionados}
            disabled={isBusy || selectedIds.length === 0}
          >
            Apenas selecionados
          </button>
          {showOnlySelected ? <span className="clientes-chip">Filtro ativo: selecionados</span> : null}
        </div>
        <div className="clientes-actions-group clientes-actions-danger">
          <button
            type="button"
            className="table-action-btn table-action-btn-secondary"
            onClick={handleExcluirSelecionados}
            disabled={isBusy || selectedIds.length === 0}
          >
            {deletingLoading ? 'Excluindo...' : 'Excluir selecionados'}
          </button>
          <button type="button" className="table-action-btn" onClick={loadClientes} disabled={isBusy}>
            Atualizar lista
          </button>
        </div>
      </div>

      {selectedIds.length > 0 ? (
        <div className="clientes-context-bar">
          <p>
            <strong>{formatNumber(selectedIds.length)}</strong> cliente(s) selecionado(s)
          </p>
          <div className="clientes-context-actions">
            <select
              value={bulkPeriodoCobranca}
              onChange={(event) => setBulkPeriodoCobranca(event.target.value)}
              disabled={isBusy}
            >
              <option value="">Alterar periodo</option>
              {PERIODO_COBRANCA_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="table-action-btn"
              onClick={() => handleBulkUpdate('periodo_cobranca', bulkPeriodoCobranca, 'Periodo de cobranca')}
              disabled={isBusy || !bulkPeriodoCobranca}
            >
              Aplicar periodo
            </button>
            <select
              value={bulkFormaPagamento}
              onChange={(event) => setBulkFormaPagamento(event.target.value)}
              disabled={isBusy}
            >
              <option value="">Atualizar forma</option>
              {FORMA_PAGAMENTO_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="table-action-btn"
              onClick={() => handleBulkUpdate('forma_pagamento', bulkFormaPagamento, 'Forma de pagamento')}
              disabled={isBusy || !bulkFormaPagamento}
            >
              Aplicar forma
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? <p className="hint-ok">{feedback}</p> : null}
      {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}

      <div className="clientes-table-wrapper">
        <table className="clientes-table">
          <thead>
            <tr>
              <th className="clientes-select-cell">
                <div className="clientes-select-header">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) => toggleSelectAll(event.target.checked)}
                    disabled={filteredClientes.length === 0 || isBusy}
                    aria-label="Selecionar todos os clientes"
                  />
                  <small>
                    Sel.: {formatNumber(selectedIds.length)} de {formatNumber(filteredClientes.length)}
                  </small>
                </div>
              </th>
              <th>Name (Cliente)</th>
              <th>Nome (AdAccount)</th>
              <th>ID Meta AdAccount</th>
              <th>Data renovacao creditos</th>
              <th>Nicho de atuacao</th>
              <th className="clientes-col-money">Valor investido</th>
              <th>Forma de pagamento</th>
              <th>Periodo de cobranca</th>
              <th className="clientes-col-money">Saldo atual</th>
              <th>Status financeiro</th>
              <th className="clientes-col-money">Gasto diario</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredClientes.length === 0 ? (
              <tr>
                <td colSpan="13">Nenhum cliente encontrado com os filtros atuais.</td>
              </tr>
            ) : (
              filteredClientes.map((row) => {
                const isEditing = editingId === row.id
                const editingAdAccount = isEditing
                  ? adAccounts.find((adAccount) => String(adAccount.id) === String(editingForm.nome))
                  : null
                const renovacaoStatus = getRenovacaoStatus(row.data_renovacao_creditos)
                const financialStatus = getFinancialStatus(row)

                return (
                  <tr
                    key={row.id}
                    className={`${selectedSet.has(row.id) ? 'clientes-row-selected' : ''} ${
                      !isEditing ? 'clientes-row-clickable' : ''
                    }`}
                    onClick={(event) => handleRowClick(event, row)}
                  >
                    <td className="clientes-select-cell">
                      <input
                        type="checkbox"
                        checked={selectedSet.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        disabled={isBusy}
                        aria-label={`Selecionar cliente ${row.id}`}
                      />
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          className="clientes-cell-input"
                          type="text"
                          value={editingForm.name}
                          onChange={(event) => handleEditFieldChange('name', event.target.value)}
                          disabled={savingEdit}
                          required
                        />
                      ) : (
                        row.name || '-'
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          className="clientes-cell-select"
                          value={editingForm.nome}
                          onChange={(event) => handleEditFieldChange('nome', event.target.value)}
                          disabled={savingEdit}
                          required
                        >
                          <option value="">Selecione um AdAccount</option>
                          {adAccounts.map((adAccount) => (
                            <option key={adAccount.id} value={adAccount.id}>
                              {adAccount.name || adAccount.id_meta_ad_account}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.nome || '-'
                      )}
                    </td>
                    <td>{isEditing ? editingAdAccount?.id_meta_ad_account || '-' : row.id_meta_ad_account || '-'}</td>
                    <td>
                      {isEditing ? (
                        <input
                          className="clientes-cell-input"
                          type="date"
                          value={editingForm.data_renovacao_creditos}
                          onChange={(event) =>
                            handleEditFieldChange('data_renovacao_creditos', event.target.value)
                          }
                          disabled={savingEdit}
                          required
                        />
                      ) : (
                        <div className="clientes-date-status">
                          <span className={`clientes-date-badge ${renovacaoStatus.className}`}>
                            {formatDate(row.data_renovacao_creditos)}
                          </span>
                          <small className={`clientes-date-caption ${renovacaoStatus.className}`}>
                            {renovacaoStatus.caption}
                          </small>
                        </div>
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <input
                          className="clientes-cell-input"
                          type="text"
                          value={editingForm.nicho_atuacao}
                          onChange={(event) => handleEditFieldChange('nicho_atuacao', event.target.value)}
                          disabled={savingEdit}
                        />
                      ) : (
                        row.nicho_atuacao || '-'
                      )}
                    </td>
                    <td className="clientes-cell-money">
                      {isEditing ? (
                        <input
                          className="clientes-cell-input"
                          type="number"
                          step="0.01"
                          value={editingForm.valor_investido}
                          onChange={(event) => handleEditFieldChange('valor_investido', event.target.value)}
                          disabled={savingEdit}
                        />
                      ) : (
                        formatDecimal(row.valor_investido)
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          className="clientes-cell-select"
                          value={editingForm.forma_pagamento}
                          onChange={(event) => handleEditFieldChange('forma_pagamento', event.target.value)}
                          disabled={savingEdit}
                          required
                        >
                          <option value="">Selecione uma forma de pagamento</option>
                          {FORMA_PAGAMENTO_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.forma_pagamento || '-'
                      )}
                    </td>
                    <td>
                      {isEditing ? (
                        <select
                          className="clientes-cell-select"
                          value={editingForm.periodo_cobranca}
                          onChange={(event) => handleEditFieldChange('periodo_cobranca', event.target.value)}
                          disabled={savingEdit}
                          required
                        >
                          <option value="">Selecione um periodo de cobranca</option>
                          {PERIODO_COBRANCA_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        row.periodo_cobranca || '-'
                      )}
                    </td>
                    <td className="clientes-cell-money">
                      {isEditing ? (
                        <input
                          className="clientes-cell-input"
                          type="number"
                          step="0.01"
                          value={editingForm.saldo_atual}
                          onChange={(event) => handleEditFieldChange('saldo_atual', event.target.value)}
                          disabled={savingEdit}
                        />
                      ) : (
                        formatDecimal(row.saldo_atual)
                      )}
                    </td>
                    <td>
                      <span className={`clientes-financial-badge ${financialStatus.className}`}>
                        {financialStatus.label}
                      </span>
                    </td>
                    <td className="clientes-cell-money">
                      {isEditing ? (
                        <input
                          className="clientes-cell-input"
                          type="number"
                          step="0.01"
                          value={editingForm.gasto_diario}
                          onChange={(event) => handleEditFieldChange('gasto_diario', event.target.value)}
                          disabled={savingEdit}
                        />
                      ) : (
                        formatDecimal(row.gasto_diario)
                      )}
                    </td>
                    <td className="clientes-actions-cell">
                      {isEditing ? (
                        <div className="clientes-row-actions">
                          <button
                            type="button"
                            className="primary-btn table-action-btn"
                            onClick={handleSalvarEdicao}
                            disabled={
                              savingEdit ||
                              !editingForm.name.trim() ||
                              !editingForm.nome ||
                              !editingForm.data_renovacao_creditos ||
                              !editingForm.forma_pagamento ||
                              !editingForm.periodo_cobranca
                            }
                          >
                            {savingEdit ? 'Salvando...' : 'Salvar'}
                          </button>
                          <button
                            type="button"
                            className="table-action-btn table-action-btn-secondary"
                            onClick={cancelEdit}
                            disabled={savingEdit}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="table-action-btn"
                          onClick={() => startEdit(row)}
                          disabled={isBusy || (editingId !== null && editingId !== row.id)}
                        >
                          Editar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
