import { useState } from 'react'
import { AlertCircle, LoaderCircle } from 'lucide-react'
import FormField from './FormField'
import { NAME_MAX_LENGTH } from '../utils/namedResourceValidation'
import {
  buildHolidayPayload,
  validateHoliday,
} from '../utils/holidayValidation'

const NO_ERRORS = { fieldErrors: {}, generalErrors: [] }

function HolidayForm({
  initialValues,
  holidays,
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
    const validationErrors = validateHoliday(
      values,
      holidays,
      values.id ?? null,
    )
    setErrors(validationErrors)

    if (Object.keys(validationErrors).length) {
      return
    }

    onSubmit(buildHolidayPayload(values))
  }

  const errorFor = (name) => errors[name] || serverErrors.fieldErrors?.[name]
  const generalErrors = serverErrors.generalErrors ?? []

  return (
    <form className="employee-form" onSubmit={handleSubmit} noValidate>
      {generalErrors.length > 0 && (
        <div className="form-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>We could not save this holiday.</strong>
            <ul>
              {generalErrors.map((message, index) => (
                <li key={`${message}-${index}`}>{message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="form-grid">
        <FormField label="Holiday Name" name="holiday_name" required error={errorFor('holiday_name')}>
          <input
            id="holiday_name"
            name="holiday_name"
            type="text"
            value={values.holiday_name}
            onChange={handleChange}
            maxLength={NAME_MAX_LENGTH}
            placeholder="e.g. Republic Day"
            autoComplete="off"
            disabled={submitting}
            aria-invalid={Boolean(errorFor('holiday_name'))}
            aria-describedby={errorFor('holiday_name') ? 'holiday_name-error' : undefined}
          />
        </FormField>

        <FormField label="Holiday Date" name="holiday_date" required error={errorFor('holiday_date')}>
          <input
            id="holiday_date"
            name="holiday_date"
            type="date"
            value={values.holiday_date}
            onChange={handleChange}
            disabled={submitting}
            aria-invalid={Boolean(errorFor('holiday_date'))}
            aria-describedby={errorFor('holiday_date') ? 'holiday_date-error' : undefined}
          />
        </FormField>

        <FormField label="Description" name="description" error={errorFor('description')}>
          <textarea
            id="description"
            name="description"
            value={values.description}
            onChange={handleChange}
            rows={3}
            placeholder="Optional details about this holiday"
            disabled={submitting}
            aria-invalid={Boolean(errorFor('description'))}
            aria-describedby={errorFor('description') ? 'description-error' : undefined}
          />
        </FormField>
      </div>

      <p className="form-hint">Each calendar date can only have one holiday.</p>

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
          {submitting ? 'Saving…' : 'Save holiday'}
        </button>
      </div>
    </form>
  )
}

export default HolidayForm
