import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, LoaderCircle, Plus, RefreshCw, Search } from 'lucide-react'
import { useResourceList } from '../hooks/useResourceList'
import { formatDateTime } from '../utils/dashboardData'
import Modal from './Modal'
import NamedResourceForm from './NamedResourceForm'
import NamedResourceTable from './NamedResourceTable'

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

function RecordDetails({ record, config, onEdit, onClose }) {
  const { nameField, nameLabel, idLabel, resourceLabel } = config

  return (
    <>
      <dl className="detail-list">
        <div>
          <dt>{idLabel}</dt>
          <dd>#{record.id}</dd>
        </div>
        <div>
          <dt>{nameLabel}</dt>
          <dd>{record[nameField]}</dd>
        </div>
        <div className="detail-list--wide">
          <dt>Description</dt>
          <dd>{record.description ?? '—'}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span
              className={`status-badge status-badge--${record.is_active ? 'active' : 'inactive'}`}
            >
              {record.is_active ? 'Active' : 'Inactive'}
            </span>
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(record.created_at)}</dd>
        </div>
        {record.updated_at && (
          <div>
            <dt>Last updated</dt>
            <dd>{formatDateTime(record.updated_at)}</dd>
          </div>
        )}
      </dl>
      <div className="modal-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={() => onEdit(record.id)}
        >
          Edit {resourceLabel}
        </button>
        <button type="button" className="button-primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}

// Config-driven page shared by Brand Management and Process Management.
// It mirrors the Employee Management layout and reuses the same CSS classes.
function NamedResourceManagement({ config }) {
  const {
    title,
    description,
    resourceLabel,
    resourceLabelPlural,
    detailsTitle,
    nameField,
    nameLabel,
    idLabel,
    searchPlaceholder,
    directoryLabel,
    icons,
    service,
    validation,
  } = config

  const {
    records,
    loading,
    error: listError,
    reload,
  } = useResourceList(service.list, `Could not load ${resourceLabelPlural}.`)

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

  const getName = (record) => record?.[nameField] ?? 'record'

  const total = records.length
  const activeCount = useMemo(
    () => records.filter((record) => record.is_active).length,
    [records],
  )
  const inactiveCount = total - activeCount

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase()

    return records.filter((record) => {
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? record.is_active : !record.is_active)
      const matchesTerm =
        !term || String(record[nameField] ?? '').toLowerCase().includes(term)

      return matchesStatus && matchesTerm
    })
  }, [records, search, statusFilter, nameField])

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
    async (recordId, type) => {
      recordControllerRef.current?.abort()
      const controller = new AbortController()
      recordControllerRef.current = controller

      setFeedback(null)
      setFormErrors(NO_FORM_ERRORS)
      setConfirmError(null)
      setModal({ type, recordId, record: null, loading: true, error: null })

      try {
        const record = await service.get(recordId, { signal: controller.signal })
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
    },
    [service],
  )

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
        await service.update(recordId, payload)
        setFeedback({
          type: 'success',
          message: `${payload[nameField]} was updated successfully.`,
        })
      } else {
        await service.create(payload)
        setFeedback({
          type: 'success',
          message: `${payload[nameField]} was added successfully.`,
        })
      }
      closeModal()
      await reload()
    } catch (error) {
      setFormErrors(validation.mapServerErrors(error))
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDeactivate = async () => {
    const record = modal?.record
    if (!record) {
      return
    }

    setDeactivatingId(record.id)
    setConfirmError(null)

    try {
      await service.deactivate(record.id)
      closeModal()
      setFeedback({
        type: 'success',
        message: `${getName(record)} has been deactivated.`,
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

  const TotalIcon = icons.total
  const ActiveIcon = icons.active
  const InactiveIcon = icons.inactive

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--split">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
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
            Add {resourceLabel}
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
            <h3>Could not load {resourceLabelPlural}</h3>
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
            <TotalIcon size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : total}</span>
          <span className="stat-label">Total {resourceLabelPlural}</span>
          <span className="stat-note">All records in the system</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <ActiveIcon size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : activeCount}</span>
          <span className="stat-label">Active {resourceLabelPlural}</span>
          <span className="stat-note">Currently active</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon stat-icon--muted" aria-hidden="true">
            <InactiveIcon size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : inactiveCount}</span>
          <span className="stat-label">Inactive {resourceLabelPlural}</span>
          <span className="stat-note">Deactivated records</span>
        </div>
      </div>

      <section className="card employee-panel" aria-label={directoryLabel}>
        <div className="employee-toolbar">
          <div className="search-field">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={`Search ${resourceLabelPlural}`}
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
            Showing {filteredRecords.length} of {total} {resourceLabelPlural}
          </span>
        </div>

        <NamedResourceTable
          records={filteredRecords}
          loading={loading}
          nameField={nameField}
          nameLabel={nameLabel}
          idLabel={idLabel}
          resourceLabel={resourceLabel}
          resourceLabelPlural={resourceLabelPlural}
          deactivatingId={deactivatingId}
          onView={(id) => openRecord(id, 'view')}
          onEdit={(id) => openRecord(id, 'edit')}
          onDeactivate={openConfirm}
        />
      </section>

      {modal?.type === 'add' && (
        <Modal
          title={`Add ${resourceLabel}`}
          subtitle={`Create a new ${resourceLabel} master record.`}
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          <NamedResourceForm
            initialValues={validation.emptyForm()}
            validation={validation}
            nameField={nameField}
            nameLabel={nameLabel}
            resourceLabel={resourceLabel}
            serverErrors={formErrors}
            submitting={formSubmitting}
            onSubmit={handleFormSubmit}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal
          title={`Edit ${resourceLabel}`}
          subtitle={
            modal.record
              ? `${modal.record[nameField]} · Record #${modal.record.id}`
              : `Loading ${resourceLabel} record`
          }
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          {modal.loading ? (
            <ModalLoading label={`Loading ${resourceLabel}…`} />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.record ? (
            <NamedResourceForm
              key={modal.record.id}
              initialValues={validation.toForm(modal.record)}
              validation={validation}
              nameField={nameField}
              nameLabel={nameLabel}
              resourceLabel={resourceLabel}
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
          title={detailsTitle}
          subtitle={
            modal.record
              ? `Record #${modal.record.id}`
              : `Loading ${resourceLabel} record`
          }
          onClose={closeModal}
          size="large"
        >
          {modal.loading ? (
            <ModalLoading label={`Loading ${resourceLabel}…`} />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.record ? (
            <RecordDetails
              record={modal.record}
              config={config}
              onEdit={(id) => openRecord(id, 'edit')}
              onClose={closeModal}
            />
          ) : null}
        </Modal>
      )}

      {modal?.type === 'confirm' && (
        <Modal
          title={`Deactivate ${resourceLabel}`}
          subtitle="This action can be undone by editing the record."
          onClose={closeModal}
          closeDisabled={deactivatingId === modal.record.id}
          size="small"
        >
          <p>
            Are you sure you want to deactivate{' '}
            <strong>{getName(modal.record)}</strong>?
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
              disabled={deactivatingId === modal.record.id}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={handleDeactivate}
              disabled={deactivatingId === modal.record.id}
            >
              {deactivatingId === modal.record.id ? (
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

export default NamedResourceManagement
