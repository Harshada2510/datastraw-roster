import { useMemo, useState } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import FormField from './FormField'
import {
  buildLeavePayload,
  LEAVE_STATUSES,
  LEAVE_TYPE_MAX_LENGTH,
  validateLeave,
} from '../utils/leaveValidation'

const NO_ERRORS = { fieldErrors: {}, generalErrors: [] }

function LeaveForm({
  initialValues,
  employees,
  optionsLoading,
  optionsError,
  onRetryOptions,
  leaves,
  serverErrors = NO_ERRORS,
  submitting = false,
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})

  const validEmployeeIds = useMemo(
    () => new Set(employees.map((employee) => employee.id)),
    [employees],
  )

  const handleChange = (event) => {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const validationErrors = validateLeave(
      values,
      validEmployeeIds,
      leaves,
      values.id ?? null,
    )
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length) {
      return
    }

    onSubmit(buildLeavePayload(values))
  }

  const errorFor = (name) => errors[name] || serverErrors.fieldErrors?.[name]
  const generalErrors = serverErrors.generalErrors ?? []

  return (
    <form className="employee-form" onSubmit={handleSubmit} noValidate>
      {generalErrors.length > 0 && (
        <div className="form-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>We could not save this leave request.</strong>
            <ul>
              {generalErrors.map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {optionsError && (
        <div className="form-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <span>{optionsError}</span>{' '}
            <button
              type="button"
              className="text-button"
              onClick={onRetryOptions}
              disabled={submitting}
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <div className="form-grid">
        <FormField label="Employee" name="employee_id" required error={errorFor('employee_id')}>
          <select
            id="employee_id"
            name="employee_id"
            value={values.employee_id}
            onChange={handleChange}
            disabled={submitting || optionsLoading}
            aria-invalid={Boolean(errorFor('employee_id'))}
            aria-describedby={errorFor('employee_id') ? 'employee_id-error' : undefined}
          >
            <option value="">Select an employee</option>
            {optionsLoading ? (
              <option value="" disabled>Loading employees…</option>
            ) : (
              employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} ({employee.employee_code})
                </option>
              ))
            )}
          </select>
        </FormField>

        <FormField label="Leave Type" name="leave_type" required error={errorFor('leave_type')}>
          <input
            id="leave_type"
            name="leave_type"
            type="text"
            value={values.leave_type}
            onChange={handleChange}
            maxLength={LEAVE_TYPE_MAX_LENGTH}
            placeholder="e.g. Casual Leave"
            autoComplete="off"
            disabled={submitting}
            aria-invalid={Boolean(errorFor('leave_type'))}
            aria-describedby={errorFor('leave_type') ? 'leave_type-error' : undefined}
          />
        </FormField>

        <FormField label="Start Date" name="start_date" required error={errorFor('start_date')}>
          <input
            id="start_date"
            name="start_date"
            type="date"
            value={values.start_date}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={Boolean(errorFor('start_date'))}
            aria-describedby={errorFor('start_date') ? 'start_date-error' : undefined}
          />
        </FormField>

        <FormField label="End Date" name="end_date" required error={errorFor('end_date')}>
          <input
            id="end_date"
            name="end_date"
            type="date"
            value={values.end_date}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={Boolean(errorFor('end_date'))}
            aria-describedby={errorFor('end_date') ? 'end_date-error' : undefined}
          />
        </FormField>

        <FormField label="Status" name="status" error={errorFor('status')}>
          <select
            id="status"
            name="status"
            value={values.status}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={Boolean(errorFor('status'))}
            aria-describedby={errorFor('status') ? 'status-error' : undefined}
          >
            {LEAVE_STATUSES.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </FormField>

        <FormField label="Reason" name="reason" error={errorFor('reason')}>
          <textarea
            id="reason"
            name="reason"
            value={values.reason}
            onChange={handleChange}
            rows={3}
            placeholder="Optional reason for this leave"
            disabled={submitting}
            aria-invalid={Boolean(errorFor('reason'))}
            aria-describedby={errorFor('reason') ? 'reason-error' : undefined}
          />
        </FormField>
      </div>

      <p className="form-hint">
        A leave range cannot overlap another leave for the same employee.
      </p>

      <div className="modal-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button type="submit" className="button-primary" disabled={submitting}>
          {submitting && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
          {submitting ? 'Saving…' : 'Save leave request'}
        </button>
      </div>
    </form>
  )
}

export default LeaveForm
