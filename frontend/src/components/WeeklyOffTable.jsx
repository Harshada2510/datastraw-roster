import { Eye, LoaderCircle, Pencil, Trash } from 'lucide-react'

function WeeklyOffTable({
  records,
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
            <th scope="col">ID</th>
            <th scope="col">Employee Name</th>
            <th scope="col">Employee Code</th>
            <th scope="col">Day of Week</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="table-message-row">
              <td colSpan={5}>
                <div className="table-state" role="status">
                  <LoaderCircle className="spin" size={22} aria-hidden="true" />
                  Loading weekly offs…
                </div>
              </td>
            </tr>
          ) : records.length === 0 ? (
            <tr className="table-message-row">
              <td colSpan={5}>
                <div className="table-state">
                  No weekly off records match the current search or filter.
                </div>
              </td>
            </tr>
          ) : (
            records.map((record) => {
              const employee = describeEmployee(record.employee_id)
              const label = `${employee.name} - ${record.day_of_week}`
              return (
                <tr key={record.id}>
                  <td data-label="ID" className="cell-id">#{record.id}</td>
                  <td data-label="Employee Name" className="cell-name">{employee.name}</td>
                  <td data-label="Employee Code" className="cell-code">{employee.code}</td>
                  <td data-label="Day of Week">
                    <span className="count-badge">{record.day_of_week}</span>
                  </td>
                  <td data-label="Actions">
                    <div className="table-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title="View details"
                        aria-label={`View weekly off ${label}`}
                        onClick={() => onView(record.id)}
                      >
                        <Eye size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title="Edit weekly off"
                        aria-label={`Edit weekly off ${label}`}
                        onClick={() => onEdit(record.id)}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        title="Delete weekly off"
                        aria-label={`Delete weekly off ${label}`}
                        disabled={deletingId === record.id}
                        onClick={() => onDelete(record)}
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

export default WeeklyOffTable
