import { requestJson } from './apiClient'

// Every endpoint used by the dashboard lives here so other pages can reuse it.
export const apiEndpoints = {
  employees: '/api/employees',
  brands: '/api/brands',
  processes: '/api/processes',
  pods: '/api/pods',
  assignments: '/api/assignments',
  leaves: '/api/leaves',
  holidays: '/api/holidays',
  staffingRequirements: '/api/staffing-requirements',
}

const resourceLabels = {
  employees: 'Employees',
  brands: 'Brands',
  processes: 'Processes',
  pods: 'Pods',
  assignments: 'Assignments',
  leaves: 'Leave requests',
  holidays: 'Holidays',
  staffingRequirements: 'Staffing requirements',
}

function getCollection(key, options) {
  return requestJson(apiEndpoints[key], {
    ...options,
    label: resourceLabels[key],
  })
}

export const getEmployees = (options) => getCollection('employees', options)
export const getBrands = (options) => getCollection('brands', options)
export const getProcesses = (options) => getCollection('processes', options)
export const getPods = (options) => getCollection('pods', options)
export const getAssignments = (options) => getCollection('assignments', options)
export const getLeaves = (options) => getCollection('leaves', options)
export const getHolidays = (options) => getCollection('holidays', options)
export const getStaffingRequirements = (options) =>
  getCollection('staffingRequirements', options)

export const dashboardLoaders = {
  employees: getEmployees,
  brands: getBrands,
  processes: getProcesses,
  pods: getPods,
  assignments: getAssignments,
  leaves: getLeaves,
  holidays: getHolidays,
  staffingRequirements: getStaffingRequirements,
}

export function getResourceLabel(key) {
  return resourceLabels[key] ?? key
}

export const dashboardResourceCount = Object.keys(dashboardLoaders).length
