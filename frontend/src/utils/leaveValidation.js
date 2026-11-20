import { mapApiErrors } from './apiErrorMapping'

// Mirrors backend/app/schemas/leave.py and routes/leave.py.
export const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected']
export const LEAVE_TYPE_MAX_LENGTH = 50

const LEAVE_FIELDS = [
  'employee_id',
  'start_date',
  'end_date',
  'leave_type',
  'reason',
  'status',
]

export function emptyLeaveForm() {
  return {
    employee_id: '',
    start_date: '',
    end_date: '',
    leave_type: '',
    reason: '',
    status: 'Pending',
  }
}

export function leaveToForm(leave) {
  return {
    employee_id: String(leave.employee_id),
    start_date: leave.start_date ?? '',
    end_date: leave.end_date ?? '',
    leave_type: leave.leave_type ?? '',
    reason: leave.reason ?? '',
    status: leave.status ?? 'Pending',
  }
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart <= bEnd && aEnd >= bStart
}

export function validateLeave(values, validEmployeeIds, leaves, excludeId = null) {
  const errors = {}

  const employeeId = String(values.employee_id ?? '').trim()
  if (!employeeId) {
    errors.employee_id = 'Employee is required.'
  } else if (!validEmployeeIds.has(Number(employeeId))) {
    errors.employee_id = 'Select a valid employee from the list.'
  }

  const startDate = values.start_date ?? ''
  const endDate = values.end_date ?? ''

  if (!startDate) {
    errors.start_date = 'Start date is required.'
  }
  if (!endDate) {
    errors.end_date = 'End date is required.'
  }
  if (startDate && endDate && endDate < startDate) {
    errors.end_date = 'End date cannot be earlier than start date.'
  }

  const leaveType = (values.leave_type ?? '').trim()
  if (!leaveType) {
    errors.leave_type = 'Leave type is required.'
  } else if (leaveType.length > LEAVE_TYPE_MAX_LENGTH) {
    errors.leave_type = `Leave type must be ${LEAVE_TYPE_MAX_LENGTH} characters or fewer.`
  }

  if (!LEAVE_STATUSES.includes(values.status)) {
    errors.status = 'Select a valid leave status.'
  }

  if (!errors.employee_id && !errors.start_date && !errors.end_date) {
    const conflict = leaves.find(
      (leave) =>
        leave.id !== excludeId &&
        Number(leave.employee_id) === Number(employeeId) &&
        overlaps(startDate, endDate, leave.start_date, leave.end_date),
    )
    if (conflict) {
      errors.start_date =
        'This date range overlaps an existing leave for this employee.'
    }
  }

  return errors
}

export function buildLeavePayload(values) {
  return {
    employee_id: Number(values.employee_id),
    start_date: values.start_date,
    end_date: values.end_date,
    leave_type: (values.leave_type ?? '').trim(),
    reason: (values.reason ?? '').trim() || null,
    status: values.status,
  }
}

export function mapLeaveServerErrors(error) {
  return mapApiErrors(error, LEAVE_FIELDS, (message) => {
    if (message.includes('end_date')) {
      return 'end_date'
    }
    if (/overlap/i.test(message)) {
      return 'start_date'
    }
    if (message.includes('employee_id') || /employee not found/i.test(message)) {
      return 'employee_id'
    }
    if (message.includes('leave_type')) {
      return 'leave_type'
    }
    if (message.includes('status')) {
      return 'status'
    }
    return null
  })
}
