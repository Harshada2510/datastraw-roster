import { CalendarDays, Filter, RotateCcw } from 'lucide-react'

function RosterFilters({
  filters,
  onChange,
  onClear,
  employees,
  brands,
  processes,
  disabled = false,
}) {
  const hasActiveFilter = Object.values(filters).some(Boolean)

  return (
    <div className="card roster-filter-panel">
      <div className="section-header section-header--split">
        <div>
          <h3>Roster Filters</h3>
          <p>
            Filters apply to every view and work together. Clear them to see the
            full roster again.
          </p>
        </div>
        {hasActiveFilter && (
          <button
            type="button"
            className="button-secondary"
            onClick={onClear}
            disabled={disabled}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Clear all filters
          </button>
        )}
      </div>
      <div className="employee-toolbar roster-filters">
        <label className="search-field">
          <Filter size={16} aria-hidden="true" />
          <select
            aria-label="Filter by employee"
            value={filters.employee_id}
            onChange={(event) => onChange('employee_id', event.target.value)}
            disabled={disabled}
          >
            <option value="">All employees</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name} ({employee.employee_code})
              </option>
            ))}
          </select>
        </label>
        <label className="search-field">
          <Filter size={16} aria-hidden="true" />
          <select
            aria-label="Filter by brand"
            value={filters.brand_id}
            onChange={(event) => onChange('brand_id', event.target.value)}
            disabled={disabled}
          >
            <option value="">All brands</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.brand_name}
              </option>
            ))}
          </select>
        </label>
        <label className="search-field">
          <Filter size={16} aria-hidden="true" />
          <select
            aria-label="Filter by process"
            value={filters.process_id}
            onChange={(event) => onChange('process_id', event.target.value)}
            disabled={disabled}
          >
            <option value="">All processes</option>
            {processes.map((process) => (
              <option key={process.id} value={process.id}>
                {process.process_name}
              </option>
            ))}
          </select>
        </label>
        <label className="search-field">
          <CalendarDays size={16} aria-hidden="true" />
          <input
            type="date"
            aria-label="Filter from date"
            title="From date"
            value={filters.start_date}
            onChange={(event) => onChange('start_date', event.target.value)}
            disabled={disabled}
          />
        </label>
        <label className="search-field">
          <CalendarDays size={16} aria-hidden="true" />
          <input
            type="date"
            aria-label="Filter to date"
            title="To date"
            value={filters.end_date}
            onChange={(event) => onChange('end_date', event.target.value)}
            disabled={disabled}
          />
        </label>
      </div>
    </div>
  )
}

export default RosterFilters
