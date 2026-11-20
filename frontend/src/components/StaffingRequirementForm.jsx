import { useState } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import FormField from './FormField'
import {
  buildStaffingRequirementPayload,
  validateStaffingRequirement,
} from '../utils/staffingRequirementValidation'

const NO_ERRORS = { fieldErrors: {}, generalErrors: [] }

function StaffingRequirementForm({
  initialValues,
  brands,
  processes,
  optionsLoading,
  optionsError,
  onRetryOptions,
  requirements,
  serverErrors = NO_ERRORS,
  submitting = false,
  onSubmit,
  onCancel,
}) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})

  const handleChange = (event) => {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const validationErrors = validateStaffingRequirement(
      values,
      {
        brands: new Set(brands.map((brand) => brand.id)),
        processes: new Set(processes.map((process) => process.id)),
      },
      requirements,
      values.id ?? null,
    )
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length) {
      return
    }

    onSubmit(buildStaffingRequirementPayload(values))
  }

  const errorFor = (name) => errors[name] || serverErrors.fieldErrors?.[name]
  const generalErrors = serverErrors.generalErrors ?? []

  return (
    <form className="employee-form" onSubmit={handleSubmit} noValidate>
      {generalErrors.length > 0 && (
        <div className="form-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>We could not save this staffing requirement.</strong>
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
        <FormField label="Brand" name="brand_id" required error={errorFor('brand_id')}>
          <select
            id="brand_id"
            name="brand_id"
            value={values.brand_id}
            onChange={handleChange}
            disabled={submitting || optionsLoading}
            aria-invalid={Boolean(errorFor('brand_id'))}
            aria-describedby={errorFor('brand_id') ? 'brand_id-error' : undefined}
          >
            <option value="">Select a brand</option>
            {optionsLoading ? (
              <option value="" disabled>
                Loading brands…
              </option>
            ) : (
              brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.brand_name}
                </option>
              ))
            )}
          </select>
        </FormField>

        <FormField
          label="Process"
          name="process_id"
          required
          error={errorFor('process_id')}
        >
          <select
            id="process_id"
            name="process_id"
            value={values.process_id}
            onChange={handleChange}
            disabled={submitting || optionsLoading}
            aria-invalid={Boolean(errorFor('process_id'))}
            aria-describedby={errorFor('process_id') ? 'process_id-error' : undefined}
          >
            <option value="">Select a process</option>
            {optionsLoading ? (
              <option value="" disabled>
                Loading processes…
              </option>
            ) : (
              processes.map((process) => (
                <option key={process.id} value={process.id}>
                  {process.process_name}
                </option>
              ))
            )}
          </select>
        </FormField>

        <FormField
          label="Start Date"
          name="start_date"
          required
          error={errorFor('start_date')}
        >
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

        <FormField label="End Date" name="end_date" error={errorFor('end_date')}>
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

        <FormField
          label="Required Employees"
          name="required_count"
          required
          error={errorFor('required_count')}
        >
          <input
            id="required_count"
            name="required_count"
            type="number"
            min="1"
            step="1"
            value={values.required_count}
            onChange={handleChange}
            placeholder="e.g. 4"
            disabled={submitting}
            aria-invalid={Boolean(errorFor('required_count'))}
            aria-describedby={
              errorFor('required_count') ? 'required_count-error' : undefined
            }
          />
        </FormField>

        <div className="form-field--wide">
          <FormField label="Notes" name="notes" error={errorFor('notes')}>
            <textarea
              id="notes"
              name="notes"
              value={values.notes}
              onChange={handleChange}
              rows={3}
              placeholder="Optional context for this requirement"
              disabled={submitting}
              aria-invalid={Boolean(errorFor('notes'))}
              aria-describedby={errorFor('notes') ? 'notes-error' : undefined}
            />
          </FormField>
        </div>
      </div>

      <p className="form-hint">
        Leave End Date blank for a single-day requirement. Ranges for the same
        brand and process cannot overlap.
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
          {submitting ? 'Saving…' : 'Save requirement'}
        </button>
      </div>
    </form>
  )
}

export default StaffingRequirementForm
