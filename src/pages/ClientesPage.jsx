import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../lib/api'
import { formatDate, formatDecimal, formatNumber, logUiError, toInputDate } from './pageUtils'

const FORMA_PAGAMENTO_OPTIONS = ['PIX', 'CARTAO CREDITO']
const PERIODO_COBRANCA_OPTIONS = ['SEMANAL', 'MENSAL']

function formatSaldoSyncFeedback(saldoSync) {
  if (!saldoSync || typeof saldoSync !== 'object') return ''

  const updatedClientes = Number(saldoSync.updated_clientes || 0)
  const totalAdAccounts = Number(saldoSync.total_ad_accounts || 0)
  const errorCount = Number(saldoSync.error_count || 0)
  const parseErrorCount = Number(saldoSync.parse_error_count || 0)
  const totalIssues = errorCount + parseErrorCount

  if (saldoSync.skipped) {
    const detail = String(saldoSync.detail || '').trim()
    return detail ? `Sincronizacao de saldo nao executada: ${detail}.` : 'Sincronizacao de saldo nao executada.'
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
    <section className="view-card clientes-view">
      <h2>Clientes / Cadastrar</h2>
      <p className="view-description">
        Cadastre clientes informando o AdAccount, data de renovacao e dados financeiros/comerciais.
      </p>

      <form className="sync-block clientes-form" onSubmit={handleSubmit}>
        <h3>Formulario de cadastro</h3>
        <div className="form-grid">
          <label htmlFor="cliente-name">Name (Cliente)</label>
          <input
            id="cliente-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={submitting}
            placeholder="Digite o name do cliente"
            required
          />

          <label htmlFor="cliente-nome">AdAccount (campo nome)</label>
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
                {row.name || row.id_meta_ad_account}
              </option>
            ))}
          </select>

          <label htmlFor="data-renovacao">Data de renovacao dos creditos</label>
          <input
            id="data-renovacao"
            type="date"
            value={dataRenovacaoCreditos}
            onChange={(event) => setDataRenovacaoCreditos(event.target.value)}
            disabled={submitting}
            required
          />

          <label htmlFor="cliente-nicho">Nicho de atuacao</label>
          <input
            id="cliente-nicho"
            type="text"
            value={nichoAtuacao}
            onChange={(event) => setNichoAtuacao(event.target.value)}
            disabled={submitting}
            placeholder="Ex.: Ecommerce"
          />

          <label htmlFor="cliente-valor-investido">Valor investido</label>
          <input
            id="cliente-valor-investido"
            type="number"
            step="0.01"
            value={valorInvestido}
            onChange={(event) => setValorInvestido(event.target.value)}
            disabled={submitting}
            placeholder="0.00"
          />

          <label htmlFor="cliente-forma-pagamento">Forma de pagamento</label>
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

          <label htmlFor="cliente-periodo-cobranca">Periodo de cobranca</label>
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

          <label htmlFor="cliente-saldo-atual">Saldo atual</label>
          <input
            id="cliente-saldo-atual"
            type="number"
            step="0.01"
            value={saldoAtual}
            onChange={(event) => setSaldoAtual(event.target.value)}
            disabled={submitting}
            placeholder="0.00"
          />

          <label htmlFor="cliente-gasto-diario">Gasto diario</label>
          <input
            id="cliente-gasto-diario"
            type="number"
            step="0.01"
            value={gastoDiario}
            onChange={(event) => setGastoDiario(event.target.value)}
            disabled={submitting}
            placeholder="0.00"
          />

          <button
            type="submit"
            className="primary-btn"
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
            {submitting ? 'Cadastrando...' : 'Cadastrar cliente'}
          </button>
        </div>
      </form>

      {accountsLoading ? <p className="hint-neutral">Carregando AdAccounts...</p> : null}
      {!accountsLoading && adAccounts.length === 0 ? (
        <p className="hint-warning">Nenhum AdAccount disponivel para cadastro.</p>
      ) : null}
      {feedback ? <p className="hint-ok">{feedback}</p> : null}
      {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}
    </section>
  )
}

