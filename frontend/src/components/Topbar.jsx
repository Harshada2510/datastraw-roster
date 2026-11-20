import { ChevronDown, Menu } from 'lucide-react'

function Topbar({ pageTitle, onMenuClick }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button"
          className="menu-toggle"
          aria-label="Open navigation"
          onClick={onMenuClick}
        >
          <Menu size={20} />
        </button>

        <div className="topbar-brand">
          <span className="topbar-brand-mark" aria-hidden="true">
            DR
          </span>
          <span className="topbar-brand-name">DataStraw Roster</span>
        </div>
      </div>

      <div className="topbar-title-wrap">
        <h1 className="topbar-title">{pageTitle}</h1>
      </div>

      <div className="topbar-right">
        <div className="profile">
          <span className="profile-avatar" aria-hidden="true">
            RA
          </span>
          <span className="profile-details">
            <span className="profile-name">Roster Admin</span>
            <span className="profile-role">Administrator</span>
          </span>
          <ChevronDown size={16} className="profile-chevron" aria-hidden="true" />
        </div>
      </div>
    </header>
  )
}

export default Topbar
