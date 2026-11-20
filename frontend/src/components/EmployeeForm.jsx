import { useState } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import {
  EMPLOYEE_LIMITS,
  buildEmployeePayload,
  validateEmployee,
} from '../utils/employeeValidation'

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

function EmployeeForm({
  initialValues,
  mode = 'add',
  serverErrors = NO_ERRORS,
  submitting = false,
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})

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
    const validationErrors = validateEmployee(values)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length) {
      return
    }

    onSubmit(buildEmployeePayload(values))
  }

  const fieldError = (name) => errors[name] || serverErrors.fieldErrors?.[name]
  const generalErrors = serverErrors.generalErrors ?? []

  return (
    <form className="employee-form" onSubmit={handleSubmit} noValidate>
      {generalErrors.length > 0 && (
        <div className="form-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>We could not save this employee.</strong>
            <ul>
              {generalErrors.map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="form-grid">
        <Field
          label="Employee code"
          name="employee_code"
          required
          error={fieldError('employee_code')}
        >
          <input
            id="employee_code"
            name="employee_code"
            type="text"
            value={values.employee_code}
            onChange={handleChange}
            maxLength={EMPLOYEE_LIMITS.employee_code}
            autoComplete="off"
            disabled={submitting}
            aria-invalid={Boolean(fieldError('employee_code'))}
            aria-describedby={
              fieldError('employee_code') ? 'employee_code-error' : undefined
            }
          />
        </Field>

        <Field
          label="Full name"
          name="full_name"
          required
          error={fieldError('full_name')}
        >
          <input
            id="full_name"
            name="full_name"
            type="text"
            value={values.full_name}
            onChange={handleChange}
            maxLength={EMPLOYEE_LIMITS.full_name}
            autoComplete="name"
            disabled={submitting}
            aria-invalid={Boolean(fieldError('full_name'))}
            aria-describedby={
              fieldError('full_name') ? 'full_name-error' : undefined
            }
          />
        </Field>

        <Field label="Email" name="email" error={fieldError('email')}>
          <input
            id="email"
            name="email"
            type="email"
            value={values.email}
            onChange={handleChange}
            maxLength={EMPLOYEE_LIMITS.email}
            autoComplete="email"
            placeholder="name@example.com"
            disabled={submitting}
            aria-invalid={Boolean(fieldError('email'))}
            aria-describedby={fieldError('email') ? 'email-error' : undefined}
          />
        </Field>

        <Field label="Phone" name="phone" error={fieldError('phone')}>
          <input
            id="phone"
            name="phone"
            type="tel"
            value={values.phone}
            onChange={handleChange}
            maxLength={EMPLOYEE_LIMITS.phone}
            autoComplete="tel"
            disabled={submitting}
            aria-invalid={Boolean(fieldError('phone'))}
            aria-describedby={fieldError('phone') ? 'phone-error' : undefined}
          />
        </Field>

        <Field
          label="Designation"
          name="designation"
          error={fieldError('designation')}
        >
          <input
            id="designation"
            name="designation"
            type="text"
            value={values.designation}
            onChange={handleChange}
            maxLength={EMPLOYEE_LIMITS.designation}
            autoComplete="organization-title"
            disabled={submitting}
            aria-invalid={Boolean(fieldError('designation'))}
            aria-describedby={
              fieldError('designation') ? 'designation-error' : undefined
            }
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
          <span>Active employee</span>
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
          {submitting
            ? 'Saving…'
            : mode === 'edit'
              ? 'Save changes'
              : 'Add employee'}
        </button>
      </div>
    </form>
  )
}

export default EmployeeForm
