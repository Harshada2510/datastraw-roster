import { LoaderCircle, Pencil, Trash } from 'lucide-react'
import { formatDate } from '../utils/dashboardData'

function StaffingRequirementTable({
  requirements,
  loading,
  describeBrand,
  describeProcess,
  deletingId,
  onEdit,
  onDelete,
}) {
  return (
    <div className="table-scroll">
      <table className="employee-table">
        <thead>
          <tr>
            <th scope="col">Requirement ID</th>
            <th scope="col">Brand</th>
            <th scope="col">Process</th>
            <th scope="col">Start Date</th>
            <th scope="col">End Date</th>
            <th scope="col">Required Employees</th>
            <th scope="col">Notes</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="table-message-row">
              <td colSpan={8}>
                <div className="table-state" role="status">
                  <LoaderCircle className="spin" size={22} aria-hidden="true" />
                  Loading staffing requirements…
                </div>
              </td>
            </tr>
          ) : requirements.length === 0 ? (
            <tr className="table-message-row">
              <td colSpan={8}>
                <div className="table-state">
                  No staffing requirements have been recorded yet.
                </div>
              </td>
            </tr>
          ) : (
            requirements.map((requirement) => {
              const brand = describeBrand(requirement.brand_id)
              const process = describeProcess(requirement.process_id)
              const label = `#${requirement.id} (${brand} / ${process})`

              return (
                <tr key={requirement.id}>
                  <td data-label="Requirement ID" className="cell-id">
                    #{requirement.id}
                  </td>
                  <td data-label="Brand" className="cell-name">
                    {brand}
                  </td>
                  <td data-label="Process">{process}</td>
                  <td data-label="Start Date" className="cell-code">
                    {formatDate(requirement.start_date)}
                  </td>
                  <td data-label="End Date" className="cell-code">
                    {formatDate(requirement.end_date)}
                  </td>
                  <td data-label="Required Employees">
                    {requirement.required_count}
                  </td>
                  <td data-label="Notes" className="cell-description">
                    <span title={requirement.notes ?? ''}>
                      {requirement.notes ?? '—'}
                    </span>
                  </td>
                  <td data-label="Actions">
                    <div className="table-actions">
                      <button
                        type="button"
                        className="icon-button"
                        title="Edit requirement"
                        aria-label={`Edit requirement ${label}`}
                        onClick={() => onEdit(requirement.id)}
                      >
                        <Pencil size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button icon-button--danger"
                        title="Delete requirement"
                        aria-label={`Delete requirement ${label}`}
                        disabled={deletingId === requirement.id}
                        onClick={() => onDelete(requirement)}
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

export default StaffingRequirementTable
