import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  RefreshCw,
  Sun,
  Users,
} from 'lucide-react'
import { calendarService } from '../services/calendarService'
import { formatDate, formatDateRange } from '../utils/dashboardData'

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

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_INDEX = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
}

const YEAR_MIN = 2000
const YEAR_MAX = 2100
const YEARS = Array.from(
  { length: YEAR_MAX - YEAR_MIN + 1 },
  (_, index) => YEAR_MIN + index,
)

const CURRENT_DATE = new Date()
const TODAY_ISO = (() => {
  const year = CURRENT_DATE.getFullYear()
  const month = String(CURRENT_DATE.getMonth() + 1).padStart(2, '0')
  const day = String(CURRENT_DATE.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
})()

function hasDayEvents(day) {
  return (
    (day.holiday_names?.length ?? 0) > 0 ||
    (day.leave_employee_ids?.length ?? 0) > 0 ||
    (day.weekly_off_employee_ids?.length ?? 0) > 0
  )
}

function statusClass(status) {
  const value = String(status ?? '').toLowerCase()
  if (value === 'approved') return 'status-badge--approved'
  if (value === 'rejected') return 'status-badge--rejected'
  return 'status-badge--pending'
}

function StatusBadge({ status }) {
  return <span className={`status-badge ${statusClass(status)}`}>{status}</span>
}

export default function CalendarPage() {
  const [year, setYear] = useState(CURRENT_DATE.getFullYear())
  const [month, setMonth] = useState(CURRENT_DATE.getMonth() + 1)
  const [calendar, setCalendar] = useState(null)
  const [selectedDate, setSelectedDate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [requestVersion, setRequestVersion] = useState(0)
  const controllerRef = useRef(null)

  const previousDisabled = year === YEAR_MIN && month === 1
  const nextDisabled = year === YEAR_MAX && month === 12

  const beginLoad = () => {
    setLoading(true)
    setError(null)
  }

  const retry = () => {
    beginLoad()
    setRequestVersion((version) => version + 1)
  }

  const goPrevious = () => {
    if (previousDisabled) {
      return
    }
    beginLoad()
    if (month === 1) {
      setYear(year - 1)
      setMonth(12)
      return
    }
    setMonth(month - 1)
  }

  const goNext = () => {
    if (nextDisabled) {
      return
    }
    beginLoad()
    if (month === 12) {
      setYear(year + 1)
      setMonth(1)
      return
    }
    setMonth(month + 1)
  }

  const changeMonth = (event) => {
    const nextMonth = Number(event.target.value)
    if (nextMonth === month) {
      return
    }
    beginLoad()
    setMonth(nextMonth)
  }

  const changeYear = (event) => {
    const nextYear = Number(event.target.value)
    if (nextYear === year) {
      return
    }
    beginLoad()
    setYear(nextYear)
  }

  useEffect(() => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    void (async () => {
      try {
        const data = await calendarService.getMonth(year, month, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) {
          return
        }
        setCalendar(data)
        const preferred =
          data.days.find((day) => day.date === TODAY_ISO) ??
          data.days.find(hasDayEvents) ??
          data.days[0]
        setSelectedDate(preferred?.date ?? null)
        setLoading(false)
      } catch (loadError) {
        if (loadError?.name === 'AbortError' || controller.signal.aborted) {
          return
        }
        setCalendar(null)
        setSelectedDate(null)
        setError(loadError?.message ?? 'Could not load the calendar.')
        setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [year, month, requestVersion])

  const gridCells = useMemo(() => {
    const days = calendar?.days ?? []
    if (!days.length) {
      return []
    }

    const leadingCount = WEEKDAY_INDEX[days[0].day_of_week] ?? 0
    const trailingCount = (7 - ((leadingCount + days.length) % 7)) % 7

    return [
      ...Array.from({ length: leadingCount }, (_, index) => ({
        key: `leading-${index}`,
        blank: true,
      })),
      ...days.map((day) => ({ key: day.date, day })),
      ...Array.from({ length: trailingCount }, (_, index) => ({
        key: `trailing-${index}`,
        blank: true,
      })),
    ]
  }, [calendar])

  const selectedDay = useMemo(
    () => calendar?.days.find((day) => day.date === selectedDate) ?? null,
    [calendar, selectedDate],
  )

  const selectedHolidays = useMemo(() => {
    const ids = new Set(selectedDay?.holiday_ids ?? [])
    return (calendar?.holidays ?? [])
      .filter((holiday) => ids.has(holiday.id))
      .sort(
        (a, b) =>
          String(a.holiday_date).localeCompare(String(b.holiday_date)) ||
          Number(a.id) - Number(b.id),
      )
  }, [calendar, selectedDay])

  const selectedLeaves = useMemo(() => {
    const ids = new Set(selectedDay?.leave_employee_ids ?? [])
    return (calendar?.leaves ?? [])
      .filter(
        (leave) =>
          ids.has(leave.employee_id) &&
          selectedDate >= leave.start_date &&
          selectedDate <= leave.end_date,
      )
      .sort(
        (a, b) =>
          String(a.start_date).localeCompare(String(b.start_date)) ||
          Number(a.id) - Number(b.id),
      )
  }, [calendar, selectedDay, selectedDate])

  const selectedWeeklyOffs = useMemo(() => {
    const ids = new Set(selectedDay?.weekly_off_employee_ids ?? [])
    return (calendar?.weekly_offs ?? [])
      .filter((item) => ids.has(item.employee_id))
      .sort(
        (a, b) =>
          Number(a.employee_id) - Number(b.employee_id) ||
          String(a.day_of_week).localeCompare(String(b.day_of_week)),
      )
  }, [calendar, selectedDay])

  const monthEventCount =
    (calendar?.holidays?.length ?? 0) +
    (calendar?.leaves?.length ?? 0) +
    (calendar?.weekly_offs?.length ?? 0)
  const selectedEventCount =
    selectedHolidays.length + selectedLeaves.length + selectedWeeklyOffs.length
  const displayedLabel = calendar
    ? `${calendar.month_name} ${calendar.year}`
    : `${MONTHS[month - 1]} ${year}`

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--split">
        <div>
          <h2>Calendar</h2>
          <p>Review holidays, leaves and weekly-offs for any month.</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={retry}
            disabled={loading}
          >
            <RefreshCw
              className={loading ? 'spin' : undefined}
              size={15}
              aria-hidden="true"
            />
            Refresh
          </button>
        </div>
      </div>

      <section className="card employee-panel calendar-panel" aria-label="Monthly calendar">
        <div className="calendar-toolbar">
          <div className="calendar-nav">
            <button
              type="button"
              className="icon-button"
              aria-label="Previous month"
              title="Previous month"
              onClick={goPrevious}
              disabled={previousDisabled}
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <div className="calendar-month-heading">
              <h3>{displayedLabel}</h3>
              {calendar && (
                <p className="text-muted">
                  {calendar.days_in_month} days · Monday-first
                </p>
              )}
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Next month"
              title="Next month"
              onClick={goNext}
              disabled={nextDisabled}
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="calendar-selects">
            <select
              value={month}
              onChange={changeMonth}
              aria-label="Select month"
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={changeYear}
              aria-label="Select year"
            >
              {YEARS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="error-banner calendar-banner" role="alert">
            <span className="error-banner-icon" aria-hidden="true">
              <AlertCircle size={22} />
            </span>
            <div className="error-banner-body">
              <h3>Could not load the calendar</h3>
              <p>{error}</p>
            </div>
            <button
              type="button"
              className="button-secondary"
              onClick={retry}
            >
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="table-state" role="status">
            <RefreshCw className="spin" size={22} aria-hidden="true" />
            Loading calendar…
          </div>
        ) : calendar ? (
          <>
            <div className="calendar-summary">
              <div className="calendar-summary-card">
                <span className="calendar-summary-icon calendar-summary-icon--holiday">
                  <Sun size={19} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <div>
                  <strong>{calendar.holidays?.length ?? 0}</strong>
                  <span>Organisation holidays</span>
                </div>
              </div>
              <div className="calendar-summary-card">
                <span className="calendar-summary-icon calendar-summary-icon--leave">
                  <Users size={19} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <div>
                  <strong>{calendar.leaves?.length ?? 0}</strong>
                  <span>Leave records</span>
                </div>
              </div>
              <div className="calendar-summary-card">
                <span className="calendar-summary-icon calendar-summary-icon--off">
                  <Clock3 size={19} strokeWidth={1.9} aria-hidden="true" />
                </span>
                <div>
                  <strong>{calendar.weekly_offs?.length ?? 0}</strong>
                  <span>Weekly off records</span>
                </div>
              </div>
            </div>

            <div className="calendar-grid-scroll">
              <div className="calendar-grid">
                {WEEKDAYS.map((weekday) => (
                  <div key={weekday} className="calendar-weekday">
                    {weekday}
                  </div>
                ))}
                {gridCells.map((cell) => {
                  if (cell.blank) {
                    return (
                      <div
                        key={cell.key}
                        className="calendar-day calendar-day--blank"
                        aria-hidden="true"
                      />
                    )
                  }

                  const day = cell.day
                  const holidayCount = day.holiday_names?.length ?? 0
                  const leaveCount = day.leave_employee_ids?.length ?? 0
                  const weeklyOffCount = day.weekly_off_employee_ids?.length ?? 0
                  const dayNumber = Number(String(day.date).slice(-2))

                  return (
                    <button
                      key={cell.key}
                      type="button"
                      className={[
                        'calendar-day',
                        hasDayEvents(day) ? 'calendar-day--events' : '',
                        day.date === TODAY_ISO ? 'calendar-day--today' : '',
                        day.date === selectedDate ? 'calendar-day--selected' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      onClick={() => setSelectedDate(day.date)}
                      aria-pressed={day.date === selectedDate}
                      aria-label={`${day.day_of_week}, ${formatDate(day.date)}, ${holidayCount} holidays, ${leaveCount} leaves, ${weeklyOffCount} weekly offs`}
                    >
                      <span className="calendar-day-number">{dayNumber}</span>
                      <span className="calendar-day-events">
                        {holidayCount > 0 && (
                          <span className="calendar-event calendar-event--holiday">
                            {holidayCount} holiday{holidayCount === 1 ? '' : 's'}
                          </span>
                        )}
                        {leaveCount > 0 && (
                          <span className="calendar-event calendar-event--leave">
                            {leaveCount} leave{leaveCount === 1 ? '' : 's'}
                          </span>
                        )}
                        {weeklyOffCount > 0 && (
                          <span className="calendar-event calendar-event--off">
                            {weeklyOffCount} off
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="calendar-legend" aria-label="Calendar legend">
              <span className="calendar-legend-item">
                <span className="calendar-legend-dot calendar-legend-dot--holiday" />
                Organisation holiday
              </span>
              <span className="calendar-legend-item">
                <span className="calendar-legend-dot calendar-legend-dot--leave" />
                Employee leave
              </span>
              <span className="calendar-legend-item">
                <span className="calendar-legend-dot calendar-legend-dot--off" />
                Employee weekly off
              </span>
            </div>

            <div className="calendar-details">
              <div className="calendar-details-header">
                <div>
                  <h4>{selectedDate ? formatDate(selectedDate) : 'Select a date'}</h4>
                  <p className="text-muted">
                    {selectedDay?.day_of_week ?? 'Choose a day from the grid above'}
                  </p>
                </div>
                <span className="calendar-details-count">
                  <ClipboardCheck size={15} aria-hidden="true" />
                  {selectedEventCount} item{selectedEventCount === 1 ? '' : 's'}
                </span>
              </div>

              {monthEventCount === 0 ? (
                <p className="calendar-empty calendar-empty--month">
                  No holidays, leaves or weekly-offs are recorded for this month.
                  Use the month controls to review another period.
                </p>
              ) : selectedEventCount === 0 ? (
                <p className="calendar-empty">
                  No events are recorded for the selected date.
                </p>
              ) : (
                <div className="calendar-event-groups">
                  {selectedHolidays.length > 0 && (
                    <section className="calendar-event-group">
                      <h5>Organisation holidays</h5>
                      <ul className="calendar-event-list">
                        {selectedHolidays.map((holiday) => (
                          <li key={holiday.id}>
                            <div className="calendar-event-title">
                              <span>{holiday.holiday_name}</span>
                              <span className="calendar-event-tag">Holiday</span>
                            </div>
                            {holiday.description && (
                              <p className="calendar-event-meta">
                                {holiday.description}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {selectedLeaves.length > 0 && (
                    <section className="calendar-event-group">
                      <h5>Employee leaves</h5>
                      <ul className="calendar-event-list">
                        {selectedLeaves.map((leave) => (
                          <li key={leave.id}>
                            <div className="calendar-event-title">
                              <span>{leave.employee_name}</span>
                              <StatusBadge status={leave.status} />
                            </div>
                            <p className="calendar-event-meta">
                              {leave.employee_code} · {leave.leave_type}
                            </p>
                            <p className="calendar-event-meta">
                              {formatDateRange(leave.start_date, leave.end_date)}
                            </p>
                            {leave.reason && (
                              <p className="calendar-event-meta">
                                Reason: {leave.reason}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {selectedWeeklyOffs.length > 0 && (
                    <section className="calendar-event-group">
                      <h5>Employee weekly offs</h5>
                      <ul className="calendar-event-list">
                        {selectedWeeklyOffs.map((item) => (
                          <li key={item.id}>
                            <div className="calendar-event-title">
                              <span>{item.employee_name}</span>
                              <span className="calendar-event-tag">Weekly off</span>
                            </div>
                            <p className="calendar-event-meta">
                              {item.employee_code} · {item.day_of_week}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}
