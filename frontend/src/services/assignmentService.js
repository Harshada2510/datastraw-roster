import { requestJson } from './apiClient'

const ASSIGNMENTS_PATH = '/api/assignments'

export const assignmentService = {
  list: (options) =>
    requestJson(ASSIGNMENTS_PATH, { ...options, label: 'Assignments' }),

  get: (assignmentId, options) =>
    requestJson(`${ASSIGNMENTS_PATH}/${assignmentId}`, {
      ...options,
      label: 'Assignment',
    }),

  // Uses the existing per-employee endpoint for the employee filter.
  listForEmployee: (employeeId, options) =>
    requestJson(`/api/employees/${employeeId}/assignments`, {
      ...options,
      label: 'Employee assignments',
    }),

  create: (payload, options) =>
    requestJson(ASSIGNMENTS_PATH, {
      ...options,
      method: 'POST',
      body: payload,
      label: 'Assignment',
    }),

  update: (assignmentId, payload, options) =>
    requestJson(`${ASSIGNMENTS_PATH}/${assignmentId}`, {
      ...options,
      method: 'PUT',
      body: payload,
      label: 'Assignment',
    }),

  // Assignments are hard-deleted by the backend (no is_active column).
  remove: (assignmentId, options) =>
    requestJson(`${ASSIGNMENTS_PATH}/${assignmentId}`, {
      ...options,
      method: 'DELETE',
      label: 'Assignment',
    }),
}
