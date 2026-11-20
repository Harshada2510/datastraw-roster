import { requestJson } from './apiClient'

const EMPLOYEES_PATH = '/api/employees'
const COLLECTION_LABEL = 'Employees'
const RECORD_LABEL = 'Employee'

export function getEmployees(options) {
  return requestJson(EMPLOYEES_PATH, {
    ...options,
    label: COLLECTION_LABEL,
  })
}

export function getEmployee(employeeId, options) {
  return requestJson(`${EMPLOYEES_PATH}/${employeeId}`, {
    ...options,
    label: RECORD_LABEL,
  })
}

export function createEmployee(payload, options) {
  return requestJson(EMPLOYEES_PATH, {
    ...options,
    method: 'POST',
    body: payload,
    label: RECORD_LABEL,
  })
}

export function updateEmployee(employeeId, payload, options) {
  return requestJson(`${EMPLOYEES_PATH}/${employeeId}`, {
    ...options,
    method: 'PUT',
    body: payload,
    label: RECORD_LABEL,
  })
}

// The backend soft-deletes: this sets is_active to false.
export function deactivateEmployee(employeeId, options) {
  return requestJson(`${EMPLOYEES_PATH}/${employeeId}`, {
    ...options,
    method: 'DELETE',
    label: RECORD_LABEL,
  })
}
