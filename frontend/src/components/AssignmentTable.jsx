import { Eye, LoaderCircle, Pencil, Trash } from 'lucide-react'

// The assignment API returns only foreign-key ids, so the page passes lookup
// functions built from the live employee/brand/process lists.
function AssignmentTable({
  assignments,
  loading,
  describeEmployee,
  describeBrand,
  describeProcess,
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
            <th scope="col">Assignment ID</th>
            <th scope="col">Employee Name</th>
            <th scope="col">Employee Code</th>
            <th scope="col">Brand Name</th>
            <th scope="col">Process Name</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="table-message-row">
              <td colSpan={6}>
                <div className="table-state" role="status">
                  <LoaderCircle className="spin" size={22} aria-hidden="true" />
                  Loading assignments…
                </div>
              </td>
            </tr>
          ) : assignments.length === 0 ? (
            <tr className="table-message-row">
              <td colSpan={6}>
                <div className="table-state">
                  No assignments match the current search or filter.
                </div>
              </td>
            </tr>
          ) : (
            assignments.map((assignment) => {
              const employee = describeEmployee(assignment.employee_id)
              const brand = describeBrand(assignment.brand_id)
              const process = describeProcess(assignment.process_id)
              const label = `${employee.name} - ${brand} / ${process}`

              return (
                <tr key={assignment.id}>
                  <td data-label="Assignment ID" className="cell-id">
                    #{assignment.id}
                  </td>
                  <td data-label="Employee Name" className="cell-name">
                    {employee.name}
                  </td>
                  <td data-label="Employee Code" className="cell-code">
                    {employee.code}
                  </td>
                  <td data-label="Brand Name">{brand}</td>
                  <td data-label="Process Name">{process}</td>
                  <td data-label="Actions">
                    <div className="table-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title="View details"
                        aria-label={`View assignment ${label}`}
                        onClick={() => onView(assignment.id)}
                      >
                        <Eye size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        title="Edit assignment"
                        aria-label={`Edit assignment ${label}`}
                        onClick={() => onEdit(assignment.id)}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        title="Delete assignment"
                        aria-label={`Delete assignment ${label}`}
                        disabled={deletingId === assignment.id}
                        onClick={() => onDelete(assignment)}
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

export default AssignmentTable
