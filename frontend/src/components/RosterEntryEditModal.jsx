import { AlertCircle, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import FormField from './FormField'
import Modal from './Modal'

function initialValues(entry) {
  return {
    employee_id: entry.employee_id,
    brand_id: entry.brand_id,
    process_id: entry.process_id,
    roster_date: entry.roster_date,
    shift_details: entry.shift_details ?? '',
  }
}

function RosterEntryEditModal({
  entry,
  employees,
  brands,
  processes,
  saving = false,
  onSave,
  onClose,
}) {
  const [values, setValues] = useState(() => initialValues(entry))
  const [error, setError] = useState(null)

  const handleChange = (event) => {
    const { name, value } = event.target
    setValues((current) => ({ ...current, [name]: value }))
    setError(null)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (
      !values.employee_id ||
      !values.brand_id ||
      !values.process_id ||
      !values.roster_date
    ) {
      setError('Employee, brand, process and date are required.')
      return
    }

    setError(null)
    try {
      await onSave({
        employee_id: Number(values.employee_id),
        brand_id: Number(values.brand_id),
        process_id: Number(values.process_id),
        roster_date: values.roster_date,
        shift_details: values.shift_details || null,
        roster_id: entry.roster_id,
      })
    } catch (saveError) {
      setError(saveError?.message ?? 'The roster entry could not be updated.')
    }
  }

  return (
    <Modal
      title="Edit Roster Entry"
      subtitle={`Entry #${entry.id} · ${entry.employee_name} · ${entry.roster_date}`}
      onClose={onClose}
      closeDisabled={saving}
      size="medium"
    >
      {error && (
        <div className="form-alert" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>We could not save this edit.</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      <form className="employee-form" onSubmit={handleSubmit} noValidate>
        <div className="form-grid">
          <FormField label="Employee" name="employee_id" required>
            <select
              id="employee_id"
              name="employee_id"
              value={values.employee_id}
              onChange={handleChange}
              disabled={saving}
            >
              <option value="">Select an employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.full_name} ({employee.employee_code})
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Brand" name="brand_id" required>
            <select
              id="brand_id"
              name="brand_id"
              value={values.brand_id}
              onChange={handleChange}
              disabled={saving}
            >
              <option value="">Select a brand</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.brand_name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Process" name="process_id" required>
            <select
              id="process_id"
              name="process_id"
              value={values.process_id}
              onChange={handleChange}
              disabled={saving}
            >
              <option value="">Select a process</option>
              {processes.map((process) => (
                <option key={process.id} value={process.id}>
                  {process.process_name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Date" name="roster_date" required>
            <input
              type="date"
              id="roster_date"
              name="roster_date"
              value={values.roster_date}
              onChange={handleChange}
              disabled={saving}
            />
          </FormField>

          <FormField label="Shift Details" name="shift_details">
            <input
              type="text"
              id="shift_details"
              name="shift_details"
              maxLength={100}
              value={values.shift_details}
              onChange={handleChange}
              placeholder="e.g. 09:00 - 18:00"
              disabled={saving}
            />
          </FormField>
        </div>

        <p className="form-hint">
          The employee must be active, assigned to the chosen brand and process,
          and available on the selected date. Invalid edits are rejected without
          changing the roster.
        </p>

        <div className="modal-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving && (
              <LoaderCircle className="spin" size={16} aria-hidden="true" />
            )}
            {saving ? 'Saving…' : 'Save entry'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default RosterEntryEditModal
