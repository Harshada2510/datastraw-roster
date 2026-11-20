import { requestJson } from './apiClient'

const STAFFING_REQUIREMENTS_PATH = '/api/staffing-requirements'

// Uses the existing FastAPI staffing requirement endpoints. The explicit limit
// matches the backend maximum so the management table shows all records.
export const staffingRequirementService = {
  list: (options) =>
    requestJson(`${STAFFING_REQUIREMENTS_PATH}?limit=500`, {
      ...options,
      label: 'Staffing requirements',
    }),

  get: (requirementId, options) =>
    requestJson(`${STAFFING_REQUIREMENTS_PATH}/${requirementId}`, {
      ...options,
      label: 'Staffing requirement',
    }),

  create: (payload, options) =>
    requestJson(STAFFING_REQUIREMENTS_PATH, {
      ...options,
      method: 'POST',
      body: payload,
      label: 'Staffing requirement',
    }),

  update: (requirementId, payload, options) =>
    requestJson(`${STAFFING_REQUIREMENTS_PATH}/${requirementId}`, {
      ...options,
      method: 'PUT',
      body: payload,
      label: 'Staffing requirement',
    }),

  remove: (requirementId, options) =>
    requestJson(`${STAFFING_REQUIREMENTS_PATH}/${requirementId}`, {
      ...options,
      method: 'DELETE',
      label: 'Staffing requirement',
    }),
}
