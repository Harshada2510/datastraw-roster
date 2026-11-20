import { requestJson } from './apiClient'

const HOLIDAYS_PATH = '/api/holidays'

export const holidayService = {
  list: (options) =>
    requestJson(HOLIDAYS_PATH, { ...options, label: 'Holidays' }),

  get: (holidayId, options) =>
    requestJson(`${HOLIDAYS_PATH}/${holidayId}`, {
      ...options,
      label: 'Holiday',
    }),

  create: (payload, options) =>
    requestJson(HOLIDAYS_PATH, {
      ...options,
      method: 'POST',
      body: payload,
      label: 'Holiday',
    }),

  update: (holidayId, payload, options) =>
    requestJson(`${HOLIDAYS_PATH}/${holidayId}`, {
      ...options,
      method: 'PUT',
      body: payload,
      label: 'Holiday',
    }),

  remove: (holidayId, options) =>
    requestJson(`${HOLIDAYS_PATH}/${holidayId}`, {
      ...options,
      method: 'DELETE',
      label: 'Holiday',
    }),
}
