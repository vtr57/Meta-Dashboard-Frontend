import { useEffect, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

function AppSidebar({ user, onLogout }) {
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
    <aside className="app-sidebar">
      <NavLink to="/app/conexao" className="brand-link">
        <h1 className="brand-title">
          <span className="brand-title-content">
            <img src="/VDashboard.png" alt="" className="brand-title-logo" aria-hidden="true" />
            <span>VDashboard</span>
          </span>
        </h1>
        <p className="brand-subtitle">Usuário: {user.username}</p>
      </NavLink>

      <nav className="sidebar-nav">
        <NavLink
          to="/app/conexao"
          className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
        >
          <span className="sidebar-link-content">
            <i className="fa-solid fa-link sidebar-link-icon" aria-hidden="true" />
            <span>Conexão / Sincronização</span>
          </span>
        </NavLink>
        <NavLink
          to="/app/dashboard-meta"
          className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
        >
          <span className="sidebar-link-content">
            <i className="fa-brands fa-meta sidebar-link-icon" aria-hidden="true" />
            <span>Dashboard Meta</span>
          </span>
        </NavLink>
        <NavLink
          to="/app/dashboard-instagram"
          className={({ isActive }) => (isActive ? 'sidebar-link active' : 'sidebar-link')}
        >
          <span className="sidebar-link-content">
            <i className="fa-brands fa-instagram sidebar-link-icon" aria-hidden="true" />
            <span>Dashboard Instagram</span>
          </span>
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
            <span className="sidebar-link-content">
              <i className="fa-solid fa-users sidebar-link-icon" aria-hidden="true" />
              <span>Clientes</span>
            </span>
            <span className="sidebar-toggle-icon">{clientesMenuOpen ? '▾' : '▸'}</span>
          </button>
          {clientesMenuOpen ? (
            <div id="clientes-submenu" className="sidebar-submenu">
              <NavLink
                to="/app/clientes/cadastrar"
                className={({ isActive }) => (isActive ? 'sidebar-sublink active' : 'sidebar-sublink')}
              >
                <span className="sidebar-link-content">
                  <i className="fa-solid fa-user-plus sidebar-link-icon" aria-hidden="true" />
                  <span>Cadastrar</span>
                </span>
              </NavLink>
              <NavLink
                to="/app/clientes/visualizar"
                className={({ isActive }) => (isActive ? 'sidebar-sublink active' : 'sidebar-sublink')}
              >
                <span className="sidebar-link-content">
                  <i className="fa-solid fa-eye sidebar-link-icon" aria-hidden="true" />
                  <span>Visualizar</span>
                </span>
              </NavLink>
            </div>
          ) : null}
        </div>
      </nav>

      <button
        type="button"
        className="sidebar-button"
        onClick={handleLogout}
        disabled={loggingOut}
        aria-label="Sair"
        title="Sair"
      >
        {loggingOut ? (
          <i className="fa-solid fa-spinner fa-spin" aria-hidden="true" />
        ) : (
          <i className="fa-solid fa-arrow-right-from-bracket" aria-hidden="true" />
        )}
      </button>
    </aside>
  )
}

export default AppSidebar
