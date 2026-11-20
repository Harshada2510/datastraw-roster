import { useMemo, useState } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import FormField from './FormField'
import {
  buildWeeklyOffPayload,
  DAYS_OF_WEEK,
  validateWeeklyOff,
} from '../utils/weeklyOffValidation'

const NO_ERRORS = { fieldErrors: {}, generalErrors: [] }

function WeeklyOffForm({
  initialValues,
  employees,
  optionsLoading,
  optionsError,
  onRetryOptions,
  records,
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
    const validationErrors = validateWeeklyOff(
      values,
      validEmployeeIds,
      records,
      values.id ?? null,
    )
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length) {
      return
    }

    onSubmit(buildWeeklyOffPayload(values))
  }

  const errorFor = (name) => errors[name] || serverErrors.fieldErrors?.[name]
  const generalErrors = serverErrors.generalErrors ?? []

  return (
    <form className="employee-form" onSubmit={handleSubmit} noValidate>
      {generalErrors.length > 0 && (
        <div className="form-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>We could not save this weekly off.</strong>
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

        <FormField label="Day of Week" name="day_of_week" required error={errorFor('day_of_week')}>
          <select
            id="day_of_week"
            name="day_of_week"
            value={values.day_of_week}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={Boolean(errorFor('day_of_week'))}
            aria-describedby={errorFor('day_of_week') ? 'day_of_week-error' : undefined}
          >
            <option value="">Select a day</option>
            {DAYS_OF_WEEK.map((day) => (
              <option key={day} value={day}>{day}</option>
            ))}
          </select>
        </FormField>
      </div>

      <p className="form-hint">
        An employee can only have one weekly off per day of the week.
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
          {submitting ? 'Saving…' : 'Save weekly off'}
        </button>
      </div>
    </form>
  )
}

export default WeeklyOffForm
