import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  ListChecks,
  LoaderCircle,
  RefreshCw,
  Sun,
  Tags,
  UserCheck,
  Users,
  Workflow,
} from 'lucide-react'
import { navItems } from '../config/navigation'
import { useDashboardData } from '../hooks/useDashboardData'
import { dashboardResourceCount } from '../services/dashboardService'
import {
  buildSummary,
  formatDate,
  formatDateRange,
  formatDateTime,
  getRecentLeaves,
  getStaffingOverview,
  getUpcomingHolidays,
} from '../utils/dashboardData'

const summaryCards = [
  {
    key: 'totalEmployees',
    label: 'Total employees',
    note: 'All employee records',
    icon: Users,
    sources: ['employees'],
  },
  {
    key: 'activeEmployees',
    label: 'Active employees',
    note: 'Currently active',
    icon: UserCheck,
    sources: ['employees'],
  },
  {
    key: 'totalBrands',
    label: 'Total brands',
    note: 'Master data',
    icon: Tags,
    sources: ['brands'],
  },
  {
    key: 'totalProcesses',
    label: 'Total processes',
    note: 'Master data',
    icon: Workflow,
    sources: ['processes'],
  },
  {
    key: 'totalPods',
    label: 'Total pods',
    note: 'Master data',
    icon: Boxes,
    sources: ['pods'],
  },
  {
    key: 'totalAssignments',
    label: 'Employee assignments',
    note: 'Employee / brand / process',
    icon: ClipboardList,
    sources: ['assignments'],
  },
  {
    key: 'pendingLeaves',
    label: 'Pending leave requests',
    note: 'Awaiting a decision',
    icon: CalendarClock,
    sources: ['leaves'],
  },
]

const quickLinkPaths = [
  '/employees',
  '/assignments',
  '/leaves',
  '/staffing-requirements',
  '/holidays',
  '/calendar',
]

const quickLinks = quickLinkPaths
  .map((path) => navItems.find((item) => item.path === path))
  .filter(Boolean)

