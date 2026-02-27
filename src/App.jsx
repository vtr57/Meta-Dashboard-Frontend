import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ConnectionPage from './pages/ConnectionPage'
import { ClientesCadastrarPage, ClientesVisualizarPage } from './pages/ClientesPage'
import InstagramDashboardPage from './pages/InstagramDashboardPage'
import MetaDashboardPage from './pages/MetaDashboardPage'
import DataDeletionPage from './pages/DataDeletionPage'
import PrivacyPolicyPage from './pages/PrivacyPolicyPage'
import AppLayout from './components/AppLayout'
import { logUiError } from './pages/pageUtils'
import api, { setCsrfToken } from './lib/api'
import './App.css'

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    const result = await onLogin({ username, password })
    if (!result.ok) {
      setError(result.message)
    }

    setSubmitting(false)
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>Entrar</h1>
        <p className="login-subtitle">Use seu usuário e senha do sistema.</p>
        <p className="login-privacy-link">
          <a href="/politica-de-privacidade">Politica de Privacidade</a>
          {' | '}
          <a href="/exclusao-de-dados">Exclusao de Dados</a>
        </p>

        <label htmlFor="username">Usuário</label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />

        <label htmlFor="password">Senha</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        {error ? <p className="form-error">{error}</p> : null}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}

function App() {
  const [loadingSession, setLoadingSession] = useState(true)
  const [user, setUser] = useState(null)

  const loadSession = useCallback(async () => {
    try {
      const response = await api.get('/auth/me/')
      setCsrfToken(response.data?.csrfToken)
      if (response.data?.authenticated) {
        setUser(response.data.user)
      } else {
        setUser(null)
      }
    } catch {
      logUiError('app-root', 'session', 'Falha ao validar sessao')
      setUser(null)
    } finally {
      setLoadingSession(false)
    }
  }, [])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const onLogin = async (credentials) => {
    try {
      const csrfResponse = await api.get('/auth/me/')
      setCsrfToken(csrfResponse.data?.csrfToken)
      await api.post('/auth/login/', credentials)
      await loadSession()
      return { ok: true }
    } catch (error) {
      logUiError('login', 'auth-login', error)
      const message = error.response?.data?.detail || 'Falha ao autenticar.'
      return { ok: false, message }
    }
  }

  const onLogout = async () => {
    try {
      await api.post('/auth/logout/')
    } catch (error) {
      logUiError('sidebar', 'auth-logout', error)
    } finally {
      setUser(null)
    }
  }

  if (loadingSession) {
    return <main className="loading-page">Carregando sessao...</main>
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/politica-de-privacidade" element={<PrivacyPolicyPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/exclusao-de-dados" element={<DataDeletionPage />} />
        <Route path="/data-deletion" element={<DataDeletionPage />} />
        <Route
          path="/login"
          element={
            user ? <Navigate to="/app/conexao" replace /> : <LoginPage onLogin={onLogin} />
          }
        />
        <Route
          path="/app"
          element={
            user ? (
              <AppLayout user={user} onLogout={onLogout} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        >
          <Route index element={<Navigate to="/app/conexao" replace />} />
          <Route path="conexao" element={<ConnectionPage />} />
          <Route path="dashboard-meta" element={<MetaDashboardPage />} />
          <Route path="dashboard-instagram" element={<InstagramDashboardPage />} />
          <Route path="clientes" element={<Navigate to="/app/clientes/cadastrar" replace />} />
          <Route path="clientes/cadastrar" element={<ClientesCadastrarPage />} />
          <Route path="clientes/visualizar" element={<ClientesVisualizarPage />} />
        </Route>
        <Route path="*" element={<Navigate to={user ? '/app/conexao' : '/login'} replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
