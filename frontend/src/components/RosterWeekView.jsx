import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pencil,
} from 'lucide-react'

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
  })
}

function formatRange(start, end) {
  if (!start || !end) return ''
  return `${formatDate(start)} – ${formatDate(end)}`
}

function RosterWeekView({ week, loading, onEdit, onPrevious, onNext, onCurrent }) {
  if (loading) {
    return (
      <section className="card">
        <div className="table-state" role="status">
          <LoaderCircle className="spin" size={22} aria-hidden="true" />
          Loading weekly roster…
        </div>
      </section>
    )
  }

  if (!week) {
    return (
      <section className="card placeholder-card">
        <span className="placeholder-icon">
          <CalendarRange size={30} strokeWidth={1.7} aria-hidden="true" />
        </span>
        <h3>No weekly roster available</h3>
        <p>Select a month with a generated roster to browse its weeks.</p>
      </section>
    )
  }

  return (
    <section className="card">
      <div className="section-header section-header--split">
        <div>
          <h3>Weekly View</h3>
          <p>
            Monday – Sunday · {formatRange(week.week_start, week.week_end)} ·{' '}
            {week.entry_count} assignment{week.entry_count === 1 ? '' : 's'}
          </p>
        </div>
        <div className="week-navigation">
          <button
            type="button"
            className="button-secondary"
            onClick={onPrevious}
            aria-label="Previous week"
          >
            <ChevronLeft size={15} aria-hidden="true" />
            Previous
          </button>
          <button type="button" className="button-secondary" onClick={onCurrent}>
            This month
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={onNext}
            aria-label="Next week"
          >
            Next
            <ChevronRight size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {week.entry_count === 0 && (
        <p className="validation-empty week-empty">
          No assignments in this week. Use the navigation or clear the filters to
          find other entries.
        </p>
      )}

      <div className="week-grid">
        {week.days.map((day) => (
          <article
            key={day.date}
            className={`week-day${day.in_selected_month ? '' : ' week-day--outside'}`}
          >
            <header className="week-day-header">
              <strong>{day.day_name}</strong>
              <span>{formatDate(day.date)}</span>
            </header>
            {!day.in_selected_month && (
              <span className="week-day-context">Adjacent month</span>
            )}
            {day.entries.length === 0 ? (
              <p className="week-day-empty">No assignment</p>
            ) : (
              <div className="week-entries">
                {day.entries.map((entry) => (
                  <div key={entry.id} className="week-entry">
                    <span className="week-entry-employee">
                      {entry.employee_name}
                      <span className="list-subtle"> · {entry.employee_code}</span>
                    </span>
                    <span className="week-entry-pair">
                      {entry.brand_name} / {entry.process_name}
                    </span>
                    {entry.shift_details && (
                      <span className="week-entry-shift">
                        {entry.shift_details}
                      </span>
                    )}
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => onEdit(entry)}
                    >
                      <Pencil size={13} aria-hidden="true" />
                      Edit
                    </button>
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}

export default RosterWeekView
