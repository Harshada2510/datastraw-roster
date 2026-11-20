import { Eye, LoaderCircle, Pencil, Trash } from 'lucide-react'

// Table for the ID / Name / Description / Status / Actions master-data pages.
// Reuses the same class names as the employee table for identical styling
// and responsive behaviour.
function NamedResourceTable({
  records,
  loading,
  nameField,
  nameLabel,
  idLabel,
  resourceLabel,
  resourceLabelPlural,
  deactivatingId,
  onView,
  onEdit,
  onDeactivate,
}) {
  const displayName = (record) => record[nameField] ?? 'this record'

  return (
    <div className="table-scroll">
      <table className="employee-table">
        <thead>
          <tr>
            <th scope="col">{idLabel}</th>
            <th scope="col">{nameLabel}</th>
            <th scope="col">Description</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="table-message-row">
              <td colSpan={5}>
                <div className="table-state" role="status">
                  <LoaderCircle className="spin" size={22} aria-hidden="true" />
                  Loading {resourceLabelPlural}…
                </div>
              </td>
            </tr>
          ) : records.length === 0 ? (
            <tr className="table-message-row">
              <td colSpan={5}>
                <div className="table-state">
                  No {resourceLabelPlural} match the current search or filter.
                </div>
              </td>
            </tr>
          ) : (
            records.map((record) => (
              <tr key={record.id}>
                <td data-label={idLabel} className="cell-id">
                  #{record.id}
                </td>
                <td data-label={nameLabel} className="cell-name">
                  {record[nameField]}
                </td>
                <td
                  data-label="Description"
                  className="cell-description"
                  title={record.description ?? ''}
                >
                  {record.description ?? '—'}
                </td>
                <td data-label="Status">
                  <span
                    className={`status-badge status-badge--${record.is_active ? 'active' : 'inactive'}`}
                  >
                    {record.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td data-label="Actions">
                  <div className="table-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="View details"
                      aria-label={`View ${displayName(record)}`}
                      onClick={() => onView(record.id)}
                    >
                      <Eye size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title={`Edit ${resourceLabel}`}
                      aria-label={`Edit ${displayName(record)}`}
                      onClick={() => onEdit(record.id)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      title={
                        record.is_active
                          ? `Deactivate ${resourceLabel}`
                          : 'Already inactive'
                      }
                      aria-label={`Deactivate ${displayName(record)}`}
                      disabled={
                        !record.is_active || deactivatingId === record.id
                      }
                      onClick={() => onDeactivate(record)}
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

export default NamedResourceTable
