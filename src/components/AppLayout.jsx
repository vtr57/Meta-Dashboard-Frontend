import { Outlet } from 'react-router-dom'
import AppSidebar from './AppSidebar'

function AppLayout({ user, onLogout }) {
  return (
    <div className="app-shell">
      <AppSidebar user={user} onLogout={onLogout} />

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
