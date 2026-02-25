import { useCallback, useEffect, useState } from 'react'
import api from '../lib/api'
import { formatLogTime, logUiError, resolveLogStatus } from './pageUtils'

export default function ConnectionPage() {
  const [idMetaUser, setIdMetaUser] = useState('')
  const [shortToken, setShortToken] = useState('')
  const [statusInfo, setStatusInfo] = useState({
    connected: false,
    has_valid_long_token: false,
    sync_requires_reconnect: true,
    id_meta_user: null,
    expired_at: null,
  })
  const [logs, setLogs] = useState([])
  const [syncRun, setSyncRun] = useState(null)
  const [connectLoading, setConnectLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleFacebookLogin = () => {
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim()
    if (!apiBaseUrl) {
      setErrorMsg('Login Facebook indisponivel: configure VITE_API_BASE_URL. Use o fallback manual abaixo.')
      return
    }
    const authUrl = `${apiBaseUrl}/api/facebook-auth/start?next=${encodeURIComponent(
      window.location.origin + '/app/conexao'
    )}`
    const popup = window.open(
      authUrl,
      'facebook_oauth_login',
      'width=620,height=760,menubar=no,toolbar=no,location=yes,status=no,resizable=yes,scrollbars=yes'
    )

    if (!popup) {
      setErrorMsg('Nao foi possivel abrir o popup. Libere popups para este site e tente novamente.')
      return
    }

    setErrorMsg('')
    setFeedback('Conclua o login com Facebook na janela popup.')

    const popupPoll = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(popupPoll)
        fetchConnectionStatus()
        return
      }

      try {
        const popupUrl = new URL(popup.location.href)
        const isConnectionRoute = popupUrl.origin === window.location.origin && popupUrl.pathname === '/app/conexao'
        if (!isConnectionRoute) {
          return
        }

        const fbConnected = popupUrl.searchParams.get('fb_connected')
        const fbError = popupUrl.searchParams.get('fb_error')
        if (fbConnected === '1') {
          setErrorMsg('')
          setFeedback('Login com Facebook concluido com sucesso.')
          fetchConnectionStatus()
          popup.close()
          window.clearInterval(popupPoll)
          return
        }
        if (fbError) {
          setFeedback('')
          setErrorMsg(`Falha no login com Facebook: ${fbError}`)
          popup.close()
          window.clearInterval(popupPoll)
        }
      } catch {
        // Ignora erros de leitura enquanto popup estiver em origem diferente.
      }
    }, 500)
  }

  const fetchConnectionStatus = useCallback(async () => {
    try {
      const response = await api.get('/api/meta/connection-status')
      const data = response.data || {}
      setStatusInfo({
        connected: !!data.connected,
        has_valid_long_token: !!data.has_valid_long_token,
        sync_requires_reconnect: !!data.sync_requires_reconnect,
        id_meta_user: data.id_meta_user || null,
        expired_at: data.expired_at || null,
      })
      if (data.id_meta_user) {
        setIdMetaUser(data.id_meta_user)
      }
    } catch (error) {
      logUiError('conexao-sincronizacao', 'meta-connection-status', error)
      setErrorMsg('Nao foi possivel carregar o status da conexao Meta.')
    }
  }, [])

  useEffect(() => {
    fetchConnectionStatus()
  }, [fetchConnectionStatus])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const fbConnected = params.get('fb_connected')
    const fbError = params.get('fb_error')

    if (fbConnected === '1') {
      setErrorMsg('')
      setFeedback('Login com Facebook concluido com sucesso.')
      fetchConnectionStatus()
    }
    if (fbError) {
      setErrorMsg(`Falha no login com Facebook: ${fbError}`)
    }
  }, [fetchConnectionStatus])

  const handleConnect = async () => {
    setConnectLoading(true)
    setErrorMsg('')
    setFeedback('')
    try {
      await api.post('/api/meta/connect', {
        id_meta_user: idMetaUser,
        short_token: shortToken,
      })
      setFeedback('Conta Meta conectada com sucesso.')
      setShortToken('')
      await fetchConnectionStatus()
    } catch (error) {
      logUiError('conexao-sincronizacao', 'meta-connect', error)
      setErrorMsg(error.response?.data?.detail || 'Falha ao conectar conta Meta.')
    } finally {
      setConnectLoading(false)
    }
  }

  const handleSyncStart = async (endpoint, feedbackMessage = 'Sincronizacao iniciada.') => {
    setSyncLoading(true)
    setErrorMsg('')
    setFeedback('')
    try {
      const response = await api.post(endpoint)
      const runId = response.data?.sync_run_id
      if (runId) {
        setLogs([])
        setSyncRun({
          id: runId,
          status: response.data?.status || 'pending',
          is_finished: false,
        })
        setFeedback(feedbackMessage)
      }
    } catch (error) {
      logUiError('conexao-sincronizacao', 'meta-sync-start', error)
      const detail = error.response?.data?.detail || 'Falha ao iniciar sincronizacao.'
      const requiresReconnect = !!error.response?.data?.sync_requires_reconnect
      setErrorMsg(detail)
      if (requiresReconnect) {
        fetchConnectionStatus()
      }
    } finally {
      setSyncLoading(false)
    }
  }

  const handleSync = () => handleSyncStart('/api/meta/sync/start', 'Sincronizacao iniciada.')
  const handleSyncMeta = () => handleSyncStart('/api/meta/sync/start/meta', 'Sincronizacao Meta iniciada.')
  const handleSyncInstagram = () =>
    handleSyncStart('/api/meta/sync/start/instagram', 'Sincronizacao Instagram iniciada.')
  const handleSyncInsights7d = () =>
    handleSyncStart('/api/meta/sync/start/insights-7d', 'Sincronizacao de insights (7 dias) iniciada.')

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
          setLogs((prev) => [...prev, ...incomingLogs])
        }
        sinceId = payload.next_since_id || sinceId
        const run = payload.sync_run || {}
        const finished = !!run.is_finished
        setSyncRun({
          id: syncRun.id,
          status: run.status || syncRun.status,
          is_finished: finished,
        })
        if (!finished && !canceled) {
          timer = window.setTimeout(poll, 2000)
        } else if (finished) {
          fetchConnectionStatus()
          if (run.status === 'success') {
            setFeedback('Sincronizacao concluida com sucesso.')
          } else {
            setErrorMsg('Sincronizacao finalizou com erro.')
          }
        }
      } catch (error) {
        logUiError('conexao-sincronizacao', 'meta-sync-logs', error)
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
  }, [syncRun?.id, syncRun?.is_finished, fetchConnectionStatus])

  const connectOptional = statusInfo.has_valid_long_token

  return (
    <section className="view-card view-card-meta">
      <div className="sync-block">
        <button type="button" className="primary-btn" onClick={handleFacebookLogin}>
          Entrar com Facebook
        </button>
        <p className="hint-neutral">Fallback tecnico: voce pode conectar manualmente via id_meta_user + short_token.</p>
      </div>

      <h2>Conexao / Sincronizacao</h2>
      <p className="view-description">
        Nesta tela o usuario conecta a conta Meta e inicia a sincronizacao completa.
      </p>

      {connectOptional ? (
        <p className="hint-ok">
          Long token valido encontrado. Conectar agora e opcional.
        </p>
      ) : (
        <p className="hint-warning">
          Conexao obrigatoria: informe `id_meta_user` e `short_token` para continuar.
        </p>
      )}

      {statusInfo.expired_at ? (
        <p className="hint-neutral">Expiracao do token atual: {new Date(statusInfo.expired_at).toLocaleString('pt-BR')}</p>
      ) : null}

      <div className="sync-block">
        <h3>Bloco 1: Conexao</h3>
        <div className="form-grid">
          <label htmlFor="meta-id">id_meta_user</label>
          <input
            id="meta-id"
            placeholder="Digite o id_meta_user"
            value={idMetaUser}
            onChange={(event) => setIdMetaUser(event.target.value)}
          />
          <label htmlFor="short-token">short_token</label>
          <input
            id="short-token"
            placeholder="Digite o short_token"
            value={shortToken}
            onChange={(event) => setShortToken(event.target.value)}
          />
          <button
            type="button"
            className="primary-btn"
            onClick={handleConnect}
            disabled={connectLoading || !idMetaUser || !shortToken}
          >
            {connectLoading ? 'Conectando...' : 'Conectar'}
          </button>
        </div>
      </div>

      <div className="sync-block">
        <h3>Bloco 2: Sincronizacao</h3>
        <div className="sync-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={handleSync}
            disabled={syncLoading || (syncRun && !syncRun.is_finished)}
          >
            {syncLoading || (syncRun && !syncRun.is_finished) ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleSyncMeta}
            disabled={syncLoading || (syncRun && !syncRun.is_finished)}
          >
            {syncLoading || (syncRun && !syncRun.is_finished) ? 'Sincronizando...' : 'Sincronizar Meta'}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleSyncInsights7d}
            disabled={syncLoading || (syncRun && !syncRun.is_finished)}
          >
            {syncLoading || (syncRun && !syncRun.is_finished)
              ? 'Sincronizando...'
              : 'Sincronizar (7 dias)'}
          </button>
          <button
            type="button"
            className="primary-btn"
            onClick={handleSyncInstagram}
            disabled={syncLoading || (syncRun && !syncRun.is_finished)}
          >
            {syncLoading || (syncRun && !syncRun.is_finished) ? 'Sincronizando...' : 'Sincronizar Instagram'}
          </button>
        </div>
        {syncRun ? <span className="sync-status">Status: {syncRun.status}</span> : null}
      </div>

      {feedback ? <p className="hint-ok">{feedback}</p> : null}
      {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}

      <div className="logs-box">
        {logs.length === 0 ? (
          <p>[--:--:--] [sync] [extraindo] Aguardando inicio da sincronizacao...</p>
        ) : (
          logs.map((log) => {
            const logStatus = resolveLogStatus(log)
            return (
              <p key={log.id}>
                [{formatLogTime(log.timestamp)}] [{log.entidade}] [{logStatus}] {log.mensagem}
              </p>
            )
          })
        )}
      </div>
    </section>
  )
}