function LoadingState({ label }) {
  return (
    <div className="panel-state" role="status">
      <LoaderCircle className="spin" size={22} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="panel-state panel-state--error" role="alert">
      <AlertCircle size={22} aria-hidden="true" />
      <span>{message}</span>
      <button type="button" className="text-button" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}

function EmptyState({ message }) {
  return <div className="panel-state panel-state--empty">{message}</div>
}

function PanelHeader({ icon: Icon, title, subtitle, to, headingId }) {
  return (
    <div className="panel-header">
      <div className="panel-title-wrap">
        <span className="panel-icon" aria-hidden="true">
          <Icon size={19} strokeWidth={1.9} />
        </span>
        <div>
          <h3 id={headingId}>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      {to && (
        <Link className="panel-link" to={to}>
          View all <ArrowRight size={14} aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const variant = String(status).toLowerCase()
  return <span className={`status-badge status-badge--${variant}`}>{status}</span>
}

function DashboardPage() {
  const { loading, data, errors, reload } = useDashboardData()
  const today = useMemo(() => new Date(), [])

  const summary = useMemo(() => buildSummary(data), [data])
  const recentLeaves = useMemo(
    () => getRecentLeaves(data.leaves, data.employees),
    [data.leaves, data.employees],
  )
  const upcomingHolidays = useMemo(
    () => getUpcomingHolidays(data.holidays, today),
    [data.holidays, today],
  )
  const staffing = useMemo(
    () => getStaffingOverview(data, today),
    [data, today],
  )

  const failedEndpoints = Object.entries(errors)
  const hasErrors = failedEndpoints.length > 0

  return (
    <div className="page-stack">
      <section className="card welcome-card">
        <div>
          <p className="eyebrow">Welcome</p>
          <h2>Smart Roster Management</h2>
          <p className="welcome-copy">
            A live overview of your people, assignments, leave requests and
            staffing needs, calculated from the DataStraw API.
          </p>
        </div>
        <span className="welcome-mark" aria-hidden="true">
          DR
        </span>
      </section>

      {hasErrors && !loading && (
        <div className="card error-banner" role="alert">
          <span className="error-banner-icon" aria-hidden="true">
            <AlertCircle size={22} />
          </span>
          <div className="error-banner-body">
            <h3>Some dashboard data could not be loaded</h3>
            <p>
              {failedEndpoints.length} of {dashboardResourceCount} requests
              failed. Affected figures show “—” and the related sections explain
              what happened.
            </p>
            <ul>
              {failedEndpoints.map(([key, message]) => (
                <li key={key}>{message}</li>
              ))}
            </ul>
          </div>
          <button type="button" className="button-secondary" onClick={reload}>
            <RefreshCw size={15} aria-hidden="true" /> Retry
          </button>
        </div>
      )}

      <section className="dashboard-section" aria-labelledby="summary-heading">
        <div className="section-header section-header--split">
          <div>
            <h3 id="summary-heading">At a glance</h3>
            <p>Current totals across the roster system.</p>
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={reload}
            disabled={loading}
          >
            <RefreshCw
              className={loading ? 'spin' : undefined}
              size={15}
              aria-hidden="true"
            />
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="summary-grid">
          {loading
            ? summaryCards.map((card) => (
                <div className="card stat-card" key={card.key} aria-hidden="true">
                  <span className="skeleton skeleton-icon" />
                  <span className="skeleton skeleton-line skeleton-line--wide" />
                  <span className="skeleton skeleton-line" />
                </div>
              ))
            : summaryCards.map((card) => {
                const error = card.sources.map((key) => errors[key]).find(Boolean)
                const Icon = card.icon

                return (
                  <div className="card stat-card" key={card.key}>
                    <span className="stat-icon" aria-hidden="true">
                      <Icon size={20} strokeWidth={1.9} />
                    </span>
                    <span
                      className={`stat-value${error ? ' stat-value--unavailable' : ''}`}
                      title={error}
                    >
                      {error ? '—' : summary[card.key]}
                    </span>
                    <span className="stat-label">{card.label}</span>
                    <span className="stat-note">{error ? 'Unavailable' : card.note}</span>
                  </div>
                )
              })}
        </div>
      </section>

      <div className="dashboard-grid">
        <section className="card dashboard-panel" aria-labelledby="staffing-heading">
          <PanelHeader
            icon={ListChecks}
            title="Staffing overview"
            subtitle="Upcoming demand by brand and process"
            to="/staffing-requirements"
            headingId="staffing-heading"
          />

          {loading ? (
            <LoadingState label="Loading staffing requirements…" />
          ) : errors.staffingRequirements ? (
            <ErrorState message={errors.staffingRequirements} onRetry={reload} />
          ) : (
            <>
              <div className="staffing-metrics">
                <div>
                  <span className="metric-value">{staffing.upcomingCount}</span>
                  <span className="metric-label">Upcoming requirements</span>
                </div>
                <div>
                  <span className="metric-value">{staffing.totalRequiredUpcoming}</span>
                  <span className="metric-label">Employees required</span>
                </div>
                <div>
                  <span className="metric-value">{staffing.totalRequirements}</span>
                  <span className="metric-label">All requirements</span>
                </div>
              </div>

              {staffing.items.length ? (
                <ul className="dashboard-list">
                  {staffing.items.map((requirement) => (
                    <li className="dashboard-list-item" key={requirement.id}>
                      <div className="list-item-main">
                        <span className="list-item-title">
                          {requirement.brandName}
                          <span className="list-subtle"> / {requirement.processName}</span>
                        </span>
                        <span className="list-item-meta">
                          {formatDateRange(requirement.start_date, requirement.end_date)}
                        </span>
                      </div>
                      <div className="list-item-side">
                        <span className="count-badge">
                          {requirement.required_count} required
                        </span>
                        <span className="list-item-meta">
                          {requirement.assignedCount} assigned
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState message="No upcoming staffing requirements." />
              )}
            </>
          )}
        </section>

        <section className="card dashboard-panel" aria-labelledby="leaves-heading">
          <PanelHeader
            icon={CalendarDays}
            title="Recent leave requests"
            subtitle={`${summary.pendingLeaves} pending request${summary.pendingLeaves === 1 ? '' : 's'}`}
            to="/leaves"
            headingId="leaves-heading"
          />

          {loading ? (
            <LoadingState label="Loading leave requests…" />
          ) : errors.leaves ? (
            <ErrorState message={errors.leaves} onRetry={reload} />
          ) : recentLeaves.length ? (
            <ul className="dashboard-list">
              {recentLeaves.map((leave) => (
                <li className="dashboard-list-item" key={leave.id}>
                  <div className="list-item-main">
                    <span className="list-item-title">{leave.employeeName}</span>
                    <span className="list-item-meta">
                      {leave.leave_type} · {formatDateRange(leave.start_date, leave.end_date)}
                    </span>
                  </div>
                  <div className="list-item-side">
                    <StatusBadge status={leave.status} />
                    <span className="list-item-meta">
                      {formatDateTime(leave.created_at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState message="No leave requests have been recorded yet." />
          )}
        </section>

        <section className="card dashboard-panel" aria-labelledby="holidays-heading">
          <PanelHeader
            icon={Sun}
            title="Upcoming holidays"
            subtitle="The next holidays on the calendar"
            to="/holidays"
            headingId="holidays-heading"
          />

          {loading ? (
            <LoadingState label="Loading holidays…" />
          ) : errors.holidays ? (
            <ErrorState message={errors.holidays} onRetry={reload} />
          ) : upcomingHolidays.length ? (
            <ul className="dashboard-list">
              {upcomingHolidays.map((holiday) => {
                const formattedDate = formatDate(holiday.holiday_date)
                const month = formattedDate.split(' ')[1] ?? ''

                return (
                  <li className="dashboard-list-item" key={holiday.id}>
                    <div className="list-item-main">
                      <span className="list-item-title">{holiday.holiday_name}</span>
                      <span className="list-item-meta">
                        {formattedDate}
                        {holiday.description ? ` · ${holiday.description}` : ''}
                      </span>
                    </div>
                    <span className="holiday-date" aria-hidden="true">
                      <strong>{holiday.holiday_date.slice(8, 10)}</strong>
                      <small>{month}</small>
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState message="No upcoming holidays scheduled." />
          )}
        </section>
      </div>

      <section className="dashboard-section" aria-labelledby="quick-nav-heading">
        <div className="section-header">
          <h3 id="quick-nav-heading">Quick navigation</h3>
          <p>Shortcuts to the modules you use most.</p>
        </div>

        <div className="module-grid">
          {quickLinks.map((item) => {
            const Icon = item.icon

            return (
              <Link key={item.path} to={item.path} className="module-card">
                <span className="module-icon">
                  <Icon size={20} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <span className="module-name">{item.label}</span>
                <span className="module-description">{item.description}</span>
                <ArrowRight size={16} className="module-arrow" aria-hidden="true" />
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default DashboardPage
