import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ClipboardList,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Tags,
  Users,
} from 'lucide-react'
import AssignmentForm from '../components/AssignmentForm'
import AssignmentTable from '../components/AssignmentTable'
import Modal from '../components/Modal'
import { useOptions } from '../hooks/useOptions'
import { useResourceList } from '../hooks/useResourceList'
import { assignmentService } from '../services/assignmentService'
import { brandService } from '../services/brandService'
import { getEmployees } from '../services/employeeService'
import { processService } from '../services/processService'
import { formatDateTime } from '../utils/dashboardData'
import {
  assignmentToForm,
  emptyAssignmentForm,
  mapAssignmentServerErrors,
} from '../utils/assignmentValidation'

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

function AssignmentDetails({ assignment, lookups, onEdit, onClose }) {
  const employee = lookups.describeEmployee(assignment.employee_id)
  return (
    <>
      <dl className="detail-list">
        <div>
          <dt>Assignment ID</dt>
          <dd>#{assignment.id}</dd>
        </div>
        <div>
          <dt>Employee Name</dt>
          <dd>{employee.name}</dd>
        </div>
        <div>
          <dt>Employee Code</dt>
          <dd>{employee.code}</dd>
        </div>
        <div>
          <dt>Brand Name</dt>
          <dd>{lookups.describeBrand(assignment.brand_id)}</dd>
        </div>
        <div>
          <dt>Process Name</dt>
          <dd>{lookups.describeProcess(assignment.process_id)}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(assignment.created_at)}</dd>
        </div>
      </dl>
      <div className="modal-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => onEdit(assignment.id)}
        >
          Edit assignment
        </button>
        <button type="button" className="button-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}

export default function AssignmentsPage() {
  const {
    records: allAssignments,
    loading,
    error: listError,
    reload,
  } = useResourceList(assignmentService.list, 'Could not load assignments.')

  const {
    items: employees,
    loading: employeesLoading,
    error: employeesError,
    reload: reloadEmployees,
  } = useOptions(getEmployees, 'Could not load employees.')

  const {
    items: brands,
    loading: brandsLoading,
    error: brandsError,
    reload: reloadBrands,
  } = useOptions(brandService.list, 'Could not load brands.')

  const {
    items: processes,
    loading: processesLoading,
    error: processesError,
    reload: reloadProcesses,
  } = useOptions(processService.list, 'Could not load processes.')

  const [search, setSearch] = useState('')
  const [employeeFilter, setEmployeeFilter] = useState('')
  const [filterVersion, setFilterVersion] = useState(0)
  const [filteredRecords, setFilteredRecords] = useState(null)
  const [filterLoading, setFilterLoading] = useState(false)
  const [filterError, setFilterError] = useState(null)
  const filterControllerRef = useRef(null)

  const [feedback, setFeedback] = useState(null)
  const [modal, setModal] = useState(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState(NO_FORM_ERRORS)
  const [confirmError, setConfirmError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const recordControllerRef = useRef(null)

  // Use the existing per-employee endpoint when an employee filter is chosen.
  useEffect(() => {
    filterControllerRef.current?.abort()

    if (!employeeFilter) {
      setFilteredRecords(null)
      setFilterLoading(false)
      setFilterError(null)
      return undefined
    }

    const controller = new AbortController()
    filterControllerRef.current = controller
    setFilterLoading(true)
    setFilterError(null)

    void (async () => {
      try {
        const records = await assignmentService.listForEmployee(employeeFilter, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) {
          return
        }
        setFilteredRecords(Array.isArray(records) ? records : [])
        setFilterLoading(false)
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') {
          return
        }
        setFilteredRecords([])
        setFilterLoading(false)
        setFilterError(error?.message ?? 'Could not load employee assignments.')
      }
    })()

    return () => controller.abort()
  }, [employeeFilter, filterVersion])

  useEffect(
    () => () => {
      recordControllerRef.current?.abort()
      filterControllerRef.current?.abort()
    },
    [],
  )

  const employeeById = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  )
  const brandById = useMemo(
    () => new Map(brands.map((brand) => [brand.id, brand])),
    [brands],
  )
  const processById = useMemo(
    () => new Map(processes.map((process) => [process.id, process])),
    [processes],
  )

  const lookups = useMemo(
    () => ({
      describeEmployee: (id) => {
        const employee = employeeById.get(id)
        return employee
          ? { name: employee.full_name, code: employee.employee_code }
          : { name: `Employee #${id}`, code: '—' }
      },
      describeBrand: (id) => brandById.get(id)?.brand_name ?? `Brand #${id}`,
      describeProcess: (id) =>
        processById.get(id)?.process_name ?? `Process #${id}`,
    }),
    [employeeById, brandById, processById],
  )

  const sourceRecords = useMemo(
    () => (employeeFilter ? (filteredRecords ?? []) : allAssignments),
    [employeeFilter, filteredRecords, allAssignments],
  )
  const displayLoading = employeeFilter ? loading || filterLoading : loading

  const filteredAssignments = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) {
      return sourceRecords
    }
    return sourceRecords.filter((assignment) => {
      const employee = lookups.describeEmployee(assignment.employee_id)
      const values = [
        String(assignment.id),
        employee.name,
        employee.code,
        lookups.describeBrand(assignment.brand_id),
        lookups.describeProcess(assignment.process_id),
      ]
      return values.some((value) => String(value).toLowerCase().includes(term))
    })
  }, [sourceRecords, search, lookups])

  const total = allAssignments.length
  const employeeCount = useMemo(
    () => new Set(allAssignments.map((item) => item.employee_id)).size,
    [allAssignments],
  )
  const brandCount = useMemo(
    () => new Set(allAssignments.map((item) => item.brand_id)).size,
    [allAssignments],
  )

  const optionsLoading = employeesLoading || brandsLoading || processesLoading
  const optionsError = employeesError || brandsError || processesError

  const retryOptions = () => {
    if (employeesError) {
      reloadEmployees()
    }
    if (brandsError) {
      reloadBrands()
    }
    if (processesError) {
      reloadProcesses()
    }
  }

  const retryFilter = () => setFilterVersion((version) => version + 1)

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
    async (assignmentId, type) => {
      recordControllerRef.current?.abort()
      const controller = new AbortController()
      recordControllerRef.current = controller

      setFeedback(null)
      setFormErrors(NO_FORM_ERRORS)
      setConfirmError(null)
      setModal({
        type,
        assignmentId,
        assignment: null,
        loading: true,
        error: null,
      })

      try {
        const assignment = await assignmentService.get(assignmentId, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) {
          return
        }
        setModal((current) =>
          current?.type === type && current.assignmentId === assignmentId
            ? { ...current, assignment, loading: false }
            : current,
        )
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') {
          return
        }
        setModal((current) =>
          current?.type === type && current.assignmentId === assignmentId
            ? { ...current, error: error.message, loading: false }
            : current,
        )
      }
    },
    [],
  )

  const openConfirm = (assignment) => {
    setFeedback(null)
    setConfirmError(null)
    setModal({ type: 'confirm', assignment })
  }

  const afterWrite = useCallback(async () => {
    await reload()
    setFilterVersion((version) => version + 1)
  }, [reload])

  const handleFormSubmit = async (payload) => {
    if (!modal) {
      return
    }

    const isEdit = modal.type === 'edit'
    const assignmentId = modal.assignment?.id
    setFormSubmitting(true)
    setFormErrors(NO_FORM_ERRORS)

    try {
      if (isEdit) {
        await assignmentService.update(assignmentId, payload)
        setFeedback({
          type: 'success',
          message: `Assignment #${assignmentId} was updated successfully.`,
        })
      } else {
        await assignmentService.create(payload)
        setFeedback({
          type: 'success',
          message: 'Assignment was added successfully.',
        })
      }
      closeModal()
      await afterWrite()
    } catch (error) {
      setFormErrors(mapAssignmentServerErrors(error))
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDelete = async () => {
    const assignment = modal?.assignment
    if (!assignment) {
      return
    }

    setDeletingId(assignment.id)
    setConfirmError(null)

    try {
      await assignmentService.remove(assignment.id)
      closeModal()
      setFeedback({
        type: 'success',
        message: `Assignment #${assignment.id} was deleted.`,
      })
      await afterWrite()
    } catch (error) {
      setConfirmError(error.message)
    } finally {
      setDeletingId(null)
    }
  }

  const handleRefresh = async () => {
    setFeedback(null)
    await Promise.all([
      reload(),
      reloadEmployees(),
      reloadBrands(),
      reloadProcesses(),
    ])
    setFilterVersion((version) => version + 1)
  }

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--split">
        <div>
          <h2>Employee Assignments</h2>
          <p>Assign employees to a brand and process combination.</p>
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
            Add assignment
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
            <h3>Could not load assignments</h3>
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

      {optionsError && (
        <div className="card error-banner" role="alert">
          <span className="error-banner-icon" aria-hidden="true">
            <AlertCircle size={22} />
          </span>
          <div className="error-banner-body">
            <h3>Could not load assignment options</h3>
            <p>{optionsError}</p>
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={retryOptions}
          >
            Retry
          </button>
        </div>
      )}

      {filterError && (
        <div className="card error-banner" role="alert">
          <span className="error-banner-icon" aria-hidden="true">
            <AlertCircle size={22} />
          </span>
          <div className="error-banner-body">
            <h3>Could not load this employee's assignments</h3>
            <p>{filterError}</p>
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={retryFilter}
          >
            Retry
          </button>
        </div>
      )}

      <div className="employee-stats">
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <ClipboardList size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : total}</span>
          <span className="stat-label">Total assignments</span>
          <span className="stat-note">All records in the system</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <Users size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : employeeCount}</span>
          <span className="stat-label">Employees assigned</span>
          <span className="stat-note">Distinct employees</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <Tags size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : brandCount}</span>
          <span className="stat-label">Brands covered</span>
          <span className="stat-note">Distinct brands</span>
        </div>
      </div>

      <section className="card employee-panel" aria-label="Assignment directory">
        <div className="employee-toolbar">
          <div className="search-field">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee, code, brand or process"
              aria-label="Search assignments"
            />
          </div>
          <select
            value={employeeFilter}
            onChange={(event) => setEmployeeFilter(event.target.value)}
            aria-label="Filter by employee"
          >
            <option value="">All employees</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name} ({employee.employee_code})
              </option>
            ))}
          </select>
          <span className="result-count">
            Showing {filteredAssignments.length} of{' '}
            {employeeFilter ? sourceRecords.length : total} assignments
          </span>
        </div>

        <AssignmentTable
          assignments={filteredAssignments}
          loading={displayLoading}
          describeEmployee={lookups.describeEmployee}
          describeBrand={lookups.describeBrand}
          describeProcess={lookups.describeProcess}
          deletingId={deletingId}
          onView={(id) => openRecord(id, 'view')}
          onEdit={(id) => openRecord(id, 'edit')}
          onDelete={openConfirm}
        />
      </section>

      {modal?.type === 'add' && (
        <Modal
          title="Add assignment"
          subtitle="Link an employee to a brand and process."
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          <AssignmentForm
            initialValues={emptyAssignmentForm()}
            employees={employees}
            brands={brands}
            processes={processes}
            optionsLoading={optionsLoading}
            optionsError={optionsError}
            onRetryOptions={retryOptions}
            assignments={allAssignments}
            serverErrors={formErrors}
            submitting={formSubmitting}
            onSubmit={handleFormSubmit}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal
          title="Edit assignment"
          subtitle={
            modal.assignment
              ? `Assignment #${modal.assignment.id}`
              : 'Loading assignment'
          }
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          {modal.loading ? (
            <ModalLoading label="Loading assignment…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.assignment ? (
            <AssignmentForm
              key={modal.assignment.id}
              initialValues={{
                ...assignmentToForm(modal.assignment),
                id: modal.assignment.id,
              }}
              employees={employees}
              brands={brands}
              processes={processes}
              optionsLoading={optionsLoading}
              optionsError={optionsError}
              onRetryOptions={retryOptions}
              assignments={allAssignments}
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
          title="Assignment details"
          subtitle={
            modal.assignment
              ? `Assignment #${modal.assignment.id}`
              : 'Loading assignment'
          }
          onClose={closeModal}
          size="large"
        >
          {modal.loading ? (
            <ModalLoading label="Loading assignment…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.assignment ? (
            <AssignmentDetails
              assignment={modal.assignment}
              lookups={lookups}
              onEdit={(id) => openRecord(id, 'edit')}
              onClose={closeModal}
            />
          ) : null}
        </Modal>
      )}

      {modal?.type === 'confirm' && (
        <Modal
          title="Delete assignment"
          subtitle="This action cannot be undone."
          onClose={closeModal}
          closeDisabled={deletingId === modal.assignment.id}
          size="small"
        >
          <p>
            Are you sure you want to delete assignment{' '}
            <strong>#{modal.assignment.id}</strong>?
          </p>
          <p className="text-muted">
            {lookups.describeEmployee(modal.assignment.employee_id).name} ·{' '}
            {lookups.describeBrand(modal.assignment.brand_id)} ·{' '}
            {lookups.describeProcess(modal.assignment.process_id)}
          </p>
          {confirmError && <ModalError message={confirmError} />}
          <div className="modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={closeModal}
              disabled={deletingId === modal.assignment.id}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={handleDelete}
              disabled={deletingId === modal.assignment.id}
            >
              {deletingId === modal.assignment.id ? (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              ) : null}
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
