import { Eye, LoaderCircle, Pencil, Trash } from 'lucide-react'
import { formatDate } from '../utils/dashboardData'

function HolidayTable({ holidays, loading, deletingId, onView, onEdit, onDelete }) {
  return (
    <div className="table-scroll">
      <table className="employee-table">
        <thead>
          <tr>
            <th scope="col">Holiday ID</th>
            <th scope="col">Holiday Name</th>
            <th scope="col">Holiday Date</th>
            <th scope="col">Description</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="table-message-row">
              <td colSpan={5}>
                <div className="table-state" role="status">
                  <LoaderCircle className="spin" size={22} aria-hidden="true" />
                  Loading holidays…
                </div>
              </td>
            </tr>
          ) : holidays.length === 0 ? (
            <tr className="table-message-row">
              <td colSpan={5}>
                <div className="table-state">
                  No holidays match the current search or filter.
                </div>
              </td>
            </tr>
          ) : (
            holidays.map((holiday) => (
              <tr key={holiday.id}>
                <td data-label="Holiday ID" className="cell-id">#{holiday.id}</td>
                <td data-label="Holiday Name" className="cell-name">{holiday.holiday_name}</td>
                <td data-label="Holiday Date">{formatDate(holiday.holiday_date)}</td>
                <td
                  data-label="Description"
                  className="cell-description"
                  title={holiday.description ?? ''}
                >
                  {holiday.description ?? '—'}
                </td>
                <td data-label="Actions">
                  <div className="table-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="View details"
                      aria-label={`View ${holiday.holiday_name}`}
                      onClick={() => onView(holiday.id)}
                    >
                      <Eye size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="Edit holiday"
                      aria-label={`Edit ${holiday.holiday_name}`}
                      onClick={() => onEdit(holiday.id)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      title="Delete holiday"
                      aria-label={`Delete ${holiday.holiday_name}`}
                      disabled={deletingId === holiday.id}
                      onClick={() => onDelete(holiday)}
                    >
                      <Trash size={16} aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export default HolidayTable
