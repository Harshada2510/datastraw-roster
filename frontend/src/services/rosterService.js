// API access for the monthly roster module (Steps 21-23 add availability
// context and validation; Step 24 adds editing and multiple roster views).
// All calls go through the shared apiClient so error handling stays consistent.
import { requestJson } from './apiClient'

function buildQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) {
      search.set(key, String(value))
    }
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

const ROSTERS_PATH = '/api/rosters'

export function getRoster(year, month, options) {
  return requestJson(`${ROSTERS_PATH}/${year}/${month}`, {
    ...options,
    label: 'Roster',
  })
}

export function generateRoster(month, year, options) {
  return requestJson(`${ROSTERS_PATH}/generate`, {
    ...options,
    method: 'POST',
    body: { month, year },
    label: 'Roster generation',
  })
}

export function regenerateRoster(month, year, options) {
  return requestJson(`${ROSTERS_PATH}/regenerate`, {
    ...options,
    method: 'POST',
    body: { month, year },
    label: 'Roster regeneration',
  })
}

// Step 23: read-only validation report for the stored monthly roster.
export function validateRoster(year, month, options) {
  return requestJson(`${ROSTERS_PATH}/${year}/${month}/validate`, {
    ...options,
    method: 'POST',
    label: 'Roster validation',
  })
}

// Step 24: read and edit a single stored roster entry.
export function getRosterEntry(entryId, options) {
  return requestJson(`${ROSTERS_PATH}/entries/${entryId}`, {
    ...options,
    label: 'Roster entry',
  })
}

export function updateRosterEntry(entryId, payload, options) {
  return requestJson(`${ROSTERS_PATH}/entries/${entryId}`, {
    ...options,
    method: 'PUT',
    body: payload,
    label: 'Roster entry update',
  })
}

// Step 24: shared filter parameters are appended only when they have a value,
// so clearing a filter truly removes it from the request.
export function getRosterEntries(year, month, filters = {}, options) {
  return requestJson(`${ROSTERS_PATH}/${year}/${month}/entries${buildQuery(filters)}`, {
    ...options,
    label: 'Roster entries',
  })
}

export function getRosterWeek(year, month, { weekStart, ...filters } = {}, options) {
  return requestJson(
    `${ROSTERS_PATH}/${year}/${month}/weekly${buildQuery({ ...filters, week_start: weekStart })}`,
    { ...options, label: 'Weekly roster' },
  )
}

export function getEmployeeRoster(year, month, employeeId, filters = {}, options) {
  return requestJson(
    `${ROSTERS_PATH}/${year}/${month}/employee-wise${buildQuery({ ...filters, employee_id: employeeId })}`,
    { ...options, label: 'Employee roster' },
  )
}

// Master data used to populate the roster table filters.
export function getRosterFilterOptions(options) {
  return Promise.all([
    requestJson('/api/employees?limit=500', { ...options, label: 'Employees' }),
    requestJson('/api/brands?limit=500', { ...options, label: 'Brands' }),
    requestJson('/api/processes?limit=500', { ...options, label: 'Processes' }),
  ]).then(([employees, brands, processes]) => ({
    employees: Array.isArray(employees) ? employees : [],
    brands: Array.isArray(brands) ? brands : [],
    processes: Array.isArray(processes) ? processes : [],
  }))
}