export function ClientesVisualizarPage() {
  const [clientes, setClientes] = useState([])
  const [adAccounts, setAdAccounts] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [requestLoading, setRequestLoading] = useState(false)
  const [deletingLoading, setDeletingLoading] = useState(false)
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
  const allSelected = clientes.length > 0 && selectedIds.length === clientes.length
  const isBusy = loading || requestLoading || deletingLoading || savingEdit

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
    setSelectedIds(clientes.map((row) => row.id))
  }

  const handleVisualizarSelecionados = async () => {
    if (selectedIds.length === 0) {
      setErrorMsg('Selecione ao menos um cliente para visualizar.')
      setFeedback('')
      return
    }

    setRequestLoading(true)
    setErrorMsg('')
    setFeedback('')
    try {
      const response = await api.get('/api/empresa/clientes', {
        params: { ids: selectedIds.join(',') },
      })
      const rows = response.data?.clientes || []
      setClientes(rows)
      setSelectedIds(rows.map((row) => row.id))
      setEditingId(null)
      setFeedback(`Exibindo ${formatNumber(rows.length)} cliente(s) selecionado(s).`)
    } catch (error) {
      logUiError('clientes-visualizar', 'empresa-clientes-get-by-ids', error)
      setErrorMsg(error.response?.data?.detail || 'Falha ao visualizar clientes selecionados.')
    } finally {
      setRequestLoading(false)
    }
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

  return (
    <section className="view-card clientes-view">
      <h2>Clientes / Visualizar</h2>
      <p className="view-description">Visualize todos os clientes ou apenas os selecionados.</p>

      <div className="clientes-actions">
        <button
          type="button"
          className="primary-btn"
          onClick={handleVisualizarSelecionados}
          disabled={isBusy || selectedIds.length === 0}
        >
          {requestLoading ? 'Carregando selecionados...' : 'Visualizar selecionados'}
        </button>
        <button type="button" className="primary-btn" onClick={loadClientes} disabled={isBusy}>
          {loading ? 'Atualizando...' : 'Ver todos'}
        </button>
        <button
          type="button"
          className="table-action-btn table-action-btn-secondary"
          onClick={handleExcluirSelecionados}
          disabled={isBusy || selectedIds.length === 0}
        >
          {deletingLoading ? 'Excluindo...' : 'Excluir selecionados'}
        </button>
        <span className="hint-neutral">
          Selecionados: {formatNumber(selectedIds.length)} de {formatNumber(clientes.length)}
        </span>
      </div>

      {feedback ? <p className="hint-ok">{feedback}</p> : null}
      {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}

      <div className="clientes-table-wrapper">
        <table className="clientes-table">
          <thead>
            <tr>
              <th className="clientes-select-cell">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(event) => toggleSelectAll(event.target.checked)}
                  disabled={clientes.length === 0 || isBusy}
                  aria-label="Selecionar todos os clientes"
                />
              </th>
              <th>Name (Cliente)</th>
              <th>Nome (AdAccount)</th>
              <th>ID Meta AdAccount</th>
              <th>Data renovacao creditos</th>
              <th>Nicho de atuacao</th>
              <th>Valor investido</th>
              <th>Forma de pagamento</th>
              <th>Periodo de cobranca</th>
              <th>Saldo atual</th>
              <th>Gasto diario</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {clientes.length === 0 ? (
              <tr>
                <td colSpan="12">Nenhum cliente encontrado.</td>
              </tr>
            ) : (
              clientes.map((row) => {
                const isEditing = editingId === row.id
                const editingAdAccount = isEditing
                  ? adAccounts.find((adAccount) => String(adAccount.id) === String(editingForm.nome))
                  : null

                return (
                  <tr key={row.id} className={selectedSet.has(row.id) ? 'clientes-row-selected' : ''}>
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
                        formatDate(row.data_renovacao_creditos)
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
                    <td>
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
                    <td>
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
