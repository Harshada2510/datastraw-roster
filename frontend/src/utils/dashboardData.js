// Pure helpers that turn API collections into dashboard figures.
// All values are derived from backend responses; nothing here is hard-coded.

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

function toDateOnly(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDate(value) {
  if (!value) {
    return null
  }
  // Date-only values must be read as local dates, not shifted by the timezone.
  const parsed = new Date(
    String(value).length === 10 ? `${value}T00:00:00` : value,
  )
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDate(value) {
  const parsed = parseDate(value)
  return parsed ? dateFormatter.format(parsed) : '—'
}

export function formatDateTime(value) {
  const parsed = parseDate(value)
  return parsed ? dateTimeFormatter.format(parsed) : '—'
}

export function formatDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    return '—'
  }
  if (startDate === endDate) {
    return formatDate(startDate)
  }
  return `${formatDate(startDate)} – ${formatDate(endDate)}`
}

function byCreatedAtDesc(a, b) {
  const first = parseDate(a.created_at)?.getTime() ?? 0
  const second = parseDate(b.created_at)?.getTime() ?? 0
  return second - first || Number(b.id) - Number(a.id)
}

export function buildSummary({
  employees,
  brands,
  processes,
  pods,
  assignments,
  leaves,
}) {
  return {
    totalEmployees: employees.length,
    activeEmployees: employees.filter((employee) => employee.is_active === true)
      .length,
    totalBrands: brands.length,
    totalProcesses: processes.length,
    totalPods: pods.length,
    totalAssignments: assignments.length,
    pendingLeaves: leaves.filter(
      (leave) => String(leave.status).toLowerCase() === 'pending',
    ).length,
  }
}

export function getRecentLeaves(leaves, employees, limit = 5) {
  const namesById = new Map(
    employees.map((employee) => [employee.id, employee.full_name]),
  )

  return [...leaves]
    .sort(byCreatedAtDesc)
    .slice(0, limit)
    .map((leave) => ({
      ...leave,
      employeeName: namesById.get(leave.employee_id) ?? `Employee #${leave.employee_id}`,
    }))
}

export function getUpcomingHolidays(holidays, today = new Date(), limit = 5) {
  const todayIso = toDateOnly(today)

  return holidays
    .filter((holiday) => holiday.holiday_date >= todayIso)
    .sort(
      (a, b) =>
        String(a.holiday_date).localeCompare(String(b.holiday_date)) ||
        Number(a.id) - Number(b.id),
    )
    .slice(0, limit)
}

export function getStaffingOverview(
  { staffingRequirements, brands, processes, assignments },
  today = new Date(),
) {
  const brandNames = new Map(brands.map((brand) => [brand.id, brand.brand_name]))
  const processNames = new Map(
    processes.map((process) => [process.id, process.process_name]),
  )

  const assignedByBrandProcess = new Map()
  assignments.forEach((assignment) => {
    const key = `${assignment.brand_id}|${assignment.process_id}`
    assignedByBrandProcess.set(key, (assignedByBrandProcess.get(key) ?? 0) + 1)
  })

  const todayIso = toDateOnly(today)
  const upcoming = staffingRequirements
    .filter((requirement) => requirement.end_date >= todayIso)
    .sort(
      (a, b) =>
        String(a.start_date).localeCompare(String(b.start_date)) ||
        Number(a.id) - Number(b.id),
    )

  const items = upcoming.slice(0, 5).map((requirement) => {
    const key = `${requirement.brand_id}|${requirement.process_id}`
    return {
      ...requirement,
      brandName: brandNames.get(requirement.brand_id) ?? `Brand #${requirement.brand_id}`,
      processName:
        processNames.get(requirement.process_id) ?? `Process #${requirement.process_id}`,
      assignedCount: assignedByBrandProcess.get(key) ?? 0,
    }
  })

  return {
    totalRequirements: staffingRequirements.length,
    upcomingCount: upcoming.length,
    totalRequiredUpcoming: upcoming.reduce(
      (total, requirement) => total + Number(requirement.required_count ?? 0),
      0,
    ),
    items,
  }
}
