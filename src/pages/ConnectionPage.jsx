import { useCallback, useEffect, useState } from 'react'
import api from '../lib/api'
import { formatLogTime, logUiError, resolveLogStatus } from './pageUtils'

const FACEBOOK_OAUTH_MESSAGE_TYPE = 'facebook_oauth_result'
const LAST_SYNC_AT_STORAGE_KEY = 'meta_last_sync_at'
const ESTIMATED_SYNC_TIME_TEXT = '30 a 90 segundos'
const SYNC_SCOPE_ALL = 'all'
const SYNC_SCOPE_META = 'meta'
const SYNC_SCOPE_INSTAGRAM = 'instagram'
const SYNC_STAGE_IDS_BY_SCOPE = {
  [SYNC_SCOPE_ALL]: [
    'ad_account',
    'campaign',
    'adset',
    'ad',
    'ad_insights',
    'facebook_page',
    'instagram_account',
    'instagram_insights',
    'media',
    'media_insights',
  ],
  [SYNC_SCOPE_META]: ['ad_account', 'campaign', 'adset', 'ad', 'ad_insights'],
  [SYNC_SCOPE_INSTAGRAM]: ['facebook_page', 'instagram_account', 'instagram_insights', 'media', 'media_insights'],
}
const SYNC_STAGE_DEFINITIONS = {
  ad_account: {
    id: 'ad_account',
    label: 'Ad Account',
    icon: 'fa-users-viewfinder',
    entities: ['ad_accounts'],
    messageTokens: ['ad_accounts_upserted'],
  },
  campaign: {
    id: 'campaign',
    label: 'Campaign',
    icon: 'fa-bullhorn',
    entities: ['campaigns', 'campaigns_batch'],
    messageTokens: ['campaigns_upserted'],
  },
  adset: {
    id: 'adset',
    label: 'AdSet',
    icon: 'fa-layer-group',
    entities: ['adsets', 'adsets_batch'],
    messageTokens: ['adsets_upserted'],
  },
  ad: {
    id: 'ad',
    label: 'Ad',
    icon: 'fa-rectangle-ad',
    entities: ['ads', 'ads_batch'],
    messageTokens: ['ads_upserted'],
  },
  ad_insights: {
    id: 'ad_insights',
    label: 'Ad Insights',
    icon: 'fa-chart-line',
    entities: ['ad_insights'],
    messageTokens: ['ad_insight_upserts', 'ad_insight_rows_seen'],
  },
  facebook_page: {
    id: 'facebook_page',
    label: 'Facebook Page',
    icon: 'fa-facebook',
    entities: ['facebook_pages'],
    messageTokens: ['paginas sincronizadas'],
  },
  instagram_account: {
    id: 'instagram_account',
    label: 'Instagram Account',
    icon: 'fa-instagram',
    entities: ['instagram_accounts'],
    messageTokens: ['instagram_accounts_upserted'],
  },
  instagram_insights: {
    id: 'instagram_insights',
    label: 'Instagram Insights',
    icon: 'fa-chart-column',
    entities: ['instagram_account_insights'],
    messageTokens: ['instagram_accounts_with_insights'],
  },
  media: {
    id: 'media',
    label: 'Media',
    icon: 'fa-photo-film',
    entities: ['instagram_media'],
    messageTokens: ['media_upserts'],
  },
  media_insights: {
    id: 'media_insights',
    label: 'Media Insights',
    icon: 'fa-magnifying-glass-chart',
    entities: ['instagram_media_insights'],
    entityPrefixes: ['instagram_media_insights_'],
    messageTokens: ['media_insight_updates'],
  },
}

function normalizeSyncText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function inferSyncScopeFromEndpoint(endpoint) {
  if (endpoint === '/api/meta/sync/start/meta') return SYNC_SCOPE_META
  if (endpoint === '/api/meta/sync/start/instagram') return SYNC_SCOPE_INSTAGRAM
  return SYNC_SCOPE_ALL
}

