import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  ChevronRight,
  ClipboardCheck,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import RosterEmployeeView from '../components/RosterEmployeeView'
import RosterEntryEditModal from '../components/RosterEntryEditModal'
import RosterFilters from '../components/RosterFilters'
import RosterTable from '../components/RosterTable'
import RosterWeekView from '../components/RosterWeekView'
import { ApiError } from '../services/apiClient'
import { EMPTY_ROSTER_FILTERS } from '../utils/rosterFilters'
import {
  generateRoster,
  getEmployeeRoster,
  getRoster,
  getRosterEntries,
  getRosterFilterOptions,
  getRosterWeek,
  regenerateRoster,
  updateRosterEntry,
  validateRoster,
} from '../services/rosterService'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const YEARS = Array.from({ length: 41 }, (_, index) => 2000 + index)
const CURRENT_DATE = new Date()

const CONFLICT_LABELS = {
  DUPLICATE_EMPLOYEE_ASSIGNMENT: 'Duplicate assignment',
  APPROVED_LEAVE: 'Approved leave',
  WEEKLY_OFF: 'Weekly off',
  ORGANISATION_HOLIDAY: 'Organisation holiday',
  INVALID_ASSIGNMENT: 'Invalid assignment',
  INACTIVE_EMPLOYEE: 'Inactive employee',
  INACTIVE_BRAND: 'Inactive brand',
  INACTIVE_PROCESS: 'Inactive process',
}

const VIEWS = [
  { key: 'monthly', label: 'Monthly View', icon: CalendarRange },
  { key: 'weekly', label: 'Weekly View', icon: CalendarDays },
  { key: 'employee', label: 'Employee-wise View', icon: Users },
]

