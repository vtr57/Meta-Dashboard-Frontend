import { useCallback, useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import ConnectionPage from './pages/ConnectionPage'
import { ClientesCadastrarPage, ClientesVisualizarPage } from './pages/ClientesPage'
import InstagramDashboardPage from './pages/InstagramDashboardPage'
import MetaDashboardPage from './pages/MetaDashboardPage'
import { logUiError } from './pages/pageUtils'
import api from './lib/api'
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
        <p className="login-subtitle">Use seu usuario e senha do sistema.</p>

        <label htmlFor="username">Usuario</label>
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

function AppLayout({ user, onLogout }) {
  const location = useLocation()
  const clientesRouteActive = location.pathname.startsWith('/app/clientes')
  const [clientesMenuOpen, setClientesMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    if (clientesRouteActive) {
      setClientesMenuOpen(true)
    }
  }, [clientesRouteActive])

  const handleLogout = async () => {
    setLoggingOut(true)
    await onLogout()
    setLoggingOut(false)
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div>
          <h1 className="brand-title">Meta Local Dashboard 9</h1>
          <p className="brand-subtitle">Usuario: {user.username}</p>
        </div>

        <nav className="sidebar-nav">
          <NavLink
            to="/app/conexao"
            className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
          >
            Conexao / Sincronizacao
          </NavLink>
          <NavLink
            to="/app/dashboard-meta"
            className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
          >
            Dashboard Meta
          </NavLink>
          <NavLink
            to="/app/dashboard-instagram"
            className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
          >
            Dashboard Instagram
          </NavLink>
          <div className="sidebar-group">
            <button
              type="button"
              className={`sidebar-link sidebar-toggle ${
                clientesRouteActive || clientesMenuOpen ? 'active' : ''
              }`}
              onClick={() => setClientesMenuOpen((prev) => !prev)}
              aria-expanded={clientesMenuOpen}
              aria-controls="clientes-submenu"
            >
              Clientes
              <span className="sidebar-toggle-icon">{clientesMenuOpen ? '▾' : '▸'}</span>
            </button>
            {clientesMenuOpen ? (
              <div id="clientes-submenu" className="sidebar-submenu">
                <NavLink
                  to="/app/clientes/cadastrar"
                  className={({ isActive }) => (isActive ? 'sidebar-sublink active' : 'sidebar-sublink')}
                >
                  Cadastrar
                </NavLink>
                <NavLink
                  to="/app/clientes/visualizar"
                  className={({ isActive }) => (isActive ? 'sidebar-sublink active' : 'sidebar-sublink')}
                >
                  Visualizar
                </NavLink>
              </div>
            ) : null}
          </div>
        </nav>

        <button type="button" className="sidebar-button" onClick={handleLogout} disabled={loggingOut}>
          {loggingOut ? 'Saindo...' : 'Sair'}
        </button>
      </aside>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}

function App() {
  const [loadingSession, setLoadingSession] = useState(true)
  const [user, setUser] = useState(null)

  const loadSession = useCallback(async () => {
    try {
      const response = await api.get('/auth/me/')
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
      await api.get('/auth/me/')
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
