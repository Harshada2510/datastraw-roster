import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Archive,
  BadgeCheck,
  Boxes,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import Modal from '../components/Modal'
import PodForm from '../components/PodForm'
import PodTable from '../components/PodTable'
import { useOptions } from '../hooks/useOptions'
import { useResourceList } from '../hooks/useResourceList'
import { getEmployees } from '../services/employeeService'
import { podService } from '../services/podService'
import { formatDateTime } from '../utils/dashboardData'
import {
  emptyPodForm,
  mapPodServerErrors,
  podToForm,
} from '../utils/podValidation'

const NO_FORM_ERRORS = { fieldErrors: {}, generalErrors: [] }

function ModalLoading({ label }) {
  return (
    <div className="table-state" role="status">
      <LoaderCircle className="spin" size={22} aria-hidden="true" />
      {label}
    </div>
  )
}

function ModalError({ message }) {
  return (
    <div className="form-alert" role="alert">
      <AlertCircle size={18} aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

function PodDetails({ pod, leadName, onEdit, onClose }) {
  return (
    <>
      <dl className="detail-list">
        <div>
          <dt>Pod ID</dt>
          <dd>#{pod.id}</dd>
        </div>
        <div>
          <dt>Pod Name</dt>
          <dd>{pod.pod_name}</dd>
        </div>
        <div className="detail-list--wide">
          <dt>Description</dt>
          <dd>{pod.description ?? '—'}</dd>
        </div>
        <div>
          <dt>Pod Lead</dt>
          <dd>{leadName(pod.pod_lead_id)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span
              className={`status-badge status-badge--${pod.is_active ? 'active' : 'inactive'}`}
            >
              {pod.is_active ? 'Active' : 'Inactive'}
            </span>
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(pod.created_at)}</dd>
        </div>
      </dl>
      <div className="modal-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => onEdit(pod.id)}
        >
          Edit pod
        </button>
        <button type="button" className="button-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}

export default function PodsPage() {
  const {
    records: pods,
    loading,
    error: listError,
    reload,
  } = useResourceList(podService.list, 'Could not load pods.')

  const {
    items: employees,
    loading: employeesLoading,
    error: employeesError,
    reload: reloadEmployees,
  } = useOptions(getEmployees, 'Could not load employees.')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [feedback, setFeedback] = useState(null)
  const [modal, setModal] = useState(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState(NO_FORM_ERRORS)
  const [confirmError, setConfirmError] = useState(null)
  const [deactivatingId, setDeactivatingId] = useState(null)
  const recordControllerRef = useRef(null)

  useEffect(() => () => recordControllerRef.current?.abort(), [])

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  )

  const leadName = useCallback(
    (leadId) => {
      if (leadId == null) {
        return '—'
      }
      const employee = employeeById.get(leadId)
      return employee
        ? `${employee.full_name} (${employee.employee_code})`
        : `#${leadId}`
    },
    [employeeById],
  )

  const total = pods.length
  const activeCount = useMemo(
    () => pods.filter((pod) => pod.is_active).length,
    [pods],
  )
  const inactiveCount = total - activeCount

  const filteredPods = useMemo(() => {
    const term = search.trim().toLowerCase()
    return pods.filter((pod) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? pod.is_active : !pod.is_active)
      const matchesTerm =
        !term || String(pod.pod_name ?? '').toLowerCase().includes(term)
      return matchesStatus && matchesTerm
    })
  }, [pods, search, statusFilter])

  const closeModal = useCallback(() => {
    recordControllerRef.current?.abort()
    setModal(null)
    setFormErrors(NO_FORM_ERRORS)
    setConfirmError(null)
    setFormSubmitting(false)
  }, [])

  const openAdd = () => {
    setFeedback(null)
    setFormErrors(NO_FORM_ERRORS)
    setModal({ type: 'add' })
  }

  const openRecord = useCallback(
    async (podId, type) => {
      recordControllerRef.current?.abort()
      const controller = new AbortController()
      recordControllerRef.current = controller

      setFeedback(null)
      setFormErrors(NO_FORM_ERRORS)
      setConfirmError(null)
      setModal({ type, podId, pod: null, loading: true, error: null })

      try {
        const pod = await podService.get(podId, { signal: controller.signal })
        if (controller.signal.aborted) {
          return
        }
        setModal((current) =>
          current?.type === type && current.podId === podId
            ? { ...current, pod, loading: false }
            : current,
        )
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') {
          return
        }
        setModal((current) =>
          current?.type === type && current.podId === podId
            ? { ...current, error: error.message, loading: false }
            : current,
        )
      }
    },
    [],
  )

  const openConfirm = (pod) => {
    setFeedback(null)
    setConfirmError(null)
    setModal({ type: 'confirm', pod })
  }

  const handleFormSubmit = async (payload) => {
    if (!modal) {
      return
    }

    const isEdit = modal.type === 'edit'
    const podId = modal.pod?.id
    setFormSubmitting(true)
    setFormErrors(NO_FORM_ERRORS)

    try {
      if (isEdit) {
        await podService.update(podId, payload)
        setFeedback({
          type: 'success',
          message: `${payload.pod_name} was updated successfully.`,
        })
      } else {
        await podService.create(payload)
        setFeedback({
          type: 'success',
          message: `${payload.pod_name} was added successfully.`,
        })
      }
      closeModal()
      await reload()
    } catch (error) {
      setFormErrors(mapPodServerErrors(error))
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDeactivate = async () => {
    const pod = modal?.pod
    if (!pod) {
      return
    }

    setDeactivatingId(pod.id)
    setConfirmError(null)

    try {
      await podService.deactivate(pod.id)
      closeModal()
      setFeedback({
        type: 'success',
        message: `${pod.pod_name} has been deactivated.`,
      })
      await reload()
    } catch (error) {
      setConfirmError(error.message)
    } finally {
      setDeactivatingId(null)
    }
  }

  const handleRefresh = async () => {
    setFeedback(null)
    await Promise.all([reload(), reloadEmployees()])
  }

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--split">
        <div>
          <h2>Pod Management</h2>
          <p>Create pods, assign leads and track pod status.</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={handleRefresh}
            disabled={loading}
          >
            <RefreshCw
              className={loading ? 'spin' : undefined}
              size={15}
              aria-hidden="true"
            />
            Refresh
          </button>
          <button type="button" className="button-primary" onClick={openAdd}>
            <Plus size={16} aria-hidden="true" />
            Add pod
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`card feedback-banner feedback-banner--${feedback.type}`}
          role="status"
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setFeedback(null)}
          >
            ×
          </button>
        </div>
      )}

      {listError && (
        <div className="card error-banner" role="alert">
          <span className="error-banner-icon" aria-hidden="true">
            <AlertCircle size={22} />
          </span>
          <div className="error-banner-body">
            <h3>Could not load pods</h3>
            <p>{listError}</p>
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={handleRefresh}
          >
            Retry
          </button>
        </div>
      )}

      <div className="employee-stats">
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <Boxes size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : total}</span>
          <span className="stat-label">Total pods</span>
          <span className="stat-note">All records in the system</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <BadgeCheck size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : activeCount}</span>
          <span className="stat-label">Active pods</span>
          <span className="stat-note">Currently active</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon stat-icon--muted" aria-hidden="true">
            <Archive size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : inactiveCount}</span>
          <span className="stat-label">Inactive pods</span>
          <span className="stat-note">Deactivated records</span>
        </div>
      </div>

      <section className="card employee-panel" aria-label="Pod directory">
        <div className="employee-toolbar">
          <div className="search-field">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by pod name"
              aria-label="Search pods"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <span className="result-count">
            Showing {filteredPods.length} of {total} pods
          </span>
        </div>

        <PodTable
          pods={filteredPods}
          loading={loading}
          leadName={leadName}
          deactivatingId={deactivatingId}
          onView={(id) => openRecord(id, 'view')}
          onEdit={(id) => openRecord(id, 'edit')}
          onDeactivate={openConfirm}
        />
      </section>

      {modal?.type === 'add' && (
        <Modal
          title="Add pod"
          subtitle="Create a new pod and optionally choose a lead."
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          <PodForm
            initialValues={emptyPodForm()}
            employees={employees}
            employeesLoading={employeesLoading}
            employeesError={employeesError}
            onRetryOptions={reloadEmployees}
            serverErrors={formErrors}
            submitting={formSubmitting}
            onSubmit={handleFormSubmit}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal
          title="Edit pod"
          subtitle={
            modal.pod ? `${modal.pod.pod_name} · Pod #${modal.pod.id}` : 'Loading pod'
          }
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          {modal.loading ? (
            <ModalLoading label="Loading pod…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.pod ? (
            <PodForm
              key={modal.pod.id}
              initialValues={podToForm(modal.pod)}
              employees={employees}
              employeesLoading={employeesLoading}
              employeesError={employeesError}
              onRetryOptions={reloadEmployees}
              serverErrors={formErrors}
              submitting={formSubmitting}
              onSubmit={handleFormSubmit}
              onCancel={closeModal}
            />
          ) : null}
        </Modal>
      )}

      {modal?.type === 'view' && (
        <Modal
          title="Pod details"
          subtitle={modal.pod ? `Pod #${modal.pod.id}` : 'Loading pod'}
          onClose={closeModal}
          size="large"
        >
          {modal.loading ? (
            <ModalLoading label="Loading pod…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.pod ? (
            <PodDetails
              pod={modal.pod}
              leadName={leadName}
              onEdit={(id) => openRecord(id, 'edit')}
              onClose={closeModal}
            />
          ) : null}
        </Modal>
      )}

      {modal?.type === 'confirm' && (
        <Modal
          title="Deactivate pod"
          subtitle="This action can be undone by editing the record."
          onClose={closeModal}
          closeDisabled={deactivatingId === modal.pod.id}
          size="small"
        >
          <p>
            Are you sure you want to deactivate{' '}
            <strong>{modal.pod.pod_name}</strong>?
          </p>
          <p className="text-muted">
            The pod will remain in the system with an Inactive status.
          </p>
          {confirmError && <ModalError message={confirmError} />}
          <div className="modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={closeModal}
              disabled={deactivatingId === modal.pod.id}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={handleDeactivate}
              disabled={deactivatingId === modal.pod.id}
            >
              {deactivatingId === modal.pod.id ? (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              ) : null}
              Deactivate
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
