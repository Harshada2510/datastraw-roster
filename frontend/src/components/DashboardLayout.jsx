import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { getNavItemByPath } from '../config/navigation'
import Sidebar from './Sidebar'
import Topbar from './Topbar'

function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()
  const pageTitle = getNavItemByPath(location.pathname)?.label ?? 'Dashboard'

  useEffect(() => {
    document.title = `${pageTitle} | DataStraw Roster`
  }, [pageTitle])

  return (
    <div className="app-shell">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="main-area">
        <Topbar
          pageTitle={pageTitle}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