function formatDate(displayDate) {
  const parsed = new Date(`${displayDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return displayDate
  return parsed.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatTimestamp(value) {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function conflictLabel(conflictType) {
  return CONFLICT_LABELS[conflictType] ?? conflictType.replace(/_/g, ' ')
}

function validationBadgeClass(status) {
  if (status === 'Valid') return 'validation-badge--valid'
  if (status === 'Shortages') return 'validation-badge--shortages'
  return 'validation-badge--conflicts'
}

function validationSummary(validation) {
  if (validation.overall_status === 'Valid') {
    return 'Validation passed. No scheduling conflicts or staffing shortages were found.'
  }
  if (validation.overall_status === 'Conflicts') {
    return `Validation found ${validation.total_conflicts} scheduling conflict(s)${
      validation.total_shortages > 0
        ? ` and ${validation.total_shortages} staffing shortage(s)`
        : ''
    }. Review the details below.`
  }
  return `No scheduling conflicts found, but ${validation.total_shortages} staffing requirement(s) are below the required count.`
}

function coverageBadgeClass(status) {
  switch (status) {
    case 'Fully Staffed':
      return 'coverage-badge--full'
    case 'Holiday':
      return 'coverage-badge--holiday'
    case 'Weekly Off':
      return 'coverage-badge--weekly-off'
    default:
      return 'coverage-badge--understaffed'
  }
}

function StatCard({ icon: Icon, label, value, note, unavailable }) {
  return (
    <article className="stat-card">
      <span className={`stat-icon${unavailable ? ' stat-icon--muted' : ''}`}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <span
        className={`stat-value${unavailable ? ' stat-value--unavailable' : ''}`}
      >
        {value}
      </span>
      <span className="stat-label">{label}</span>
      {note && <span className="stat-note">{note}</span>}
    </article>
  )
}

export default function RosterPage() {
  const [month, setMonth] = useState(CURRENT_DATE.getMonth() + 1)
  const [year, setYear] = useState(CURRENT_DATE.getFullYear())
  const [roster, setRoster] = useState(null)
  const [options, setOptions] = useState({
    employees: [],
    brands: [],
    processes: [],
  })
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState(null)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const loadIdRef = useRef(0)
  const autoSelectedEmployeeRef = useRef(false)

  // Step 24 view state. Filters are shared so a filter set in one view applies
  // to all three views without hiding unrelated month data.
  const [view, setView] = useState('monthly')
  const [filters, setFilters] = useState(EMPTY_ROSTER_FILTERS)
  const [weekStart, setWeekStart] = useState(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [viewData, setViewData] = useState(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewError, setViewError] = useState(null)
  const [editingEntry, setEditingEntry] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const viewLoadIdRef = useRef(0)

  useEffect(() => {
    let active = true
    getRosterFilterOptions()
      .then((data) => {
        if (active) setOptions(data)
      })
      .catch(() => {
        // Filter dropdowns can stay empty; roster generation still works.
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (autoSelectedEmployeeRef.current || options.employees.length === 0) return
    autoSelectedEmployeeRef.current = true
    setSelectedEmployeeId(String(options.employees[0].id))
  }, [options.employees])

  const loadRoster = useCallback(async (selectedYear, selectedMonth) => {
    const loadId = ++loadIdRef.current
    setLoading(true)
    setValidation(null)
    setError(null)
    try {
      const data = await getRoster(selectedYear, selectedMonth)
      if (loadId !== loadIdRef.current) return
      setRoster(data)
      setMessage(null)
    } catch (loadError) {
      if (loadId !== loadIdRef.current) return
      if (loadError instanceof ApiError && loadError.status === 404) {
        setRoster(null)
        setMessage(null)
      } else {
        setRoster(null)
        setError(loadError?.message ?? 'Could not load the roster.')
      }
    } finally {
      if (loadId === loadIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Start after the mount render so the loading state is painted first.
    void Promise.resolve().then(() => loadRoster(year, month))
  }, [loadRoster, month, year])

  const changePeriod = (nextYear, nextMonth) => {
    setYear(nextYear)
    setMonth(nextMonth)
    setValidation(null)
    setViewData(null)
    setWeekStart(null)
    setFilters(EMPTY_ROSTER_FILTERS)
  }

  const handleGenerate = async (regenerate) => {
    setSubmitting(true)
    setValidation(null)
    setMessage(null)
    setError(null)
    try {
      const data = regenerate
        ? await regenerateRoster(month, year)
        : await generateRoster(month, year)
      loadIdRef.current += 1
      setRoster(data)
      setLoading(false)
      setMessage(data.message ?? 'Roster saved successfully.')
    } catch (generateError) {
      setError(generateError?.message ?? 'Could not generate the roster.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleValidate = async () => {
    setValidating(true)
    setValidation(null)
    setMessage(null)
    setError(null)
    try {
      const report = await validateRoster(year, month)
      setValidation(report)
    } catch (validationError) {
      setError(
        validationError?.message ?? 'Could not validate the selected roster.'
      )
    } finally {
      setValidating(false)
    }
  }

  const isRosterForSelection =
    roster !== null && roster.year === year && roster.month === month
  const hasActiveFilter = Object.values(filters).some(Boolean)

  // Reload the active view whenever the roster, filters or view selection change.
  useEffect(() => {
    if (!isRosterForSelection) return undefined
    let active = true
    // Start after the current render so loading state updates stay async.
    void Promise.resolve().then(async () => {
      const loadId = ++viewLoadIdRef.current
      setViewLoading(true)
      setViewError(null)
      try {
        const data =
          view === 'weekly'
            ? await getRosterWeek(year, month, { weekStart, ...filters })
            : view === 'employee'
              ? selectedEmployeeId
                ? await getEmployeeRoster(year, month, selectedEmployeeId, filters)
                : null
              : await getRosterEntries(year, month, filters)
        if (active && loadId === viewLoadIdRef.current) setViewData(data)
      } catch (loadError) {
        if (active && loadId === viewLoadIdRef.current) {
          setViewData(null)
          setViewError(loadError?.message ?? 'Could not load the roster view.')
        }
      } finally {
        if (loadId === viewLoadIdRef.current) setViewLoading(false)
      }
    })

    return () => {
      active = false
    }
  }, [filters, isRosterForSelection, month, roster, selectedEmployeeId, view, weekStart, year])

  const handleFilterChange = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }))
    setViewData(null)
    setViewLoading(true)
  }

  const handleClearFilters = () => {
    setFilters(EMPTY_ROSTER_FILTERS)
    setViewData(null)
    setViewLoading(true)
  }

  const handleViewChange = (nextView) => {
    if (nextView === view) return
    setView(nextView)
    setViewData(null)
    setViewError(null)
    setViewLoading(true)
  }

  const handleEmployeeSelect = (employeeId) => {
    setSelectedEmployeeId(employeeId)
    setViewData(null)
    setViewLoading(true)
  }

  const handleWeekChange = (nextWeekStart) => {
    setWeekStart(nextWeekStart)
    setViewData(null)
    setViewLoading(true)
  }

  const handleSaveEntry = async (payload) => {
    setSavingEdit(true)
    try {
      await updateRosterEntry(editingEntry.id, payload)
      setEditingEntry(null)
      setError(null)
      loadIdRef.current += 1
      await loadRoster(year, month)
      setMessage('Roster entry updated. Coverage figures have been refreshed.')
    } finally {
      setSavingEdit(false)
    }
  }

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--split">
        <div>
          <h2>Monthly Roster Generation</h2>
          <p>
            Generate a fair, deterministic roster from active employees,
            assignments and staffing requirements.
          </p>
        </div>
      </div>

      <section className="card">
        <div className="section-header">
          <h3>Select Period</h3>
          <p>
            Choose a month and year, then generate or regenerate that month’s
            roster.
          </p>
        </div>
        <div className="form-grid">
          <label className="form-field">
            <span className="form-label">Month</span>
            <select
              value={month}
              onChange={(event) =>
                changePeriod(year, Number(event.target.value))
              }
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Year</span>
            <select
              value={year}
              onChange={(event) =>
                changePeriod(Number(event.target.value), month)
              }
            >
              {YEARS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="button-primary"
            disabled={submitting || loading}
            onClick={() => handleGenerate(false)}
          >
            Generate Roster
            <ChevronRight size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={submitting || loading || !isRosterForSelection}
            onClick={() => handleGenerate(true)}
          >
            Regenerate Roster
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={
              submitting || validating || loading || !isRosterForSelection
            }
            onClick={handleValidate}
          >
            Validate Roster
            <ClipboardCheck size={15} aria-hidden="true" />
          </button>
        </div>
        <p className="form-hint regeneration-note">
          Regeneration replaces all entries in the selected month, including
          manual edits, with a freshly generated roster. Other months and their
          edits are never changed.
        </p>
        {submitting && (
          <p className="result-count" role="status">
            Generating roster, please wait…
          </p>
        )}
        {validating && (
          <p className="result-count" role="status">
            Validating roster, please wait…
          </p>
        )}
      </section>

      {message && (
        <div className="feedback-banner feedback-banner--success" role="status">
          <ClipboardCheck size={20} aria-hidden="true" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="feedback-banner" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      {isRosterForSelection && viewError && (
        <div className="feedback-banner" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <span>{viewError}</span>
        </div>
      )}

      {isRosterForSelection && roster && (
        <>
          <section className="dashboard-section">
            <div className="section-header section-header--split">
              <div>
                <h3>
                  Summary — {roster.month_name} {roster.year}
                </h3>
                <p>
                  Generated{' '}
                  {new Date(roster.generated_at).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="summary-grid">
              <StatCard
                icon={CalendarRange}
                label="Days in month"
                value={roster.days_in_month}
              />
              <StatCard
                icon={Users}
                label="Employees scheduled"
                value={roster.total_employees_scheduled}
                note={`of ${roster.eligible_employees} eligible`}
              />
              <StatCard
                icon={ClipboardCheck}
                label="Total roster entries"
                value={roster.total_entries}
                note={`${roster.total_required_staff} staff requested`}
              />
              <StatCard
                icon={AlertTriangle}
                label="Uncovered requirements"
                value={roster.uncovered_count}
                note={`${roster.total_requirements} requirements in month`}
                unavailable={roster.uncovered_count > 0}
              />
            </div>
          </section>

          {validation && (
            <section className="card validation-report">
              <div className="section-header section-header--split">
                <div>
                  <h3>Roster Validation</h3>
                  <p>
                    Read-only validation completed{' '}
                    {formatTimestamp(validation.validated_at)}
                  </p>
                </div>
                <span
                  className={`validation-badge ${validationBadgeClass(validation.overall_status)}`}
                >
                  {validation.overall_status}
                </span>
              </div>

              <div className="validation-summary">
                <StatCard
                  icon={ClipboardCheck}
                  label="Entries checked"
                  value={validation.total_entries}
                />
                <StatCard
                  icon={AlertTriangle}
                  label="Scheduling conflicts"
                  value={validation.total_conflicts}
                  unavailable={validation.total_conflicts > 0}
                />
                <StatCard
                  icon={Users}
                  label="Staffing shortages"
                  value={validation.total_shortages}
                  unavailable={validation.total_shortages > 0}
                />
              </div>

              <p
                className={`validation-alert validation-alert--${validation.overall_status.toLowerCase()}`}
                role="status"
              >
                {validationSummary(validation)}
              </p>

              <div className="validation-panels">
                <div className="validation-panel">
                  <h4>Conflict Categories</h4>
                  <div className="validation-category-list">
                    {Object.entries(validation.conflict_counts ?? {}).map(
                      ([conflictType, count]) => (
                        <span
                          key={conflictType}
                          className={`validation-category-chip${
                            count > 0 ? ' validation-category-chip--active' : ''
                          }`}
                        >
                          {conflictLabel(conflictType)} <strong>{count}</strong>
                        </span>
                      )
                    )}
                  </div>
                </div>
                <div className="validation-panel">
                  <h4>Coverage Checked</h4>
                  <p className="validation-empty">
                    {validation.staffing_coverage?.length ?? 0}{' '}
                    requirement-date(s) compared;{' '}
                    {validation.total_shortages} below required count.
                  </p>
                </div>
              </div>

              <div className="validation-detail">
                <h4>Conflict Details</h4>
                {(validation.conflicts?.length ?? 0) === 0 ? (
                  <p className="validation-empty">
                    No scheduling conflicts detected.
                  </p>
                ) : (
                  <div className="table-scroll">
                    <table className="employee-table">
                      <thead>
                        <tr>
                          <th scope="col">Type</th>
                          <th scope="col">Employee</th>
                          <th scope="col">Date</th>
                          <th scope="col">Brand</th>
                          <th scope="col">Process</th>
                          <th scope="col">Explanation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(validation.conflicts ?? []).map((conflict, index) => (
                          <tr
                            key={`${conflict.roster_entry_id}-${conflict.conflict_type}-${index}`}
                          >
                            <td
                              data-label="Type"
                              className="cell-code"
                              title={conflict.conflict_type}
                            >
                              {conflictLabel(conflict.conflict_type)}
                            </td>
                            <td data-label="Employee">
                              {conflict.employee_name} (#{conflict.employee_id})
                            </td>
                            <td data-label="Date" className="cell-code">
                              {formatDate(conflict.roster_date)}
                            </td>
                            <td data-label="Brand">{conflict.brand_name}</td>
                            <td data-label="Process">{conflict.process_name}</td>
                            <td
                              data-label="Explanation"
                              className="cell-description"
                            >
                              {conflict.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="validation-detail">
                <h4>Staffing Shortages</h4>
                {(validation.staffing_shortages?.length ?? 0) === 0 ? (
                  <p className="validation-empty">
                    All checked requirements meet their scheduled staffing count.
                  </p>
                ) : (
                  <div className="table-scroll">
                    <table className="employee-table">
                      <thead>
                        <tr>
                          <th scope="col">Date</th>
                          <th scope="col">Brand</th>
                          <th scope="col">Process</th>
                          <th scope="col">Required</th>
                          <th scope="col">Scheduled</th>
                          <th scope="col">Shortage</th>
                          <th scope="col">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(validation.staffing_shortages ?? []).map(
                          (shortage, index) => (
                            <tr
                              key={`${shortage.roster_date}-${shortage.requirement_id}-${index}`}
                            >
                              <td data-label="Date" className="cell-code">
                                {formatDate(shortage.roster_date)}
                              </td>
                              <td data-label="Brand">{shortage.brand_name}</td>
                              <td data-label="Process">
                                {shortage.process_name}
                              </td>
                              <td data-label="Required">
                                {shortage.required_count}
                              </td>
                              <td data-label="Scheduled">
                                {shortage.scheduled_count}
                              </td>
                              <td data-label="Shortage">
                                {shortage.uncovered_count}
                              </td>
                              <td
                                data-label="Reason"
                                className="cell-description"
                              >
                                {shortage.reason ?? '—'}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          )}

          {((roster.holidays?.length ?? 0) > 0 ||
            (roster.weekly_offs?.length ?? 0) > 0 ||
            (roster.approved_leaves?.length ?? 0) > 0) && (
            <section className="card">
              <div className="section-header">
                <h3>Availability Context</h3>
                <p>
                  These existing holiday, weekly-off and approved-leave records
                  were applied during generation. Affected employees were
                  excluded from scheduling; pending and rejected leaves were not.
                </p>
              </div>
              <div className="availability-panels">
                <div className="availability-panel">
                  <h4>Organisation Holidays</h4>
                  {(roster.holidays ?? []).length === 0 ? (
                    <p className="availability-empty">
                      No holidays in this month.
                    </p>
                  ) : (
                    <div className="availability-list">
                      {(roster.holidays ?? []).map((holiday) => (
                        <span
                          key={`${holiday.holiday_date}-${holiday.holiday_name}`}
                          className="availability-chip availability-chip--holiday"
                        >
                          {formatDate(holiday.holiday_date)} ·{' '}
                          {holiday.holiday_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="availability-panel">
                  <h4>Employee Weekly Offs</h4>
                  {(roster.weekly_offs ?? []).length === 0 ? (
                    <p className="availability-empty">
                      No weekly-off configurations found.
                    </p>
                  ) : (
                    <div className="availability-list">
                      {(roster.weekly_offs ?? []).map((weeklyOff) => (
                        <span
                          key={`${weeklyOff.employee_id}-${weeklyOff.day_of_week}`}
                          className="availability-chip availability-chip--weekly-off"
                        >
                          {weeklyOff.employee_name} ({weeklyOff.employee_code}) ·{' '}
                          {weeklyOff.day_of_week}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="availability-panel">
                  <h4>Approved Leaves</h4>
                  {(roster.approved_leaves ?? []).length === 0 ? (
                    <p className="availability-empty">
                      No approved leaves in this month.
                    </p>
                  ) : (
                    <div className="availability-list">
                      {(roster.approved_leaves ?? []).map((leave) => (
                        <span
                          key={`${leave.employee_id}-${leave.start_date}-${leave.end_date}`}
                          className="availability-chip availability-chip--leave"
                        >
                          {leave.employee_name} ({leave.employee_code}) ·{' '}
                          {formatDate(leave.start_date)} –{' '}
                          {formatDate(leave.end_date)} · {leave.leave_type}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {(roster.coverage?.length ?? 0) > 0 && (
            <section className="card">
              <div className="section-header">
                <h3>Daily Coverage</h3>
                <p>
                  Required, scheduled and uncovered counts per date and
                  requirement, with the reason for each shortage.
                </p>
              </div>
              <div className="table-scroll">
                <table className="employee-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Brand</th>
                      <th scope="col">Process</th>
                      <th scope="col">Required</th>
                      <th scope="col">Scheduled</th>
                      <th scope="col">Uncovered</th>
                      <th scope="col">Status</th>
                      <th scope="col">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(roster.coverage ?? []).map((row, index) => (
                      <tr
                        key={`${row.roster_date}-${row.brand_id}-${row.process_id}-${index}`}
                      >
                        <td data-label="Date" className="cell-code">
                          {formatDate(row.roster_date)}
                        </td>
                        <td data-label="Brand">{row.brand_name}</td>
                        <td data-label="Process">{row.process_name}</td>
                        <td data-label="Required">{row.required_count}</td>
                        <td data-label="Scheduled">{row.scheduled_count}</td>
                        <td data-label="Uncovered">{row.uncovered_count}</td>
                        <td data-label="Status">
                          <span
                            className={`coverage-badge ${coverageBadgeClass(row.status)}`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td data-label="Reason" className="cell-description">
                          {row.reason ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {roster.uncovered_count > 0 && (
            <section className="card">
              <div className="section-header">
                <h3>Uncovered Staffing Requirements</h3>
                <p>
                  These slots could not be filled. Inactive brands/processes and
                  staff shortages are reported here rather than silently
                  scheduled.
                </p>
              </div>
              <div className="table-scroll">
                <table className="employee-table">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Brand</th>
                      <th scope="col">Process</th>
                      <th scope="col">Required</th>
                      <th scope="col">Assigned</th>
                      <th scope="col">Shortage</th>
                      <th scope="col">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.uncovered.map((item, index) => (
                      <tr key={`${item.roster_date}-${item.brand_id}-${item.process_id}-${index}`}>
                        <td data-label="Date" className="cell-code">
                          {formatDate(item.roster_date)}
                        </td>
                        <td data-label="Brand">{item.brand_name}</td>
                        <td data-label="Process">{item.process_name}</td>
                        <td data-label="Required">{item.required_count}</td>
                        <td data-label="Assigned">{item.assigned_count}</td>
                        <td data-label="Shortage">{item.shortage}</td>
                        <td data-label="Reason" className="cell-description">
                          {item.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="card roster-views">
            <div className="section-header section-header--split">
              <div>
                <h3>Roster Views</h3>
                <p>
                  Browse the same roster by month, week or employee. Filters and
                  edits are available in every view.
                </p>
              </div>
              <div className="view-tabs" role="tablist" aria-label="Roster views">
                {VIEWS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={view === key}
                    className={`view-tab${view === key ? ' view-tab--active' : ''}`}
                    onClick={() => handleViewChange(key)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <RosterFilters
              filters={filters}
              onChange={handleFilterChange}
              onClear={handleClearFilters}
              employees={options.employees}
              brands={options.brands}
              processes={options.processes}
              disabled={submitting || savingEdit}
            />

            {view === 'monthly' && (
              <div role="tabpanel" aria-label="Monthly View">
                <RosterTable
                  entries={viewData?.entries ?? []}
                  loading={loading || viewLoading}
                  filtered={hasActiveFilter}
                  onEdit={setEditingEntry}
                />
              </div>
            )}

            {view === 'weekly' && (
              <div role="tabpanel" aria-label="Weekly View">
                <RosterWeekView
                  week={viewData}
                  loading={viewLoading}
                  onEdit={setEditingEntry}
                  onPrevious={() => handleWeekChange(viewData?.previous_week_start ?? null)}
                  onNext={() => handleWeekChange(viewData?.next_week_start ?? null)}
                  onCurrent={() => handleWeekChange(null)}
                />
              </div>
            )}

            {view === 'employee' && (
              <div role="tabpanel" aria-label="Employee-wise View">
                <RosterEmployeeView
                  employees={options.employees}
                  selectedEmployeeId={selectedEmployeeId}
                  onSelectEmployee={handleEmployeeSelect}
                  data={viewData}
                  loading={viewLoading}
                  onEdit={setEditingEntry}
                />
              </div>
            )}
          </section>
        </>
      )}

      {!loading && !isRosterForSelection && !error && (
        <section className="card placeholder-card">
          <span className="placeholder-icon">
            <CalendarRange size={30} strokeWidth={1.7} aria-hidden="true" />
          </span>
          <h3>No roster for {MONTHS[month - 1]} {year}</h3>
          <p>Generate a roster to see scheduling results and staffing gaps.</p>
        </section>
      )}

      {editingEntry && (
        <RosterEntryEditModal
          entry={editingEntry}
          employees={options.employees}
          brands={options.brands}
          processes={options.processes}
          saving={savingEdit}
          onClose={() => setEditingEntry(null)}
          onSave={handleSaveEntry}
        />
      )}
    </div>
  )
}
