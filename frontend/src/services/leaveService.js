import { requestJson } from './apiClient'

const LEAVES_PATH = '/api/leaves'

export const leaveService = {
  list: (options) =>
    requestJson(LEAVES_PATH, { ...options, label: 'Leave requests' }),

  get: (leaveId, options) =>
    requestJson(`${LEAVES_PATH}/${leaveId}`, {
      ...options,
      label: 'Leave request',
    }),

  // Existing per-employee endpoint, used by the employee filter.
  listForEmployee: (employeeId, options) =>
    requestJson(`/api/employees/${employeeId}/leaves`, {
      ...options,
      label: 'Employee leave requests',
    }),

  create: (payload, options) =>
    requestJson(LEAVES_PATH, {
      ...options,
      method: 'POST',
      body: payload,
      label: 'Leave request',
    }),

  update: (leaveId, payload, options) =>
    requestJson(`${LEAVES_PATH}/${leaveId}`, {
      ...options,
      method: 'PUT',
      body: payload,
      label: 'Leave request',
    }),

  // Leave requests are hard-deleted by the backend.
  remove: (leaveId, options) =>
    requestJson(`${LEAVES_PATH}/${leaveId}`, {
      ...options,
      method: 'DELETE',
      label: 'Leave request',
    }),
}
