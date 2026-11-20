import { mapApiErrors } from './apiErrorMapping'
import { NAME_MAX_LENGTH } from './namedResourceValidation'

// Mirrors backend/app/schemas/holiday.py and routes/holiday.py.
const HOLIDAY_FIELDS = ['holiday_name', 'holiday_date', 'description']

export function emptyHolidayForm() {
  return { holiday_name: '', holiday_date: '', description: '' }
}

export function holidayToForm(holiday) {
  return {
    holiday_name: holiday.holiday_name ?? '',
    holiday_date: holiday.holiday_date ?? '',
    description: holiday.description ?? '',
  }
}

export function validateHoliday(values, holidays, excludeId = null) {
  const errors = {}

  const name = (values.holiday_name ?? '').trim()
  if (!name) {
    errors.holiday_name = 'Holiday name is required.'
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.holiday_name = `Holiday name must be ${NAME_MAX_LENGTH} characters or fewer.`
  }

  const date = values.holiday_date ?? ''
  if (!date) {
    errors.holiday_date = 'Holiday date is required.'
  }

  if (date) {
    const duplicate = holidays.find(
      (holiday) => holiday.id !== excludeId && holiday.holiday_date === date,
    )
    if (duplicate) {
      errors.holiday_date = 'A holiday already exists on this date.'
    }
  }

  return errors
}

export function buildHolidayPayload(values) {
  return {
    holiday_name: (values.holiday_name ?? '').trim(),
    holiday_date: values.holiday_date,
    description: (values.description ?? '').trim() || null,
  }
}

export function mapHolidayServerErrors(error) {
  return mapApiErrors(error, HOLIDAY_FIELDS, (message) => {
    if (message.includes('holiday_name')) {
      return 'holiday_name'
    }
    if (message.includes('holiday_date') || /already exists on this date/i.test(message)) {
      return 'holiday_date'
    }
    return null
  })
}
