import { mapApiErrors } from './apiErrorMapping'

const ASSIGNMENT_FIELDS = ['employee_id', 'brand_id', 'process_id']

export function emptyAssignmentForm() {
  return { employee_id: '', brand_id: '', process_id: '' }
}

export function assignmentToForm(assignment) {
  return {
    employee_id: String(assignment.employee_id),
    brand_id: String(assignment.brand_id),
    process_id: String(assignment.process_id),
  }
}

function sameCombination(assignment, values) {
  return (
    Number(assignment.employee_id) === Number(values.employee_id) &&
    Number(assignment.brand_id) === Number(values.brand_id) &&
    Number(assignment.process_id) === Number(values.process_id)
  )
}

// `optionIds` holds Sets of ids fetched from the live APIs. `assignments` is
// the current list (or the employee-filtered list) used for duplicate checks.
export function validateAssignment(values, optionIds, assignments, excludeId = null) {
  const errors = {}

  const fields = [
    ['employee_id', 'employee', 'Employee'],
    ['brand_id', 'brand', 'Brand'],
    ['process_id', 'process', 'Process'],
  ]

  fields.forEach(([field, setKey, label]) => {
    const value = String(values[field] ?? '').trim()
    if (!value) {
      errors[field] = `${label} is required.`
    } else if (!optionIds[setKey].has(Number(value))) {
      errors[field] = `Select a valid ${label.toLowerCase()} from the list.`
    }
  })

  if (!Object.keys(errors).length) {
    const duplicate = assignments.find(
      (item) =>
        item.id !== excludeId && sameCombination(item, values),
    )
    if (duplicate) {
      errors.employee_id =
        'This employee is already assigned to that brand and process.'
    }
  }

  return errors
}

export function buildAssignmentPayload(values) {
  return {
    employee_id: Number(values.employee_id),
    brand_id: Number(values.brand_id),
    process_id: Number(values.process_id),
  }
}

export function mapAssignmentServerErrors(error) {
  return mapApiErrors(error, ASSIGNMENT_FIELDS, (message) => {
    if (message.includes('employee_id')) {
      return 'employee_id'
    }
    if (message.includes('brand_id')) {
      return 'brand_id'
    }
    if (message.includes('process_id')) {
      return 'process_id'
    }
    return null
  })
}
