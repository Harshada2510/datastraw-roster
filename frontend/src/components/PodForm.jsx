import { useMemo, useState } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import { NAME_MAX_LENGTH } from '../utils/namedResourceValidation'
import {
  buildPodPayload,
  validatePod,
} from '../utils/podValidation'

const NO_ERRORS = { fieldErrors: {}, generalErrors: [] }

function Field({ label, name, error, required = false, children }) {
  return (
    <label className="form-field" htmlFor={name}>
      <span className="form-label">
        {label}
        {required && <span className="required-mark"> *</span>}
      </span>
      {children}
      {error && (
        <span className="field-error" id={`${name}-error`} role="alert">
          {error}
        </span>
      )}
    </label>
  )
}

function PodForm({
  initialValues,
  employees,
  employeesLoading,
  employeesError,
  onRetryOptions,
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
    const { name, value, type, checked } = event.target
    setValues((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const validationErrors = validatePod(values, validEmployeeIds)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length) {
      return
    }

    onSubmit(buildPodPayload(values))
  }

  const fieldError = (name) => errors[name] || serverErrors.fieldErrors?.[name]
  const generalErrors = serverErrors.generalErrors ?? []

  return (
    <form className="employee-form" onSubmit={handleSubmit} noValidate>
      {generalErrors.length > 0 && (
        <div className="form-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>We could not save this pod.</strong>
            <ul>
              {generalErrors.map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="form-grid">
        <Field label="Pod Name" name="pod_name" required error={fieldError('pod_name')}>
          <input
            id="pod_name"
            name="pod_name"
            type="text"
            value={values.pod_name}
            onChange={handleChange}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="off"
            disabled={submitting}
            aria-invalid={Boolean(fieldError('pod_name'))}
            aria-describedby={fieldError('pod_name') ? 'pod_name-error' : undefined}
          />
        </Field>

        <Field label="Pod Lead" name="pod_lead_id" error={fieldError('pod_lead_id')}>
          <select
            id="pod_lead_id"
            name="pod_lead_id"
            value={values.pod_lead_id}
            onChange={handleChange}
            disabled={submitting || employeesLoading}
            aria-invalid={Boolean(fieldError('pod_lead_id'))}
            aria-describedby={fieldError('pod_lead_id') ? 'pod_lead_id-error' : undefined}
          >
            <option value="">No lead</option>
            {employeesLoading ? (
              <option value="" disabled>
                Loading employees…
              </option>
            ) : (
              employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} ({employee.employee_code})
                </option>
              ))
            )}
          </select>
          {employeesError && (
            <span className="field-error" role="alert">
              {employeesError}{' '}
              <button
                type="button"
                className="text-button"
                onClick={onRetryOptions}
                disabled={submitting}
              >
                Retry
              </button>
            </span>
          )}
        </Field>

        <Field label="Description" name="description" error={fieldError('description')}>
          <textarea
            id="description"
            name="description"
            value={values.description}
            onChange={handleChange}
            rows={3}
            placeholder="Optional details about this pod"
            disabled={submitting}
            aria-invalid={Boolean(fieldError('description'))}
            aria-describedby={fieldError('description') ? 'description-error' : undefined}
          />
        </Field>

        <label className="form-checkbox" htmlFor="is_active">
          <input
            id="is_active"
            name="is_active"
            type="checkbox"
            checked={values.is_active}
            onChange={handleChange}
            disabled={submitting}
          />
          <span>Active pod</span>
        </label>
      </div>

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
          {submitting && (
            <LoaderCircle className="spin" size={16} aria-hidden="true" />
          )}
          {submitting ? 'Saving…' : 'Save pod'}
        </button>
      </div>
    </form>
  )
}

export default PodForm
