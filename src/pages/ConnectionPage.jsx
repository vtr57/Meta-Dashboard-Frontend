import { useCallback, useEffect, useState } from 'react'
import api from '../lib/api'
import { formatLogTime, logUiError, resolveLogStatus } from './pageUtils'

const FACEBOOK_OAUTH_MESSAGE_TYPE = 'facebook_oauth_result'

export default function ConnectionPage() {
  const [statusInfo, setStatusInfo] = useState({
    connected: false,
    has_valid_long_token: false,
    sync_requires_reconnect: true,
    id_meta_user: null,
    expired_at: null,
  })
  const [logs, setLogs] = useState([])
  const [syncRun, setSyncRun] = useState(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const handleFacebookLogin = () => {
    const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim()
    if (!apiBaseUrl) {
      setErrorMsg('Login Facebook indisponivel: configure VITE_API_BASE_URL.')
      return
    }
    const authUrl = `${apiBaseUrl}/api/facebook-auth/start?next=${encodeURIComponent(
      window.location.origin + '/app/conexao'
    )}&popup=1`
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

    if (window.opener && (fbConnected === '1' || fbError)) {
      window.opener.postMessage(
        {
          type: FACEBOOK_OAUTH_MESSAGE_TYPE,
          status: fbConnected === '1' ? 'success' : 'error',
          error: fbError || null,
        },
        window.location.origin
      )
      window.close()
      return
    }

    if (fbConnected === '1') {
      setErrorMsg('')
      setFeedback('Login com Facebook concluido com sucesso.')
      fetchConnectionStatus()
    }
    if (fbError) {
      setErrorMsg(`Falha no login com Facebook: ${fbError}`)
    }
  }, [fetchConnectionStatus])

  useEffect(() => {
    const onOAuthMessage = (event) => {
      const allowedOrigins = new Set([window.location.origin])
      const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim()
      if (apiBaseUrl) {
        try {
          allowedOrigins.add(new URL(apiBaseUrl).origin)
        } catch {
          // Ignore invalid env URL; keep current-origin only.
        }
      }

      if (!allowedOrigins.has(event.origin)) {
        return
      }
      const payload = event.data || {}
      if (payload.type !== FACEBOOK_OAUTH_MESSAGE_TYPE) {
        return
      }

      if (payload.status === 'success') {
        window.location.assign('/app/conexao')
        return
      }

      if (payload.status === 'error') {
        setFeedback('')
        setErrorMsg(`Falha no login com Facebook: ${payload.error || 'oauth_failed'}`)
      }
    }

    window.addEventListener('message', onOAuthMessage)
    return () => window.removeEventListener('message', onOAuthMessage)
  }, [])

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

  const connectedViaOAuth = statusInfo.has_valid_long_token

  return (
    <section className="view-card view-card-meta">
      <div className="sync-block">
        <button type="button" className="primary-btn" onClick={handleFacebookLogin}>
          Entrar com Facebook
        </button>
      </div>

      <h2>Conexao / Sincronizacao</h2>
      <p className="view-description">
        Nesta tela o usuario conecta a conta Meta e inicia a sincronizacao completa.
      </p>

      {connectedViaOAuth ? (
        <p className="hint-ok">
          Conta Meta conectada com token valido.
        </p>
      ) : (
        <p className="hint-warning">
          Conexao obrigatoria: use o botao Entrar com Facebook para continuar.
        </p>
      )}

      {statusInfo.id_meta_user ? (
        <p className="hint-neutral">Conta Meta conectada: {statusInfo.id_meta_user}</p>
      ) : null}

      {statusInfo.expired_at ? (
        <p className="hint-neutral">Expiracao do token atual: {new Date(statusInfo.expired_at).toLocaleString('pt-BR')}</p>
      ) : null}

      <div className="sync-block">
        <h3>Bloco 1: Sincronizacao</h3>
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
