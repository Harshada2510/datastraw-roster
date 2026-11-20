// Client-side rules mirror backend/app/schemas/employee.py.
export const EMPLOYEE_LIMITS = {
  employee_code: 50,
  full_name: 150,
  email: 255,
  phone: 30,
  designation: 100,
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const EMPLOYEE_FIELDS = [
  'employee_code',
  'full_name',
  'email',
  'phone',
  'designation',
  'is_active',
]

export function emptyEmployeeForm() {
  return {
    employee_code: '',
    full_name: '',
    email: '',
    phone: '',
    designation: '',
    is_active: true,
  }
}

export function employeeToForm(employee) {
  return {
    employee_code: employee.employee_code ?? '',
    full_name: employee.full_name ?? '',
    email: employee.email ?? '',
    phone: employee.phone ?? '',
    designation: employee.designation ?? '',
    is_active: employee.is_active ?? true,
  }
}

export function validateEmployee(values) {
  const errors = {}
  const code = (values.employee_code ?? '').trim()
  const name = (values.full_name ?? '').trim()
  const email = (values.email ?? '').trim()
  const phone = (values.phone ?? '').trim()
  const designation = (values.designation ?? '').trim()

  if (!code) {
    errors.employee_code = 'Employee code is required.'
  } else if (code.length > EMPLOYEE_LIMITS.employee_code) {
    errors.employee_code = `Employee code must be ${EMPLOYEE_LIMITS.employee_code} characters or fewer.`
  }

  if (!name) {
    errors.full_name = 'Full name is required.'
  } else if (name.length > EMPLOYEE_LIMITS.full_name) {
    errors.full_name = `Full name must be ${EMPLOYEE_LIMITS.full_name} characters or fewer.`
  }

  if (email) {
    if (email.length > EMPLOYEE_LIMITS.email) {
      errors.email = `Email must be ${EMPLOYEE_LIMITS.email} characters or fewer.`
    } else if (!EMAIL_PATTERN.test(email)) {
      errors.email = 'Enter a valid email address.'
    }
  }

  if (phone.length > EMPLOYEE_LIMITS.phone) {
    errors.phone = `Phone must be ${EMPLOYEE_LIMITS.phone} characters or fewer.`
  }

  if (designation.length > EMPLOYEE_LIMITS.designation) {
    errors.designation = `Designation must be ${EMPLOYEE_LIMITS.designation} characters or fewer.`
  }

  return errors
}

export function buildEmployeePayload(values) {
  return {
    employee_code: (values.employee_code ?? '').trim(),
    full_name: (values.full_name ?? '').trim(),
    email: (values.email ?? '').trim() || null,
    phone: (values.phone ?? '').trim() || null,
    designation: (values.designation ?? '').trim() || null,
    is_active: Boolean(values.is_active),
  }
}

/**
 * Converts a FastAPI 400/409/422 error into field errors plus general messages.
 * 422 details contain a `loc` array such as ["body", "employee_code"].
 */
export function mapServerErrors(error) {
  const fieldErrors = {}
  const generalErrors = []
  const details = error?.details

  const assignField = (field, message) => {
    if (EMPLOYEE_FIELDS.includes(field)) {
      fieldErrors[field] = message
    } else {
      generalErrors.push(message)
    }
  }

  if (Array.isArray(details)) {
    details.forEach((item) => {
      const message = item?.msg ?? 'Invalid value.'
      const field = Array.isArray(item?.loc)
        ? item.loc.filter((part) => part !== 'body').join('.')
        : ''
      assignField(field, message)
    })
  } else if (typeof details === 'string' && details.trim()) {
    const message = details.trim()
    // The uniqueness checks return a plain string; attach it to its field.
    if (/employee_code/i.test(message)) {
      fieldErrors.employee_code = message
    } else if (/email/i.test(message)) {
      fieldErrors.email = message
    } else {
      generalErrors.push(message)
    }
  }

  if (!Object.keys(fieldErrors).length && !generalErrors.length && error?.message) {
    generalErrors.push(error.message)
  }

  return { fieldErrors, generalErrors }
}
