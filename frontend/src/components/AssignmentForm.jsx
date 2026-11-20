import { useMemo, useState } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import {
  buildAssignmentPayload,
  validateAssignment,
} from '../utils/assignmentValidation'

const NO_ERRORS = { fieldErrors: {}, generalErrors: [] }

function Field({ label, name, error, children }) {
  return (
    <label className="form-field" htmlFor={name}>
      <span className="form-label">
        {label}
        <span className="required-mark"> *</span>
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

function SelectField({
  name,
  label,
  value,
  placeholder,
  options,
  loading,
  error,
  onChange,
  disabled,
}) {
  return (
    <Field label={label} name={name} error={error}>
      <select
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        disabled={disabled || loading}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${name}-error` : undefined}
      >
        <option value="">{placeholder}</option>
        {loading ? (
          <option value="" disabled>
            Loading options…
          </option>
        ) : (
          options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))
        )}
      </select>
    </Field>
  )
}

// Add/edit form for an employee-brand-process assignment. All three dropdowns
// are populated from the live employee, brand and process APIs.
function AssignmentForm({
  initialValues,
  employees,
  brands,
  processes,
  optionsLoading,
  optionsError,
  onRetryOptions,
  assignments,
  serverErrors = NO_ERRORS,
  submitting = false,
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})

  const optionIds = useMemo(
    () => ({
      employee: new Set(employees.map((item) => item.id)),
      brand: new Set(brands.map((item) => item.id)),
      process: new Set(processes.map((item) => item.id)),
    }),
    [employees, brands, processes],
  )

  const employeeOptions = useMemo(
    () =>
      employees.map((employee) => ({
        id: employee.id,
        label: `${employee.full_name} (${employee.employee_code})`,
      })),
    [employees],
  )
  const brandOptions = useMemo(
    () => brands.map((brand) => ({ id: brand.id, label: brand.brand_name })),
    [brands],
  )
  const processOptions = useMemo(
    () =>
      processes.map((process) => ({
        id: process.id,
        label: process.process_name,
      })),
    [processes],
  )

  const handleChange = (event) => {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const validationErrors = validateAssignment(
      values,
      optionIds,
      assignments,
      values.id ?? null,
    )
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length) {
      return
    }

    onSubmit(buildAssignmentPayload(values))
  }

  const errorFor = (name) => errors[name] || serverErrors.fieldErrors?.[name]
  const generalErrors = serverErrors.generalErrors ?? []

  return (
    <form className="employee-form" onSubmit={handleSubmit} noValidate>
      {generalErrors.length > 0 && (
        <div className="form-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>We could not save this assignment.</strong>
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
        <SelectField
          name="employee_id"
          label="Employee"
          value={values.employee_id}
          placeholder="Select an employee"
          options={employeeOptions}
          loading={optionsLoading}
          error={errorFor('employee_id')}
          onChange={handleChange}
          disabled={submitting}
        />
        <SelectField
          name="brand_id"
          label="Brand"
          value={values.brand_id}
          placeholder="Select a brand"
          options={brandOptions}
          loading={optionsLoading}
          error={errorFor('brand_id')}
          onChange={handleChange}
          disabled={submitting}
        />
        <SelectField
          name="process_id"
          label="Process"
          value={values.process_id}
          placeholder="Select a process"
          options={processOptions}
          loading={optionsLoading}
          error={errorFor('process_id')}
          onChange={handleChange}
          disabled={submitting}
        />
      </div>

      <p className="text-muted form-hint">
        An employee can hold multiple assignments, but the same employee, brand
        and process combination can only be used once.
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
          {submitting && (
            <LoaderCircle className="spin" size={16} aria-hidden="true" />
          )}
          {submitting ? 'Saving…' : 'Save assignment'}
        </button>
      </div>
    </form>
  )
}

export default AssignmentForm
