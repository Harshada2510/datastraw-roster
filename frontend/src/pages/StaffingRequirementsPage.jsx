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
import Modal from '../components/Modal'
import StaffingRequirementForm from '../components/StaffingRequirementForm'
import StaffingRequirementTable from '../components/StaffingRequirementTable'
import { useOptions } from '../hooks/useOptions'
import { useResourceList } from '../hooks/useResourceList'
import { brandService } from '../services/brandService'
import { processService } from '../services/processService'
import { staffingRequirementService } from '../services/staffingRequirementService'
import { formatDateRange } from '../utils/dashboardData'
import {
  emptyStaffingRequirementForm,
  mapStaffingRequirementServerErrors,
  staffingRequirementToForm,
} from '../utils/staffingRequirementValidation'

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

export default function StaffingRequirementsPage() {
  const {
    records: allRequirements,
    loading,
    error: listError,
    reload,
  } = useResourceList(
    staffingRequirementService.list,
    'Could not load staffing requirements.',
  )

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

  const brandById = useMemo(
    () => new Map(brands.map((brand) => [brand.id, brand.brand_name])),
    [brands],
  )
  const processById = useMemo(
    () => new Map(processes.map((process) => [process.id, process.process_name])),
    [processes],
  )

  const lookups = useMemo(
    () => ({
      describeBrand: (id) => brandById.get(id) ?? `Brand #${id}`,
      describeProcess: (id) => processById.get(id) ?? `Process #${id}`,
    }),
    [brandById, processById],
  )

  const filteredRequirements = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) {
      return allRequirements
    }
    return allRequirements.filter((requirement) =>
      [
        String(requirement.id),
        lookups.describeBrand(requirement.brand_id),
        lookups.describeProcess(requirement.process_id),
        requirement.start_date,
        requirement.end_date,
        requirement.notes ?? '',
      ].some((value) => String(value).toLowerCase().includes(term)),
    )
  }, [allRequirements, search, lookups])

  const totalRequiredEmployees = useMemo(
    () =>
      allRequirements.reduce(
        (total, requirement) => total + Number(requirement.required_count ?? 0),
        0,
      ),
    [allRequirements],
  )
  const brandCount = useMemo(
    () => new Set(allRequirements.map((requirement) => requirement.brand_id)).size,
    [allRequirements],
  )

  const optionsLoading = brandsLoading || processesLoading
  const optionsError = brandsError || processesError

  const retryOptions = () => {
    if (brandsError) {
      reloadBrands()
    }
    if (processesError) {
      reloadProcesses()
    }
  }

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

  const openRecord = useCallback(async (requirementId) => {
    recordControllerRef.current?.abort()
    const controller = new AbortController()
    recordControllerRef.current = controller

    setFeedback(null)
    setFormErrors(NO_FORM_ERRORS)
    setConfirmError(null)
    setModal({
      type: 'edit',
      requirementId,
      requirement: null,
      loading: true,
      error: null,
    })

    try {
      const requirement = await staffingRequirementService.get(requirementId, {
        signal: controller.signal,
      })
      if (controller.signal.aborted) {
        return
      }
      setModal((current) =>
        current?.type === 'edit' && current.requirementId === requirementId
          ? { ...current, requirement, loading: false }
          : current,
      )
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        return
      }
      setModal((current) =>
        current?.type === 'edit' && current.requirementId === requirementId
          ? { ...current, error: error.message, loading: false }
          : current,
      )
    }
  }, [])

  const openConfirm = (requirement) => {
    setFeedback(null)
    setConfirmError(null)
    setModal({ type: 'confirm', requirement })
  }

  const afterWrite = useCallback(async () => {
    await reload()
  }, [reload])

  const handleFormSubmit = async (payload) => {
    if (!modal) {
      return
    }

    const isEdit = modal.type === 'edit'
    const requirementId = modal.requirement?.id
    setFormSubmitting(true)
    setFormErrors(NO_FORM_ERRORS)

    try {
      if (isEdit) {
        await staffingRequirementService.update(requirementId, payload)
        setFeedback({
          type: 'success',
          message: `Requirement #${requirementId} was updated successfully.`,
        })
      } else {
        await staffingRequirementService.create(payload)
        setFeedback({
          type: 'success',
          message: 'Staffing requirement was added successfully.',
        })
      }
      closeModal()
      await afterWrite()
    } catch (error) {
      setFormErrors(mapStaffingRequirementServerErrors(error))
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDelete = async () => {
    const requirement = modal?.requirement
    if (!requirement) {
      return
    }

    setDeletingId(requirement.id)
    setConfirmError(null)

    try {
      await staffingRequirementService.remove(requirement.id)
      closeModal()
      setFeedback({
        type: 'success',
        message: `Requirement #${requirement.id} was deleted.`,
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
    await Promise.all([reload(), reloadBrands(), reloadProcesses()])
  }

  return (
    <div className="page-stack">
      <div className="page-heading page-heading--split">
        <div>
          <h2>Staffing Requirements</h2>
          <p>Set required employee counts for brand and process date ranges.</p>
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
            Add Staffing Requirement
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
            <h3>Could not load staffing requirements</h3>
            <p>{listError}</p>
          </div>
          <button type="button" className="button-secondary" onClick={handleRefresh}>
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
            <h3>Could not load form options</h3>
            <p>{optionsError}</p>
          </div>
          <button type="button" className="button-secondary" onClick={retryOptions}>
            Retry
          </button>
        </div>
      )}

      <div className="employee-stats">
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <ClipboardList size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : allRequirements.length}</span>
          <span className="stat-label">Total requirements</span>
          <span className="stat-note">All recorded ranges</span>
        </div>
        <div className="card stat-card">
          <span className="stat-icon" aria-hidden="true">
            <Users size={20} strokeWidth={1.9} />
          </span>
          <span className="stat-value">{loading ? '—' : totalRequiredEmployees}</span>
          <span className="stat-label">Employees requested</span>
          <span className="stat-note">Sum of required counts</span>
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

      <section className="card employee-panel" aria-label="Staffing requirement directory">
        <div className="employee-toolbar">
          <div className="search-field">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search brand, process, date or notes"
              aria-label="Search staffing requirements"
            />
          </div>
          <span className="result-count">
            Showing {filteredRequirements.length} of {allRequirements.length} requirements
          </span>
        </div>

        <StaffingRequirementTable
          requirements={filteredRequirements}
          loading={loading}
          describeBrand={lookups.describeBrand}
          describeProcess={lookups.describeProcess}
          deletingId={deletingId}
          onEdit={openRecord}
          onDelete={openConfirm}
        />
      </section>

      {modal?.type === 'add' && (
        <Modal
          title="Add staffing requirement"
          subtitle="Define how many employees a brand and process need."
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          <StaffingRequirementForm
            initialValues={emptyStaffingRequirementForm()}
            brands={brands}
            processes={processes}
            optionsLoading={optionsLoading}
            optionsError={optionsError}
            onRetryOptions={retryOptions}
            requirements={allRequirements}
            serverErrors={formErrors}
            submitting={formSubmitting}
            onSubmit={handleFormSubmit}
            onCancel={closeModal}
          />
        </Modal>
      )}

      {modal?.type === 'edit' && (
        <Modal
          title="Edit staffing requirement"
          subtitle={
            modal.requirement
              ? `Requirement #${modal.requirement.id}`
              : 'Loading staffing requirement'
          }
          onClose={closeModal}
          closeDisabled={formSubmitting}
        >
          {modal.loading ? (
            <ModalLoading label="Loading staffing requirement…" />
          ) : modal.error ? (
            <ModalError message={modal.error} />
          ) : modal.requirement ? (
            <StaffingRequirementForm
              key={modal.requirement.id}
              initialValues={staffingRequirementToForm(modal.requirement)}
              brands={brands}
              processes={processes}
              optionsLoading={optionsLoading}
              optionsError={optionsError}
              onRetryOptions={retryOptions}
              requirements={allRequirements}
              serverErrors={formErrors}
              submitting={formSubmitting}
              onSubmit={handleFormSubmit}
              onCancel={closeModal}
            />
          ) : null}
        </Modal>
      )}

      {modal?.type === 'confirm' && (
        <Modal
          title="Delete staffing requirement"
          subtitle="This action cannot be undone."
          onClose={closeModal}
          closeDisabled={deletingId === modal.requirement.id}
          size="small"
        >
          <p>
            Are you sure you want to delete requirement{' '}
            <strong>#{modal.requirement.id}</strong>?
          </p>
          <p className="text-muted">
            {lookups.describeBrand(modal.requirement.brand_id)} ·{' '}
            {lookups.describeProcess(modal.requirement.process_id)} ·{' '}
            {formatDateRange(
              modal.requirement.start_date,
              modal.requirement.end_date,
            )}
          </p>
          {confirmError && <ModalError message={confirmError} />}
          <div className="modal-actions">
            <button
              type="button"
              className="button-secondary"
              onClick={closeModal}
              disabled={deletingId === modal.requirement.id}
            >
              Cancel
            </button>
            <button
              type="button"
              className="button-danger"
              onClick={handleDelete}
              disabled={deletingId === modal.requirement.id}
            >
              {deletingId === modal.requirement.id && (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              )}
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
