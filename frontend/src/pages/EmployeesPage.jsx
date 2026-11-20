import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react'
import EmployeeForm from '../components/EmployeeForm'
import EmployeeTable from '../components/EmployeeTable'
import Modal from '../components/Modal'
import { useEmployees } from '../hooks/useEmployees'
import {
  createEmployee,
  deactivateEmployee,
  getEmployee,
  updateEmployee,
} from '../services/employeeService'
import { formatDateTime } from '../utils/dashboardData'
import {
  emptyEmployeeForm,
  employeeToForm,
  mapServerErrors,
} from '../utils/employeeValidation'

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

function EmployeeDetails({ employee, onEdit, onClose }) {
  return (
    <>
      <dl className="detail-list">
        <div>
          <dt>Employee ID</dt>
          <dd>#{employee.id}</dd>
        </div>
        <div>
          <dt>Employee Code</dt>
          <dd>{employee.employee_code}</dd>
        </div>
        <div>
          <dt>Full Name</dt>
          <dd>{employee.full_name}</dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd>{employee.email ?? '—'}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{employee.phone ?? '—'}</dd>
        </div>
        <div>
          <dt>Designation</dt>
          <dd>{employee.designation ?? '—'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span
              className={`status-badge status-badge--${employee.is_active ? 'active' : 'inactive'}`}
            >
              {employee.is_active ? 'Active' : 'Inactive'}
            </span>
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(employee.created_at)}</dd>
        </div>
        <div>
          <dt>Last updated</dt>
          <dd>{formatDateTime(employee.updated_at)}</dd>
        </div>
      </dl>
      <div className="modal-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => onEdit(employee.id)}
        >
          Edit employee
        </button>
        <button type="button" className="button-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}

function EmployeesPage() {
  const { employees, loading, error: listError, reload } = useEmployees()
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

  const total = employees.length
  const activeCount = useMemo(
    () => employees.filter((employee) => employee.is_active).length,
    [employees],
  )
  const inactiveCount = total - activeCount

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase()

    return employees.filter((employee) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? employee.is_active : !employee.is_active)
      const matchesTerm =
        !term ||
        [employee.employee_code, employee.full_name, employee.email].some(
          (value) => String(value ?? '').toLowerCase().includes(term),
        )

      return matchesStatus && matchesTerm
    })
  }, [employees, search, statusFilter])

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

  const openRecord = useCallback(async (employeeId, type) => {
    recordControllerRef.current?.abort()
    const controller = new AbortController()
    recordControllerRef.current = controller

    setFeedback(null)
    setFormErrors(NO_FORM_ERRORS)
    setConfirmError(null)
    setModal({ type, employeeId, employee: null, loading: true, error: null })

    try {
      const employee = await getEmployee(employeeId, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) {
        return
      }
      setModal((current) =>
        current?.type === type && current.employeeId === employeeId
          ? { ...current, employee, loading: false }
          : current,
      )
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        return
      }
      setModal((current) =>
        current?.type === type && current.employeeId === employeeId
          ? { ...current, error: error.message, loading: false }
          : current,
      )
    }
  }, [])

  const openConfirm = (employee) => {
    setFeedback(null)
    setConfirmError(null)
    setModal({ type: 'confirm', employee })
  }

  const handleFormSubmit = async (payload) => {
    if (!modal) {
      return
    }

    const isEdit = modal.type === 'edit'
    const employeeId = modal.employee?.id
    setFormSubmitting(true)
    setFormErrors(NO_FORM_ERRORS)

    try {
      if (isEdit) {
        await updateEmployee(employeeId, payload)
        setFeedback({
          type: 'success',
          message: `${payload.full_name} was updated successfully.`,
        })
      } else {
        await createEmployee(payload)
        setFeedback({
          type: 'success',
          message: `${payload.full_name} was added successfully.`,
        })
      }
      closeModal()
      await reload()
    } catch (error) {
      setFormErrors(mapServerErrors(error))
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDeactivate = async () => {
    const employee = modal?.employee
    if (!employee) {
      return
    }

    setDeactivatingId(employee.id)
    setConfirmError(null)

    try {
      await deactivateEmployee(employee.id)
      closeModal()
      setFeedback({
        type: 'success',
        message: `${employee.full_name} has been deactivated.`,
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
    await reload()
  }

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--split">
        <div>
          <h2>Employee Management</h2>
          <p>Create, review and maintain employee master records.</p>
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
            Add employee
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
            <h3>Could not load employees</h3>
            <p>{listError}</p>
          </div>
          <button type="button" className="button-secondary" onClick={handleRefresh}>
            Retry
          </button>
        </div>
      )}

      <div className="employee-stats">
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <Users size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : total}</span>
          <span className="stat-label">Total employees</span>
          <span className="stat-note">All records in the system</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <UserCheck size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : activeCount}</span>
          <span className="stat-label">Active employees</span>
          <span className="stat-note">Currently active</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon stat-icon--muted" aria-hidden="true">
            <UserX size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : inactiveCount}</span>
          <span className="stat-label">Inactive employees</span>
          <span className="stat-note">Deactivated records</span>
        </div>
      </div>

      <section className="card employee-panel" aria-label="Employee directory">
        <div className="employee-toolbar">
          <div className="search-field">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name, code or email"
              aria-label="Search employees"
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
            Showing {filteredEmployees.length} of {total} employees
          </span>
        </div>

        <EmployeeTable
          employees={filteredEmployees}
          loading={loading}
          deactivatingId={deactivatingId}
          onView={(id) => openRecord(id, 'view')}
          onEdit={(id) => openRecord(id, 'edit')}
          onDeactivate={openConfirm}
        />
      </section>

      {modal?.type === 'add' && (
        <Modal
          title="Add employee"
          subtitle="Create a new employee master record."
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          <EmployeeForm
            initialValues={emptyEmployeeForm()}
            serverErrors={formErrors}
            submitting={formSubmitting}
            onSubmit={handleFormSubmit}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal
          title="Edit employee"
          subtitle={
            modal.employee
              ? `${modal.employee.employee_code} · ${modal.employee.full_name}`
              : 'Loading employee record'
          }
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          {modal.loading ? (
            <ModalLoading label="Loading employee…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.employee ? (
            <EmployeeForm
              key={modal.employee.id}
              initialValues={employeeToForm(modal.employee)}
              mode="edit"
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
          title="Employee details"
          subtitle={
            modal.employee
              ? `Record #${modal.employee.id}`
              : 'Loading employee record'
          }
          onClose={closeModal}
          size="large"
        >
          {modal.loading ? (
            <ModalLoading label="Loading employee…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.employee ? (
            <EmployeeDetails
              employee={modal.employee}
              onEdit={(id) => openRecord(id, 'edit')}
              onClose={closeModal}
            />
          ) : null}
        </Modal>
      )}

      {modal?.type === 'confirm' && (
        <Modal
          title="Deactivate employee"
          subtitle="This action can be undone by editing the employee."
          onClose={closeModal}
          closeDisabled={deactivatingId === modal.employee.id}
          size="small"
        >
          <p>
            Are you sure you want to deactivate{' '}
            <strong>{modal.employee.full_name}</strong> (
            {modal.employee.employee_code})?
          </p>
          <p className="text-muted">
            The record will remain in the system with an Inactive status.
          </p>
          {confirmError && <ModalError message={confirmError} />}
          <div className="modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={closeModal}
              disabled={deactivatingId === modal.employee.id}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={handleDeactivate}
              disabled={deactivatingId === modal.employee.id}
            >
              {deactivatingId === modal.employee.id ? (
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

export default EmployeesPage
