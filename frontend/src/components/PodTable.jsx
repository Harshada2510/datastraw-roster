import { Eye, LoaderCircle, Pencil, Trash } from 'lucide-react'

// `leadName` resolves pod_lead_id to a name from the live employee list.
function PodTable({
  pods,
  loading,
  leadName,
  deactivatingId,
  onView,
  onEdit,
  onDeactivate,
}) {
  return (
    <div className="table-scroll">
      <table className="employee-table">
        <thead>
          <tr>
            <th scope="col">Pod ID</th>
            <th scope="col">Pod Name</th>
            <th scope="col">Description</th>
            <th scope="col">Pod Lead</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="table-message-row">
              <td colSpan={6}>
                <div className="table-state" role="status">
                  <LoaderCircle className="spin" size={22} aria-hidden="true" />
                  Loading pods…
                </div>
              </td>
            </tr>
          ) : pods.length === 0 ? (
            <tr className="table-message-row">
              <td colSpan={6}>
                <div className="table-state">
                  No pods match the current search or filter.
                </div>
              </td>
            </tr>
          ) : (
            pods.map((pod) => (
              <tr key={pod.id}>
                <td data-label="Pod ID" className="cell-id">
                  #{pod.id}
                </td>
                <td data-label="Pod Name" className="cell-name">
                  {pod.pod_name}
                </td>
                <td
                  data-label="Description"
                  className="cell-description"
                  title={pod.description ?? ''}
                >
                  {pod.description ?? '—'}
                </td>
                <td data-label="Pod Lead">{leadName(pod.pod_lead_id)}</td>
                <td data-label="Status">
                  <span
                    className={`status-badge status-badge--${pod.is_active ? 'active' : 'inactive'}`}
                  >
                    {pod.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td data-label="Actions">
                  <div className="table-actions">
                    <button
                      type="button"
                      className="icon-button"
                      title="View details"
                      aria-label={`View ${pod.pod_name}`}
                      onClick={() => onView(pod.id)}
                    >
                      <Eye size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      title="Edit pod"
                      aria-label={`Edit ${pod.pod_name}`}
                      onClick={() => onEdit(pod.id)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button--danger"
                      title={pod.is_active ? 'Deactivate pod' : 'Already inactive'}
                      aria-label={`Deactivate ${pod.pod_name}`}
                      disabled={!pod.is_active || deactivatingId === pod.id}
                      onClick={() => onDeactivate(pod)}
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

export default PodTable
