import { Eye, LoaderCircle, Pencil, Trash } from 'lucide-react'

function EmployeeTable({
  employees,
  loading,
  onView,
  onEdit,
  onDeactivate,
  deactivatingId,
}) {
  return (
    <div className="table-scroll">
      <table className="employee-table">
        <thead>
          <tr>
            <th scope="col">Employee ID</th>
            <th scope="col">Employee Code</th>
            <th scope="col">Full Name</th>
            <th scope="col">Email</th>
            <th scope="col">Phone</th>
            <th scope="col">Designation</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="table-message-row">
              <td colSpan={8}>
                <div className="table-state" role="status">
                  <LoaderCircle className="spin" size={22} aria-hidden="true" />
                  Loading employees…
                </div>
              </td>
            </tr>
          ) : employees.length === 0 ? (
            <tr className="table-message-row">
              <td colSpan={8}>
                <div className="table-state">
                  No employees match the current search or filter.
                </div>
              </td>
            </tr>
          ) : (
            employees.map((employee) => (
              <tr key={employee.id}>
                <td data-label="Employee ID" className="cell-id">
                  #{employee.id}
                </td>
                <td data-label="Employee Code" className="cell-code">
                  {employee.employee_code}
                </td>
                <td data-label="Full Name" className="cell-name">
                  {employee.full_name}
                </td>
                <td data-label="Email">{employee.email ?? '—'}</td>
                <td data-label="Phone">{employee.phone ?? '—'}</td>
                <td data-label="Designation">{employee.designation ?? '—'}</td>
                <td data-label="Status">
                  <span
                    className={`status-badge status-badge--${employee.is_active ? 'active' : 'inactive'}`}
                  >
                    {employee.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td data-label="Actions">
                  <div className="table-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="View details"
                      aria-label={`View ${employee.full_name}`}
                      onClick={() => onView(employee.id)}
                    >
                      <Eye size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="Edit employee"
                      aria-label={`Edit ${employee.full_name}`}
                      onClick={() => onEdit(employee.id)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      title={employee.is_active ? 'Deactivate employee' : 'Already inactive'}
                      aria-label={`Deactivate ${employee.full_name}`}
                      disabled={!employee.is_active || deactivatingId === employee.id}
                      onClick={() => onDeactivate(employee)}
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

export default EmployeeTable
