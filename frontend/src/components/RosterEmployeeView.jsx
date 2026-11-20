import { CalendarDays, LoaderCircle, Pencil, Users } from 'lucide-react'

function formatDate(value) {
  if (!value) return '—'
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function RosterEmployeeView({
  employees,
  selectedEmployeeId,
  onSelectEmployee,
  data,
  loading,
  onEdit,
}) {
  return (
    <section className="card">
      <div className="section-header section-header--split">
        <div>
          <h3>Employee-wise View</h3>
          <p>
            Pick an employee to review their assigned dates, shift details and
            existing availability records for the selected month.
          </p>
        </div>
        <label className="search-field">
          <Users size={16} aria-hidden="true" />
          <select
            aria-label="Select employee for employee-wise view"
            value={selectedEmployeeId}
            onChange={(event) => onSelectEmployee(event.target.value)}
          >
            <option value="">Select an employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name} ({employee.employee_code})
              </option>
            ))}
          </select>
        </label>
      </div>

      {!selectedEmployeeId ? (
        <div className="table-state">
          <Users size={22} aria-hidden="true" />
          Select an employee to see their roster assignments.
        </div>
      ) : loading ? (
        <div className="table-state" role="status">
          <LoaderCircle className="spin" size={22} aria-hidden="true" />
          Loading employee roster…
        </div>
      ) : !data ? (
        <div className="table-state">No employee roster data is available.</div>
      ) : (
        <>
          <div className="employee-context">
            <div>
              <h4>
                {data.employee_name}{' '}
                <span className="list-subtle">({data.employee_code})</span>
              </h4>
              <p>
                {data.month_name} {data.year} · {data.assignments.length} assigned
                date{data.assignments.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="table-scroll">
            <table className="employee-table">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Brand</th>
                  <th scope="col">Process</th>
                  <th scope="col">Shift Details</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.assignments.length === 0 ? (
                  <tr className="table-message-row">
                    <td colSpan={5}>
                      <div className="table-state">
                        No assignments match the current filters for this employee.
                      </div>
                    </td>
                  </tr>
                ) : (
                  data.assignments.map((entry) => (
                    <tr key={entry.id}>
                      <td data-label="Date" className="cell-code">
                        {formatDate(entry.roster_date)}
                      </td>
                      <td data-label="Brand">{entry.brand_name}</td>
                      <td data-label="Process">{entry.process_name}</td>
                      <td data-label="Shift Details">
                        {entry.shift_details ?? '—'}
                      </td>
                      <td data-label="Actions">
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => onEdit(entry)}
                        >
                          <Pencil size={13} aria-hidden="true" />
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="availability-panels employee-availability">
            <div className="availability-panel">
              <h4>Weekly Offs</h4>
              {data.weekly_offs.length === 0 ? (
                <p className="availability-empty">No weekly-off records found.</p>
              ) : (
                <div className="availability-list">
                  {data.weekly_offs.map((weeklyOff) => (
                    <span
                      key={weeklyOff.day_of_week}
                      className="availability-chip availability-chip--weekly-off"
                    >
                      {weeklyOff.day_of_week} ·{' '}
                      {weeklyOff.dates.map(formatDate).join(', ') || 'no dates'}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="availability-panel">
              <h4>Approved Leave Dates</h4>
              {data.approved_leaves.length === 0 ? (
                <p className="availability-empty">
                  No approved leave in this month.
                </p>
              ) : (
                <div className="availability-list">
                  {data.approved_leaves.map((leave) => (
                    <span
                      key={leave.leave_id}
                      className="availability-chip availability-chip--leave"
                    >
                      <CalendarDays size={13} aria-hidden="true" />
                      {leave.leave_type} · {formatDate(leave.start_date)} –{' '}
                      {formatDate(leave.end_date)}
                      <span className="list-subtle">
                        {' '}
                        ({leave.dates.length} day
                        {leave.dates.length === 1 ? '' : 's'})
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

export default RosterEmployeeView
