import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Sun,
} from 'lucide-react'
import HolidayForm from '../components/HolidayForm'
import HolidayTable from '../components/HolidayTable'
import Modal from '../components/Modal'
import { useResourceList } from '../hooks/useResourceList'
import { holidayService } from '../services/holidayService'
import { formatDate } from '../utils/dashboardData'
import {
  emptyHolidayForm,
  holidayToForm,
  mapHolidayServerErrors,
} from '../utils/holidayValidation'

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

function HolidayDetails({ holiday, onEdit, onClose }) {
  return (
    <>
      <dl className="detail-list">
        <div>
          <dt>Holiday ID</dt>
          <dd>#{holiday.id}</dd>
        </div>
        <div>
          <dt>Holiday Name</dt>
          <dd>{holiday.holiday_name}</dd>
        </div>
        <div>
          <dt>Holiday Date</dt>
          <dd>{formatDate(holiday.holiday_date)}</dd>
        </div>
        <div className="detail-list--wide">
          <dt>Description</dt>
          <dd>{holiday.description ?? '—'}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDate(holiday.created_at)}</dd>
        </div>
      </dl>
      <div className="modal-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => onEdit(holiday.id)}
        >
          Edit holiday
        </button>
        <button type="button" className="button-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}

export default function HolidaysPage() {
  const {
    records: allHolidays,
    loading,
    error: listError,
    reload,
  } = useResourceList(holidayService.list, 'Could not load holidays.')

  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState('all')

  const [feedback, setFeedback] = useState(null)
  const [modal, setModal] = useState(null)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formErrors, setFormErrors] = useState(NO_FORM_ERRORS)
  const [confirmError, setConfirmError] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const recordControllerRef = useRef(null)

  useEffect(
    () => () => {
      recordControllerRef.current?.abort()
    },
    [],
  )

  const years = useMemo(
    () =>
      Array.from(
        new Set(
          allHolidays
            .map((holiday) => String(holiday.holiday_date ?? '').slice(0, 4))
            .filter((year) => /^\d{4}$/.test(year)),
        ),
      ).sort((a, b) => Number(b) - Number(a)),
    [allHolidays],
  )

  const filteredHolidays = useMemo(() => {
    const term = search.trim().toLowerCase()
    return allHolidays.filter((holiday) => {
      const matchesTerm =
        !term || holiday.holiday_name.toLowerCase().includes(term)
      const matchesYear =
        yearFilter === 'all' ||
        String(holiday.holiday_date ?? '').slice(0, 4) === yearFilter
      return matchesTerm && matchesYear
    })
  }, [allHolidays, search, yearFilter])

  const currentYear = String(new Date().getFullYear())
  const total = allHolidays.length
  const thisYearCount = useMemo(
    () =>
      allHolidays.filter(
        (holiday) => String(holiday.holiday_date ?? '').slice(0, 4) === currentYear,
      ).length,
    [allHolidays, currentYear],
  )
  const today = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate(),
    ).padStart(2, '0')}`
  }, [])
  const upcomingCount = useMemo(
    () =>
      allHolidays.filter((holiday) => String(holiday.holiday_date ?? '') >= today).length,
    [allHolidays, today],
  )

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

  const openRecord = useCallback(async (holidayId, type) => {
    recordControllerRef.current?.abort()
    const controller = new AbortController()
    recordControllerRef.current = controller

    setFeedback(null)
    setFormErrors(NO_FORM_ERRORS)
    setConfirmError(null)
    setModal({ type, holidayId, holiday: null, loading: true, error: null })

    try {
      const holiday = await holidayService.get(holidayId, { signal: controller.signal })
      if (controller.signal.aborted) {
        return
      }
      setModal((current) =>
        current?.type === type && current.holidayId === holidayId
          ? { ...current, holiday, loading: false }
          : current,
      )
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        return
      }
      setModal((current) =>
        current?.type === type && current.holidayId === holidayId
          ? { ...current, error: error.message, loading: false }
          : current,
      )
    }
  }, [])

  const openConfirm = (holiday) => {
    setFeedback(null)
    setConfirmError(null)
    setModal({ type: 'confirm', holiday })
  }

  const afterWrite = useCallback(async () => {
    await reload()
  }, [reload])

  const handleFormSubmit = async (payload) => {
    if (!modal) {
      return
    }

    const isEdit = modal.type === 'edit'
    const holidayId = modal.holiday?.id
    setFormSubmitting(true)
    setFormErrors(NO_FORM_ERRORS)

    try {
      if (isEdit) {
        await holidayService.update(holidayId, payload)
        setFeedback({
          type: 'success',
          message: `Holiday #${holidayId} was updated successfully.`,
        })
      } else {
        await holidayService.create(payload)
        setFeedback({ type: 'success', message: 'Holiday was added successfully.' })
      }
      closeModal()
      await afterWrite()
    } catch (error) {
      setFormErrors(mapHolidayServerErrors(error))
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDelete = async () => {
    const holiday = modal?.holiday
    if (!holiday) {
      return
    }

    setDeletingId(holiday.id)
    setConfirmError(null)

    try {
      await holidayService.remove(holiday.id)
      closeModal()
      setFeedback({
        type: 'success',
        message: `Holiday #${holiday.id} was deleted.`,
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
    await reload()
  }

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--split">
        <div>
          <h2>Holiday Management</h2>
          <p>Maintain the organisation-wide holiday calendar.</p>
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
            Add holiday
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
            <h3>Could not load holidays</h3>
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
            <Sun size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : total}</span>
          <span className="stat-label">Total holidays</span>
          <span className="stat-note">All recorded dates</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <CalendarDays size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : thisYearCount}</span>
          <span className="stat-label">{currentYear} holidays</span>
          <span className="stat-note">Current calendar year</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <CalendarDays size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : upcomingCount}</span>
          <span className="stat-label">Upcoming</span>
          <span className="stat-note">Today and later</span>
        </div>
      </div>

      <section className="card employee-panel" aria-label="Holiday directory">
        <div className="employee-toolbar">
          <div className="search-field">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search holiday name"
              aria-label="Search holidays"
            />
          </div>
          <select
            value={yearFilter}
            onChange={(event) => setYearFilter(event.target.value)}
            aria-label="Filter by year"
          >
            <option value="all">All years</option>
            {years.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <span className="result-count">
            Showing {filteredHolidays.length} of {total} holidays
          </span>
        </div>

        <HolidayTable
          holidays={filteredHolidays}
          loading={loading}
          deletingId={deletingId}
          onView={(id) => openRecord(id, 'view')}
          onEdit={(id) => openRecord(id, 'edit')}
          onDelete={openConfirm}
        />
      </section>

      {modal?.type === 'add' && (
        <Modal
          title="Add holiday"
          subtitle="Add a date to the organisation holiday calendar."
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          <HolidayForm
            initialValues={emptyHolidayForm()}
            holidays={allHolidays}
            serverErrors={formErrors}
            submitting={formSubmitting}
            onSubmit={handleFormSubmit}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal
          title="Edit holiday"
          subtitle={modal.holiday ? `Holiday #${modal.holiday.id}` : 'Loading holiday'}
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          {modal.loading ? (
            <ModalLoading label="Loading holiday…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.holiday ? (
            <HolidayForm
              key={modal.holiday.id}
              initialValues={{ ...holidayToForm(modal.holiday), id: modal.holiday.id }}
              holidays={allHolidays}
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
          title="Holiday details"
          subtitle={modal.holiday ? `Holiday #${modal.holiday.id}` : 'Loading holiday'}
          onClose={closeModal}
          size="large"
        >
          {modal.loading ? (
            <ModalLoading label="Loading holiday…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.holiday ? (
            <HolidayDetails
              holiday={modal.holiday}
              onEdit={(id) => openRecord(id, 'edit')}
              onClose={closeModal}
            />
          ) : null}
        </Modal>
      )}

      {modal?.type === 'confirm' && (
        <Modal
          title="Delete holiday"
          subtitle="This action cannot be undone."
          onClose={closeModal}
          closeDisabled={deletingId === modal.holiday.id}
          size="small"
        >
          <p>
            Are you sure you want to delete{' '}
            <strong>{modal.holiday.holiday_name}</strong>?
          </p>
          <p className="text-muted">{formatDate(modal.holiday.holiday_date)}</p>
          {confirmError && <ModalError message={confirmError} />}
          <div className="modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={closeModal}
              disabled={deletingId === modal.holiday.id}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={handleDelete}
              disabled={deletingId === modal.holiday.id}
            >
              {deletingId === modal.holiday.id ? (
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
