import { useState } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import { NAME_MAX_LENGTH } from '../utils/namedResourceValidation'

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

// Shared add/edit form for brand and process records.
function NamedResourceForm({
  initialValues,
  validation,
  nameField,
  nameLabel,
  resourceLabel,
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
    const validationErrors = validation.validate(values)
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length) {
      return
    }

    onSubmit(validation.buildPayload(values))
  }

  const fieldError = (name) => errors[name] || serverErrors.fieldErrors?.[name]
  const generalErrors = serverErrors.generalErrors ?? []

  return (
    <form className="employee-form" onSubmit={handleSubmit} noValidate>
      {generalErrors.length > 0 && (
        <div className="form-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>We could not save this {resourceLabel}.</strong>
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
          label={nameLabel}
          name={nameField}
          required
          error={fieldError(nameField)}
        >
          <input
            id={nameField}
            name={nameField}
            type="text"
            value={values[nameField]}
            onChange={handleChange}
            maxLength={NAME_MAX_LENGTH}
            autoComplete="off"
            disabled={submitting}
            aria-invalid={Boolean(fieldError(nameField))}
            aria-describedby={
              fieldError(nameField) ? `${nameField}-error` : undefined
            }
          />
        </Field>

        <Field label="Description" name="description" error={fieldError('description')}>
          <textarea
            id="description"
            name="description"
            value={values.description}
            onChange={handleChange}
            rows={3}
            placeholder={`Optional details about this ${resourceLabel}`}
            disabled={submitting}
            aria-invalid={Boolean(fieldError('description'))}
            aria-describedby={
              fieldError('description') ? 'description-error' : undefined
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
          <span>Active {resourceLabel}</span>
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
              : `Add ${resourceLabel}`}
        </button>
      </div>
    </form>
  )
}

export default NamedResourceForm
