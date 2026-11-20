import { Eye, LoaderCircle, Pencil, Trash } from 'lucide-react'
import { formatDate } from '../utils/dashboardData'

function StatusBadge({ status }) {
  const variant =
    status === 'Approved' ? 'approved' : status === 'Rejected' ? 'rejected' : 'pending'
  return <span className={`status-badge status-badge--${variant}`}>{status}</span>
}

function LeaveTable({
  leaves,
  loading,
  describeEmployee,
  deletingId,
  onView,
  onEdit,
  onDelete,
}) {
  return (
    <div className="table-scroll">
      <table className="employee-table">
        <thead>
          <tr>
            <th scope="col">Leave ID</th>
            <th scope="col">Employee Name</th>
            <th scope="col">Employee Code</th>
            <th scope="col">Start Date</th>
            <th scope="col">End Date</th>
            <th scope="col">Leave Type</th>
            <th scope="col">Reason</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="table-message-row">
              <td colSpan={9}>
                <div className="table-state" role="status">
                  <LoaderCircle className="spin" size={22} aria-hidden="true" />
                  Loading leave requests…
                </div>
              </td>
            </tr>
          ) : leaves.length === 0 ? (
            <tr className="table-message-row">
              <td colSpan={9}>
                <div className="table-state">
                  No leave requests match the current search or filter.
                </div>
              </td>
            </tr>
          ) : (
            leaves.map((leave) => {
              const employee = describeEmployee(leave.employee_id)
              const label = `${employee.name} - ${leave.leave_type}`
              return (
                <tr key={leave.id}>
                  <td data-label="Leave ID" className="cell-id">#{leave.id}</td>
                  <td data-label="Employee Name" className="cell-name">{employee.name}</td>
                  <td data-label="Employee Code" className="cell-code">{employee.code}</td>
                  <td data-label="Start Date">{formatDate(leave.start_date)}</td>
                  <td data-label="End Date">{formatDate(leave.end_date)}</td>
                  <td data-label="Leave Type">{leave.leave_type}</td>
                  <td
                    data-label="Reason"
                    className="cell-description"
                    title={leave.reason ?? ''}
                  >
                    {leave.reason ?? '—'}
                  </td>
                  <td data-label="Status"><StatusBadge status={leave.status} /></td>
                  <td data-label="Actions">
                    <div className="table-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title="View details"
                        aria-label={`View leave ${label}`}
                        onClick={() => onView(leave.id)}
                      >
                        <Eye size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title="Edit leave request"
                        aria-label={`Edit leave ${label}`}
                        onClick={() => onEdit(leave.id)}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        title="Delete leave request"
                        aria-label={`Delete leave ${label}`}
                        disabled={deletingId === leave.id}
                        onClick={() => onDelete(leave)}
                      >
                        <Trash size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}

export default LeaveTable