function resolveStageIdsByScope(scope) {
  if (scope === SYNC_SCOPE_META) return SYNC_STAGE_IDS_BY_SCOPE[SYNC_SCOPE_META]
  if (scope === SYNC_SCOPE_INSTAGRAM) return SYNC_STAGE_IDS_BY_SCOPE[SYNC_SCOPE_INSTAGRAM]
  return SYNC_STAGE_IDS_BY_SCOPE[SYNC_SCOPE_ALL]
}

function isStageSignaled(stage, entity, message) {
  if (stage.entities?.includes(entity)) return true
  if ((stage.entityPrefixes || []).some((prefix) => entity.startsWith(prefix))) return true
  if ((stage.messageTokens || []).some((token) => message.includes(token))) return true
  return false
}

function resolveExtractedStageIds(logs) {
  const extracted = new Set()
  for (const row of logs) {
    const entity = normalizeSyncText(row.entidade)
    const message = normalizeSyncText(row.mensagem)
    for (const stageId of Object.keys(SYNC_STAGE_DEFINITIONS)) {
      const stage = SYNC_STAGE_DEFINITIONS[stageId]
      if (isStageSignaled(stage, entity, message)) {
        extracted.add(stage.id)
      }
    }
  }
  return extracted
}

function getStoredLastSyncAt() {
  try {
    const raw = window.localStorage.getItem(LAST_SYNC_AT_STORAGE_KEY)
    return raw ? String(raw) : ''
  } catch {
    return ''
  }
}

function persistLastSyncAt(value) {
  if (!value) return
  try {
    window.localStorage.setItem(LAST_SYNC_AT_STORAGE_KEY, String(value))
  } catch {
    // Ignore storage errors in restrictive environments.
  }
}

function formatSyncStatusLabel(status) {
  if (status === 'running') return 'Em andamento'
  if (status === 'success') return 'Concluida'
  if (status === 'failed') return 'Falhou'
  if (status === 'pending') return 'Na fila'
  return 'Pronta'
}

function buildSyncStageState(syncRun, logs) {
  const stageIds = resolveStageIdsByScope(syncRun?.sync_scope)
  const scopedStages = stageIds.map((stageId) => SYNC_STAGE_DEFINITIONS[stageId])

  if (!syncRun) {
    return {
      progress: 0,
      stages: scopedStages.map((stage) => ({ ...stage, status: 'pending' })),
    }
  }

  const extractedStageIds = resolveExtractedStageIds(logs)
  const allDone = syncRun.status === 'success'
  const totalStages = scopedStages.length || 1
  const doneCount = allDone ? totalStages : stageIds.filter((stageId) => extractedStageIds.has(stageId)).length
  const firstPendingIndex = stageIds.findIndex((stageId) => !extractedStageIds.has(stageId))

  let progress = 0
  if (syncRun.status === 'success') {
    progress = 100
  } else if (syncRun.status === 'failed') {
    progress = Math.max(8, Math.round((doneCount / totalStages) * 100))
  } else {
    progress = Math.min(95, Math.round((doneCount / totalStages) * 100))
  }

  const stages = scopedStages.map((stage, index) => {
    if (allDone || extractedStageIds.has(stage.id)) {
      return { ...stage, status: 'done' }
    }
    if (syncRun.status === 'failed' && index === (firstPendingIndex === -1 ? 0 : firstPendingIndex)) {
      return { ...stage, status: 'failed' }
    }
    if (!syncRun.is_finished && index === (firstPendingIndex === -1 ? scopedStages.length - 1 : firstPendingIndex)) {
      return { ...stage, status: 'active' }
    }
    return { ...stage, status: 'pending' }
  })

  return { progress, stages }
}

