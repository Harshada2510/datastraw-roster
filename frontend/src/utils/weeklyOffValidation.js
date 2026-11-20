import { mapApiErrors } from './apiErrorMapping'

// Mirrors backend/app/schemas/weekly_off.py and routes/weekly_off.py.
export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

const WEEKLY_OFF_FIELDS = ['employee_id', 'day_of_week']

export function emptyWeeklyOffForm() {
  return { employee_id: '', day_of_week: '' }
}

export function weeklyOffToForm(weeklyOff) {
  return {
    employee_id: String(weeklyOff.employee_id),
    day_of_week: weeklyOff.day_of_week ?? '',
  }
}

export function validateWeeklyOff(values, validEmployeeIds, records, excludeId = null) {
  const errors = {}

  const employeeId = String(values.employee_id ?? '').trim()
  if (!employeeId) {
    errors.employee_id = 'Employee is required.'
  } else if (!validEmployeeIds.has(Number(employeeId))) {
    errors.employee_id = 'Select a valid employee from the list.'
  }

  const day = String(values.day_of_week ?? '').trim()
  if (!day) {
    errors.day_of_week = 'Day of week is required.'
  } else if (!DAYS_OF_WEEK.some((candidate) => candidate.toLowerCase() === day.toLowerCase())) {
    errors.day_of_week = 'Select a valid day of week.'
  }

  if (!errors.employee_id && !errors.day_of_week) {
    const duplicate = records.find(
      (record) =>
        record.id !== excludeId &&
        Number(record.employee_id) === Number(employeeId) &&
        String(record.day_of_week).toLowerCase() === day.toLowerCase(),
    )
    if (duplicate) {
      errors.day_of_week = 'This employee already has a weekly off on that day.'
    }
  }

  return errors
}

export function buildWeeklyOffPayload(values) {
  return {
    employee_id: Number(values.employee_id),
    day_of_week: String(values.day_of_week ?? '').trim(),
  }
}

export function mapWeeklyOffServerErrors(error) {
  return mapApiErrors(error, WEEKLY_OFF_FIELDS, (message) => {
    if (message.includes('day_of_week') || /already has a weekly off/i.test(message)) {
      return 'day_of_week'
    }
    if (message.includes('employee_id') || /employee not found/i.test(message)) {
      return 'employee_id'
    }
    return null
  })
}
