import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CalendarCheck,
  CalendarDays,
  Clock3,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react'
import LeaveForm from '../components/LeaveForm'
import LeaveTable from '../components/LeaveTable'
import Modal from '../components/Modal'
import { useOptions } from '../hooks/useOptions'
import { useResourceList } from '../hooks/useResourceList'
import { getEmployees } from '../services/employeeService'
import { leaveService } from '../services/leaveService'
import { formatDate, formatDateRange } from '../utils/dashboardData'
import {
  emptyLeaveForm,
  LEAVE_STATUSES,
  leaveToForm,
  mapLeaveServerErrors,
} from '../utils/leaveValidation'

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

function LeaveDetails({ leave, lookups, onEdit, onClose }) {
  const employee = lookups.describeEmployee(leave.employee_id)
  return (
    <>
      <dl className="detail-list">
        <div>
          <dt>Leave ID</dt>
          <dd>#{leave.id}</dd>
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
          <dt>Leave Type</dt>
          <dd>{leave.leave_type}</dd>
        </div>
        <div className="detail-list--wide">
          <dt>Date Range</dt>
          <dd>{formatDateRange(leave.start_date, leave.end_date)}</dd>
        </div>
        <div>
          <dt>Start Date</dt>
          <dd>{formatDate(leave.start_date)}</dd>
        </div>
        <div>
          <dt>End Date</dt>
          <dd>{formatDate(leave.end_date)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span
              className={`status-badge status-badge--${
                leave.status === 'Approved'
                  ? 'approved'
                  : leave.status === 'Rejected'
                    ? 'rejected'
                    : 'pending'
              }`}
            >
              {leave.status}
            </span>
          </dd>
        </div>
        <div className="detail-list--wide">
          <dt>Reason</dt>
          <dd>{leave.reason ?? '—'}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDate(leave.created_at)}</dd>
        </div>
      </dl>
      <div className="modal-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => onEdit(leave.id)}
        >
          Edit leave request
        </button>
        <button type="button" className="button-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}

export default function LeavesPage() {
  const {
    records: allLeaves,
    loading,
    error: listError,
    reload,
  } = useResourceList(leaveService.list, 'Could not load leave requests.')

  const {
    items: employees,
    loading: employeesLoading,
    error: employeesError,
    reload: reloadEmployees,
  } = useOptions(getEmployees, 'Could not load employees.')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
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

  // Employee filter uses the existing /api/employees/{id}/leaves endpoint.
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
        const records = await leaveService.listForEmployee(employeeFilter, {
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
        setFilterError(error?.message ?? 'Could not load this employee’s leaves.')
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

  const lookups = useMemo(
    () => ({
      describeEmployee: (id) => {
        const employee = employeeById.get(id)
        return employee
          ? { name: employee.full_name, code: employee.employee_code }
          : { name: `Employee #${id}`, code: '—' }
      },
    }),
    [employeeById],
  )

  const sourceRecords = useMemo(
    () => (employeeFilter ? (filteredRecords ?? []) : allLeaves),
    [employeeFilter, filteredRecords, allLeaves],
  )
  const displayLoading = employeeFilter ? loading || filterLoading : loading

  const leaveTypes = useMemo(
    () =>
      Array.from(
        new Set(allLeaves.map((leave) => leave.leave_type).filter(Boolean)),
      ).sort(),
    [allLeaves],
  )

  const filteredLeaves = useMemo(() => {
    const term = search.trim().toLowerCase()
    return sourceRecords.filter((leave) => {
      const employee = lookups.describeEmployee(leave.employee_id)
      const matchesTerm =
        !term ||
        employee.name.toLowerCase().includes(term) ||
        employee.code.toLowerCase().includes(term)
      const matchesStatus =
        statusFilter === 'all' || leave.status === statusFilter
      const matchesType = typeFilter === 'all' || leave.leave_type === typeFilter
      return matchesTerm && matchesStatus && matchesType
    })
  }, [sourceRecords, search, statusFilter, typeFilter, lookups])

  const total = allLeaves.length
  const pendingCount = useMemo(
    () => allLeaves.filter((leave) => leave.status === 'Pending').length,
    [allLeaves],
  )
  const approvedCount = useMemo(
    () => allLeaves.filter((leave) => leave.status === 'Approved').length,
    [allLeaves],
  )

  const optionsError = employeesError

  const afterWrite = useCallback(async () => {
    await reload()
    setFilterVersion((version) => version + 1)
  }, [reload])

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

  const openRecord = useCallback(async (leaveId, type) => {
    recordControllerRef.current?.abort()
    const controller = new AbortController()
    recordControllerRef.current = controller

    setFeedback(null)
    setFormErrors(NO_FORM_ERRORS)
    setConfirmError(null)
    setModal({ type, leaveId, leave: null, loading: true, error: null })

    try {
      const leave = await leaveService.get(leaveId, { signal: controller.signal })
      if (controller.signal.aborted) {
        return
      }
      setModal((current) =>
        current?.type === type && current.leaveId === leaveId
          ? { ...current, leave, loading: false }
          : current,
      )
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        return
      }
      setModal((current) =>
        current?.type === type && current.leaveId === leaveId
          ? { ...current, error: error.message, loading: false }
          : current,
      )
    }
  }, [])

  const openConfirm = (leave) => {
    setFeedback(null)
    setConfirmError(null)
    setModal({ type: 'confirm', leave })
  }

  const handleFormSubmit = async (payload) => {
    if (!modal) {
      return
    }

    const isEdit = modal.type === 'edit'
    const leaveId = modal.leave?.id
    setFormSubmitting(true)
    setFormErrors(NO_FORM_ERRORS)

    try {
      if (isEdit) {
        await leaveService.update(leaveId, payload)
        setFeedback({
          type: 'success',
          message: `Leave request #${leaveId} was updated successfully.`,
        })
      } else {
        await leaveService.create(payload)
        setFeedback({ type: 'success', message: 'Leave request was added successfully.' })
      }
      closeModal()
      await afterWrite()
    } catch (error) {
      setFormErrors(mapLeaveServerErrors(error))
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDelete = async () => {
    const leave = modal?.leave
    if (!leave) {
      return
    }

    setDeletingId(leave.id)
    setConfirmError(null)

    try {
      await leaveService.remove(leave.id)
      closeModal()
      setFeedback({
        type: 'success',
        message: `Leave request #${leave.id} was deleted.`,
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
    await Promise.all([reload(), reloadEmployees()])
    setFilterVersion((version) => version + 1)
  }

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--split">
        <div>
          <h2>Leave Management</h2>
          <p>Record leave requests and track their approval status.</p>
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
            Add leave request
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
            <h3>Could not load leave requests</h3>
            <p>{listError}</p>
          </div>
          <button type="button" className="button-secondary" onClick={handleRefresh}>
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
            <h3>Could not load this employee’s leaves</h3>
            <p>{filterError}</p>
          </div>
          <button
            type="button"
            className="button-secondary"
            onClick={() => setFilterVersion((version) => version + 1)}
          >
            Retry
          </button>
        </div>
      )}

      <div className="employee-stats">
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <CalendarDays size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : total}</span>
          <span className="stat-label">Total requests</span>
          <span className="stat-note">All leave records</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <Clock3 size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : pendingCount}</span>
          <span className="stat-label">Pending</span>
          <span className="stat-note">Awaiting a decision</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <CalendarCheck size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : approvedCount}</span>
          <span className="stat-label">Approved</span>
          <span className="stat-note">Approved requests</span>
        </div>
      </div>

      <section className="card employee-panel" aria-label="Leave directory">
        <div className="employee-toolbar">
          <div className="search-field">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee name or code"
              aria-label="Search leave requests"
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
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by leave status"
          >
            <option value="all">All statuses</option>
            {LEAVE_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            aria-label="Filter by leave type"
          >
            <option value="all">All leave types</option>
            {leaveTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <span className="result-count">
            Showing {filteredLeaves.length} of{' '}
            {employeeFilter ? sourceRecords.length : total} leave requests
          </span>
        </div>

        <LeaveTable
          leaves={filteredLeaves}
          loading={displayLoading}
          describeEmployee={lookups.describeEmployee}
          deletingId={deletingId}
          onView={(id) => openRecord(id, 'view')}
          onEdit={(id) => openRecord(id, 'edit')}
          onDelete={openConfirm}
        />
      </section>

      {modal?.type === 'add' && (
        <Modal
          title="Add leave request"
          subtitle="Create a leave request for an employee."
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          <LeaveForm
            initialValues={emptyLeaveForm()}
            employees={employees}
            optionsLoading={employeesLoading}
            optionsError={optionsError}
            onRetryOptions={reloadEmployees}
            leaves={allLeaves}
            serverErrors={formErrors}
            submitting={formSubmitting}
            onSubmit={handleFormSubmit}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal
          title="Edit leave request"
          subtitle={
            modal.leave ? `Leave #${modal.leave.id}` : 'Loading leave request'
          }
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          {modal.loading ? (
            <ModalLoading label="Loading leave request…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.leave ? (
            <LeaveForm
              key={modal.leave.id}
              initialValues={{ ...leaveToForm(modal.leave), id: modal.leave.id }}
              employees={employees}
              optionsLoading={employeesLoading}
              optionsError={optionsError}
              onRetryOptions={reloadEmployees}
              leaves={allLeaves}
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
          title="Leave details"
          subtitle={modal.leave ? `Leave #${modal.leave.id}` : 'Loading leave request'}
          onClose={closeModal}
          size="large"
        >
          {modal.loading ? (
            <ModalLoading label="Loading leave request…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.leave ? (
            <LeaveDetails
              leave={modal.leave}
              lookups={lookups}
              onEdit={(id) => openRecord(id, 'edit')}
              onClose={closeModal}
            />
          ) : null}
        </Modal>
      )}

      {modal?.type === 'confirm' && (
        <Modal
          title="Delete leave request"
          subtitle="This action cannot be undone."
          onClose={closeModal}
          closeDisabled={deletingId === modal.leave.id}
          size="small"
        >
          <p>
            Are you sure you want to delete leave request{' '}
            <strong>#{modal.leave.id}</strong>?
          </p>
          <p className="text-muted">
            {lookups.describeEmployee(modal.leave.employee_id).name} ·{' '}
            {modal.leave.leave_type} ·{' '}
            {formatDateRange(modal.leave.start_date, modal.leave.end_date)}
          </p>
          {confirmError && <ModalError message={confirmError} />}
          <div className="modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={closeModal}
              disabled={deletingId === modal.leave.id}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={handleDelete}
              disabled={deletingId === modal.leave.id}
            >
              {deletingId === modal.leave.id ? (
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