function stageStatusIcon(status) {
  if (status === 'done') return 'fa-circle-check'
  if (status === 'active') return 'fa-spinner fa-spin'
  if (status === 'failed') return 'fa-circle-xmark'
  return 'fa-circle'
}

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
  const [lastSyncAt, setLastSyncAt] = useState(() => getStoredLastSyncAt())
  const [trackingPaused, setTrackingPaused] = useState(false)

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
    setTrackingPaused(false)
    try {
      const response = await api.post(endpoint)
      const runId = response.data?.sync_run_id
      if (runId) {
        const syncScope = response.data?.sync_scope || inferSyncScopeFromEndpoint(endpoint)
        setLogs([])
        setSyncRun({
          id: runId,
          status: response.data?.status || 'pending',
          is_finished: false,
          sync_scope: syncScope,
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
  const handleCancelSync = () => {
    if (!syncRun || syncRun.is_finished) return
    setTrackingPaused(true)
    setFeedback('Acompanhamento pausado nesta tela. A sincronizacao segue no servidor.')
    setErrorMsg('')
  }
  const handleResumeTracking = () => {
    if (!syncRun || syncRun.is_finished) return
    setTrackingPaused(false)
    setFeedback('Acompanhamento retomado.')
    setErrorMsg('')
  }

  useEffect(() => {
    if (!syncRun?.id || syncRun?.is_finished || trackingPaused) return
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
        setSyncRun((prev) => ({
          id: prev?.id || syncRun.id,
          status: run.status || prev?.status || syncRun.status,
          is_finished: finished,
          sync_scope: prev?.sync_scope || syncRun.sync_scope || null,
        }))
        if (!finished && !canceled) {
          timer = window.setTimeout(poll, 2000)
        } else if (finished) {
          const finishedAt = run.finished_at || new Date().toISOString()
          setLastSyncAt(finishedAt)
          persistLastSyncAt(finishedAt)
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
  }, [syncRun?.id, syncRun?.is_finished, trackingPaused, fetchConnectionStatus])

  const connectedViaOAuth = statusInfo.has_valid_long_token
  const syncInProgress = !!syncRun && !syncRun.is_finished
  const canStartSync = !syncLoading && !syncInProgress
  const syncStatusLabel = syncRun ? formatSyncStatusLabel(syncRun.status) : 'Pronta'
  const { progress, stages } = buildSyncStageState(syncRun, logs)
  const lastSyncLabel = lastSyncAt ? new Date(lastSyncAt).toLocaleString('pt-BR') : 'Nenhuma sincronizacao finalizada.'
  const syncStatusClass = syncRun ? `status-${syncRun.status}` : 'status-idle'

  return (
    <section className="view-card view-card-meta connection-view">
      <header className="connection-page-header">
        <h2>
          <i className="fa-solid fa-link" aria-hidden="true" /> Conexão / Sincronização
        </h2>
        <p className="view-description">
          Passo 1: conectar conta. Passo 2: sincronizar dados. Passo 3: acompanhar logs em tempo real.
        </p>
      </header>

      {feedback ? <p className="hint-ok">{feedback}</p> : null}
      {errorMsg ? <p className="hint-error">{errorMsg}</p> : null}

      <div className="connection-layout">
        <div className="connection-column-main">
          <article className="connection-card">
            <div className="connection-card-title">
              <h3>
                <i className="fa-solid fa-shield-heart" aria-hidden="true" /> Conexao com Meta
              </h3>
              <span className={`sync-status-badge ${connectedViaOAuth ? 'status-success' : 'status-failed'}`}>
                {connectedViaOAuth ? 'Conectada' : 'Desconectada'}
              </span>
            </div>

            <p className={`connection-state-line ${connectedViaOAuth ? 'connection-state-ok' : 'connection-state-off'}`}>
              <i
                className={`fa-solid ${connectedViaOAuth ? 'fa-circle-check' : 'fa-circle-xmark'}`}
                aria-hidden="true"
              />{' '}
              <strong>{connectedViaOAuth ? 'Conta conectada e pronta para sincronizar.' : 'Conta nao conectada.'}</strong>
            </p>

            <div className="connection-meta-grid">
              <p>
                <span>Meta ID</span>
                <strong>{statusInfo.id_meta_user || '-'}</strong>
              </p>
              <p>
                <span>Token expira em</span>
                <strong>
                  {statusInfo.expired_at ? new Date(statusInfo.expired_at).toLocaleString('pt-BR') : '-'}
                </strong>
              </p>
              <p>
                <span>Ultima Sincronização</span>
                <strong>{lastSyncLabel}</strong>
              </p>
            </div>

            <button type="button" className="primary-btn sync-primary-btn" onClick={handleFacebookLogin}>
              <i className="fa-brands fa-facebook" aria-hidden="true" />{' '}
              {connectedViaOAuth ? 'Reconectar conta' : 'Conectar com Facebook'}
            </button>
          </article>

          <article className="connection-card">
            <div className="connection-card-title">
              <h3>
                <i className="fa-solid fa-rotate" aria-hidden="true" /> Sincronização
              </h3>
              <span className={`sync-status-badge ${syncStatusClass}`}>{syncStatusLabel}</span>
            </div>

            <div className="sync-summary">
              <p>
                <i className="fa-regular fa-clock" aria-hidden="true" /> Tempo estimado: {ESTIMATED_SYNC_TIME_TEXT}
              </p>
              {syncRun ? <p>SyncRun ID: {syncRun.id}</p> : <p>Nenhuma sincronizacao ativa.</p>}
            </div>

            <div className="sync-group">
              <p className="sync-group-title">Sincronizacao Completa</p>
              <button
                type="button"
                className="primary-btn sync-primary-btn"
                onClick={handleSync}
                disabled={!canStartSync}
              >
                <i className="fa-solid fa-cloud-arrow-down" aria-hidden="true" />{' '}
                {syncInProgress ? 'Sincronizando...' : 'Sincronizar Tudo'}
              </button>
              <p className="sync-group-caption">Extrai contas, campanhas, anuncios e insights.</p>
            </div>

            <div className="sync-group">
              <p className="sync-group-title">Sincronizacao Parcial</p>
              <div className="sync-actions-grid">
                <button type="button" className="table-action-btn" onClick={handleSyncInsights7d} disabled={!canStartSync}>
                  <i className="fa-solid fa-calendar-week" aria-hidden="true" /> Ultimos 7 dias
                </button>
                <button type="button" className="table-action-btn" onClick={handleSyncInstagram} disabled={!canStartSync}>
                  <i className="fa-brands fa-instagram" aria-hidden="true" /> Apenas Instagram
                </button>
                <button type="button" className="table-action-btn" onClick={handleSyncMeta} disabled={!canStartSync}>
                  <i className="fa-brands fa-meta" aria-hidden="true" /> Apenas Meta Ads
                </button>
              </div>
            </div>

            {syncInProgress ? (
              <div className="sync-tracking-controls">
                {trackingPaused ? (
                  <button type="button" className="table-action-btn" onClick={handleResumeTracking}>
                    <i className="fa-solid fa-play" aria-hidden="true" /> Retomar acompanhamento
                  </button>
                ) : (
                  <button type="button" className="table-action-btn table-action-btn-secondary" onClick={handleCancelSync}>
                    <i className="fa-solid fa-pause" aria-hidden="true" /> Cancelar sincronizacao
                  </button>
                )}
              </div>
            ) : null}
          </article>

        </div>

        <div className="connection-column-side">
          <article className="connection-card connection-logs-card">
            <div className="connection-card-title">
              <h3>
                <i className="fa-solid fa-terminal" aria-hidden="true" /> Logs da sincronização
              </h3>
              {syncRun ? <span className={`sync-status-badge ${syncStatusClass}`}>{syncStatusLabel}</span> : null}
            </div>
            <div className="logs-box connection-logs-box">
              {logs.length === 0 ? (
                <p className="connection-log-empty">
                  <i className="fa-regular fa-hourglass-half" aria-hidden="true" /> Aguardando inicio da sincronizacao...
                </p>
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
          </article>
          <article className="connection-card">
            <h3>
              <i className="fa-solid fa-list-check" aria-hidden="true" /> Progresso da sincronização
            </h3>
            <div className="sync-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <div className="sync-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <p className="sync-progress-value">{Math.round(progress)}% concluido</p>
            <ul className="sync-stage-list">
              {stages.map((stage) => (
                <li key={stage.id} className={`sync-stage-item ${stage.status}`}>
                  <span className="sync-stage-icon">
                    <i className={`fa-solid ${stageStatusIcon(stage.status)}`} aria-hidden="true" />
                  </span>
                  <span className="sync-stage-label">
                    <i className={`fa-solid ${stage.icon}`} aria-hidden="true" /> {stage.label}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  )
}
