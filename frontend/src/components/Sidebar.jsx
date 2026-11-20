import { X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { navigationGroups } from '../config/navigation'

function Sidebar({ isOpen, onClose }) {
  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={onClose}
        />
      )}

      <aside className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-logo" aria-hidden="true">
            DR
          </span>
          <span className="sidebar-brand">
            <span className="sidebar-brand-name">DataStraw</span>
            <span className="sidebar-brand-subtitle">Roster Management</span>
          </span>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close navigation"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navigationGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <p className="nav-group-label">{group.label}</p>
              <ul className="nav-list">
                {group.items.map((item) => {
                  const Icon = item.icon

                  return (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        className={({ isActive }) =>
                          `nav-link${isActive ? ' nav-link--active' : ''}`
                        }
                        onClick={onClose}
                      >
                        <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
                        <span>{item.label}</span>
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">Smart Roster Management System</div>
      </aside>
    </>
  )
}

export default Sidebar
