import { requestJson } from './apiClient'

const WEEKLY_OFFS_PATH = '/api/weekly-offs'

export const weeklyOffService = {
  list: (options) =>
    requestJson(WEEKLY_OFFS_PATH, { ...options, label: 'Weekly offs' }),

  get: (weeklyOffId, options) =>
    requestJson(`${WEEKLY_OFFS_PATH}/${weeklyOffId}`, {
      ...options,
      label: 'Weekly off',
    }),

  listForEmployee: (employeeId, options) =>
    requestJson(`/api/employees/${employeeId}/weekly-offs`, {
      ...options,
      label: 'Employee weekly offs',
    }),

  create: (payload, options) =>
    requestJson(WEEKLY_OFFS_PATH, {
      ...options,
      method: 'POST',
      body: payload,
      label: 'Weekly off',
    }),

  update: (weeklyOffId, payload, options) =>
    requestJson(`${WEEKLY_OFFS_PATH}/${weeklyOffId}`, {
      ...options,
      method: 'PUT',
      body: payload,
      label: 'Weekly off',
    }),

  remove: (weeklyOffId, options) =>
    requestJson(`${WEEKLY_OFFS_PATH}/${weeklyOffId}`, {
      ...options,
      method: 'DELETE',
      label: 'Weekly off',
    }),
}
