import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CalendarOff,
  CalendarRange,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
import Modal from '../components/Modal'
import WeeklyOffForm from '../components/WeeklyOffForm'
import WeeklyOffTable from '../components/WeeklyOffTable'
import { useOptions } from '../hooks/useOptions'
import { useResourceList } from '../hooks/useResourceList'
import { getEmployees } from '../services/employeeService'
import { weeklyOffService } from '../services/weeklyOffService'
import { formatDate } from '../utils/dashboardData'
import {
  DAYS_OF_WEEK,
  emptyWeeklyOffForm,
  mapWeeklyOffServerErrors,
  weeklyOffToForm,
} from '../utils/weeklyOffValidation'

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

function WeeklyOffDetails({ record, lookups, onEdit, onClose }) {
  const employee = lookups.describeEmployee(record.employee_id)
  return (
    <>
      <dl className="detail-list">
        <div>
          <dt>Weekly Off ID</dt>
          <dd>#{record.id}</dd>
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
          <dt>Day of Week</dt>
          <dd>{record.day_of_week}</dd>
        </div>
        <div className="detail-list--wide">
          <dt>Created</dt>
          <dd>{formatDate(record.created_at)}</dd>
        </div>
      </dl>
      <div className="modal-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => onEdit(record.id)}
        >
          Edit weekly off
        </button>
        <button type="button" className="button-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}

export default function WeeklyOffsPage() {
  const {
    records: allRecords,
    loading,
    error: listError,
    reload,
  } = useResourceList(weeklyOffService.list, 'Could not load weekly offs.')

  const {
    items: employees,
    loading: employeesLoading,
    error: employeesError,
    reload: reloadEmployees,
  } = useOptions(getEmployees, 'Could not load employees.')

  const [search, setSearch] = useState('')
  const [dayFilter, setDayFilter] = useState('all')
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

  // Employee filter uses the existing /api/employees/{id}/weekly-offs endpoint.
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
        const records = await weeklyOffService.listForEmployee(employeeFilter, {
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
        setFilterError(error?.message ?? 'Could not load this employee’s weekly offs.')
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
    () => (employeeFilter ? (filteredRecords ?? []) : allRecords),
    [employeeFilter, filteredRecords, allRecords],
  )
  const displayLoading = employeeFilter ? loading || filterLoading : loading

  const filteredRecordsForTable = useMemo(() => {
    const term = search.trim().toLowerCase()
    return sourceRecords.filter((record) => {
      const employee = lookups.describeEmployee(record.employee_id)
      const matchesTerm =
        !term ||
        employee.name.toLowerCase().includes(term) ||
        employee.code.toLowerCase().includes(term)
      const matchesDay =
        dayFilter === 'all' ||
        String(record.day_of_week).toLowerCase() === dayFilter.toLowerCase()
      return matchesTerm && matchesDay
    })
  }, [sourceRecords, search, dayFilter, lookups])

  const total = allRecords.length
  const employeeCount = useMemo(
    () => new Set(allRecords.map((record) => record.employee_id)).size,
    [allRecords],
  )
  const daysCovered = useMemo(
    () => new Set(allRecords.map((record) => record.day_of_week)).size,
    [allRecords],
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

  const openRecord = useCallback(async (recordId, type) => {
    recordControllerRef.current?.abort()
    const controller = new AbortController()
    recordControllerRef.current = controller

    setFeedback(null)
    setFormErrors(NO_FORM_ERRORS)
    setConfirmError(null)
    setModal({ type, recordId, record: null, loading: true, error: null })

    try {
      const record = await weeklyOffService.get(recordId, { signal: controller.signal })
      if (controller.signal.aborted) {
        return
      }
      setModal((current) =>
        current?.type === type && current.recordId === recordId
          ? { ...current, record, loading: false }
          : current,
      )
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        return
      }
      setModal((current) =>
        current?.type === type && current.recordId === recordId
          ? { ...current, error: error.message, loading: false }
          : current,
      )
    }
  }, [])

  const openConfirm = (record) => {
    setFeedback(null)
    setConfirmError(null)
    setModal({ type: 'confirm', record })
  }

  const handleFormSubmit = async (payload) => {
    if (!modal) {
      return
    }

    const isEdit = modal.type === 'edit'
    const recordId = modal.record?.id
    setFormSubmitting(true)
    setFormErrors(NO_FORM_ERRORS)

    try {
      if (isEdit) {
        await weeklyOffService.update(recordId, payload)
        setFeedback({
          type: 'success',
          message: `Weekly off #${recordId} was updated successfully.`,
        })
      } else {
        await weeklyOffService.create(payload)
        setFeedback({ type: 'success', message: 'Weekly off was added successfully.' })
      }
      closeModal()
      await afterWrite()
    } catch (error) {
      setFormErrors(mapWeeklyOffServerErrors(error))
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDelete = async () => {
    const record = modal?.record
    if (!record) {
      return
    }

    setDeletingId(record.id)
    setConfirmError(null)

    try {
      await weeklyOffService.remove(record.id)
      closeModal()
      setFeedback({
        type: 'success',
        message: `Weekly off #${record.id} was deleted.`,
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
          <h2>Weekly Off Management</h2>
          <p>Set each employee’s recurring day off for the week.</p>
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
            Add weekly off
          </button>
        </div>
      </div>

      {feedback && (
        <div className="card feedback-banner feedback-banner--success" role="status">
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
            <h3>Could not load weekly offs</h3>
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
            <h3>Could not load this employee’s weekly offs</h3>
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
            <CalendarOff size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : total}</span>
          <span className="stat-label">Total weekly offs</span>
          <span className="stat-note">All scheduled days</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <Users size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : employeeCount}</span>
          <span className="stat-label">Employees covered</span>
          <span className="stat-note">With at least one day off</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <CalendarRange size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : daysCovered}</span>
          <span className="stat-label">Days covered</span>
          <span className="stat-note">Distinct weekdays</span>
        </div>
      </div>

      <section className="card employee-panel" aria-label="Weekly off directory">
        <div className="employee-toolbar">
          <div className="search-field">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee name or code"
              aria-label="Search weekly offs"
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
            value={dayFilter}
            onChange={(event) => setDayFilter(event.target.value)}
            aria-label="Filter by day of week"
          >
            <option value="all">All days</option>
            {DAYS_OF_WEEK.map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
          <span className="result-count">
            Showing {filteredRecordsForTable.length} of{' '}
            {employeeFilter ? sourceRecords.length : total} weekly offs
          </span>
        </div>

        <WeeklyOffTable
          records={filteredRecordsForTable}
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
          title="Add weekly off"
          subtitle="Assign a recurring day off to an employee."
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          <WeeklyOffForm
            initialValues={emptyWeeklyOffForm()}
            employees={employees}
            optionsLoading={employeesLoading}
            optionsError={optionsError}
            onRetryOptions={reloadEmployees}
            records={allRecords}
            serverErrors={formErrors}
            submitting={formSubmitting}
            onSubmit={handleFormSubmit}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal
          title="Edit weekly off"
          subtitle={modal.record ? `Weekly off #${modal.record.id}` : 'Loading weekly off'}
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          {modal.loading ? (
            <ModalLoading label="Loading weekly off…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.record ? (
            <WeeklyOffForm
              key={modal.record.id}
              initialValues={{ ...weeklyOffToForm(modal.record), id: modal.record.id }}
              employees={employees}
              optionsLoading={employeesLoading}
              optionsError={optionsError}
              onRetryOptions={reloadEmployees}
              records={allRecords}
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
          title="Weekly off details"
          subtitle={modal.record ? `Weekly off #${modal.record.id}` : 'Loading weekly off'}
          onClose={closeModal}
          size="large"
        >
          {modal.loading ? (
            <ModalLoading label="Loading weekly off…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.record ? (
            <WeeklyOffDetails
              record={modal.record}
              lookups={lookups}
              onEdit={(id) => openRecord(id, 'edit')}
              onClose={closeModal}
            />
          ) : null}
        </Modal>
      )}

      {modal?.type === 'confirm' && (
        <Modal
          title="Delete weekly off"
          subtitle="This action cannot be undone."
          onClose={closeModal}
          closeDisabled={deletingId === modal.record.id}
          size="small"
        >
          <p>
            Are you sure you want to delete weekly off <strong>#{modal.record.id}</strong>?
          </p>
          <p className="text-muted">
            {lookups.describeEmployee(modal.record.employee_id).name} ·{' '}
            {modal.record.day_of_week}
          </p>
          {confirmError && <ModalError message={confirmError} />}
          <div className="modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={closeModal}
              disabled={deletingId === modal.record.id}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={handleDelete}
              disabled={deletingId === modal.record.id}
            >
              {deletingId === modal.record.id ? (
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
