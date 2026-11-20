import { mapApiErrors } from './apiErrorMapping'

// Mirrors backend/app/schemas/staffing_requirement.py and routes/staffing_requirement.py.
export const STAFFING_REQUIREMENT_FIELDS = [
  'brand_id',
  'process_id',
  'start_date',
  'end_date',
  'required_count',
  'notes',
]

export function emptyStaffingRequirementForm() {
  return {
    brand_id: '',
    process_id: '',
    start_date: '',
    end_date: '',
    required_count: '',
    notes: '',
  }
}

export function staffingRequirementToForm(requirement) {
  return {
    id: requirement.id,
    brand_id: String(requirement.brand_id),
    process_id: String(requirement.process_id),
    start_date: requirement.start_date ?? '',
    end_date: requirement.end_date ?? '',
    required_count: String(requirement.required_count),
    notes: requirement.notes ?? '',
  }
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && aEnd >= bStart
}

export function validateStaffingRequirement(
  values,
  validIds,
  requirements,
  excludeId = null,
) {
  const errors = {}

  const brandId = String(values.brand_id ?? '').trim()
  if (!brandId) {
    errors.brand_id = 'Brand is required.'
  } else if (!validIds.brands.has(Number(brandId))) {
    errors.brand_id = 'Select a valid brand from the list.'
  }

  const processId = String(values.process_id ?? '').trim()
  if (!processId) {
    errors.process_id = 'Process is required.'
  } else if (!validIds.processes.has(Number(processId))) {
    errors.process_id = 'Select a valid process from the list.'
  }

  const startDate = values.start_date ?? ''
  const endDate = values.end_date?.trim() ? values.end_date : startDate

  if (!startDate) {
    errors.start_date = 'Start date is required.'
  }
  if (values.end_date && !values.end_date.trim()) {
    errors.end_date = 'Enter a valid end date or leave this field blank.'
  }
  if (startDate && endDate && endDate < startDate) {
    errors.end_date = 'End date cannot be earlier than start date.'
  }

  const rawCount = String(values.required_count ?? '').trim()
  if (!rawCount) {
    errors.required_count = 'Required employees is required.'
  } else {
    const count = Number(rawCount)
    if (!Number.isInteger(count) || count < 1) {
      errors.required_count = 'Enter a whole number greater than 0.'
    }
  }

  if (
    !errors.brand_id &&
    !errors.process_id &&
    !errors.start_date &&
    !errors.end_date
  ) {
    const conflict = requirements.find(
      (requirement) =>
        requirement.id !== excludeId &&
        Number(requirement.brand_id) === Number(brandId) &&
        Number(requirement.process_id) === Number(processId) &&
        overlaps(
          startDate,
          endDate,
          requirement.start_date,
          requirement.end_date,
        ),
    )
    if (conflict) {
      errors.start_date =
        'This date range overlaps an existing requirement for this brand and process.'
    }
  }

  return errors
}

export function buildStaffingRequirementPayload(values) {
  return {
    brand_id: Number(values.brand_id),
    process_id: Number(values.process_id),
    start_date: values.start_date,
    end_date: values.end_date || values.start_date,
    required_count: Number(values.required_count),
    notes: (values.notes ?? '').trim() || null,
  }
}

export function mapStaffingRequirementServerErrors(error) {
  return mapApiErrors(
    error,
    STAFFING_REQUIREMENT_FIELDS,
    (message) => {
      if (message.includes('end_date') || /end date/i.test(message)) {
        return 'end_date'
      }
      if (/overlap/i.test(message)) {
        return 'start_date'
      }
      if (/brand/i.test(message)) {
        return 'brand_id'
      }
      if (/process/i.test(message)) {
        return 'process_id'
      }
      if (/required_count|required employees/i.test(message)) {
        return 'required_count'
      }
      return null
    },
  )
}
