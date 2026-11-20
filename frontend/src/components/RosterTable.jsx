import { LoaderCircle, Pencil } from 'lucide-react'

function formatDate(displayDate) {
  if (!displayDate) return '—'
  const parsed = new Date(`${displayDate}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return displayDate
  return parsed.toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function RosterTable({ entries, loading, onEdit, filtered = false }) {
  return (
    <section className="card">
      <div className="section-header section-header--split">
        <div>
          <h3>Generated Roster</h3>
          <p>
            {filtered
              ? `${entries.length} entry(s) match the current filters`
              : `${entries.length} scheduled entries for this month`}
          </p>
        </div>
      </div>

      <div className="table-scroll">
        <table className="employee-table">
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Employee</th>
              <th scope="col">Brand</th>
              <th scope="col">Process</th>
              <th scope="col">Shift Details</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="table-message-row">
                <td colSpan={6}>
                  <div className="table-state" role="status">
                    <LoaderCircle className="spin" size={22} aria-hidden="true" />
                    Loading roster…
                  </div>
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr className="table-message-row">
                <td colSpan={6}>
                  <div className="table-state">
                    {filtered
                      ? 'No roster entries match the current filters.'
                      : 'No roster entries were generated for this month.'}
                  </div>
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id}>
                  <td data-label="Date" className="cell-code">
                    {formatDate(entry.roster_date)}
                  </td>
                  <td data-label="Employee" className="cell-name">
                    {entry.employee_name}
                    <span className="list-subtle"> · {entry.employee_code}</span>
                  </td>
                  <td data-label="Brand">{entry.brand_name}</td>
                  <td data-label="Process">{entry.process_name}</td>
                  <td data-label="Shift Details">{entry.shift_details ?? '—'}</td>
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
    </section>
  )
}

export default RosterTable
