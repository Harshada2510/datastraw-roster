import { requestJson } from './apiClient'

// The calendar API returns holidays, leaves, weekly offs and a per-day summary
// in one response; the page only needs to render it.
export const calendarService = {
  getMonth: (year, month, options) =>
    requestJson(`/api/calendar/${year}/${month}`, {
      ...options,
      label: 'Calendar',
    }),
}
