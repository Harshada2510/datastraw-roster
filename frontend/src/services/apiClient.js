// Small shared fetch wrapper for the FastAPI backend.
// By default requests use the same origin (/api/...) and Vite proxies them to
// the backend in development. Set VITE_API_BASE_URL to override that.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, { status = null, path = null, details = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.path = path
    // Raw FastAPI `detail` value, used by forms to show field-level errors.
    this.details = details
  }
}

function formatDetailItem(item) {
  if (typeof item?.msg !== 'string' || !item.msg.trim()) {
    return null
  }

  const field = Array.isArray(item.loc)
    ? item.loc.filter((part) => part !== 'body').join('.')
    : ''

  return field ? `${field}: ${item.msg}` : item.msg
}

function describeDetail(detail) {
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim()
  }

  if (Array.isArray(detail)) {
    const messages = detail.map(formatDetailItem).filter(Boolean)
    if (messages.length) {
      return messages.join('; ')
    }
  }

  return null
}

export async function requestJson(
  path,
  { method = 'GET', body, signal, label = 'API' } = {},
) {
  const url = `${API_BASE_URL}${path}`
  const options = {
    method,
    signal,
    headers: { Accept: 'application/json' },
  }

  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  let response
  try {
    response = await fetch(url, options)
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    throw new ApiError(
      `Could not reach the API for ${label.toLowerCase()}. Check your connection and that the FastAPI backend is running.`,
      { path },
    )
  }

  let payload = null
  try {
    payload = await response.json()
  } catch {
    // A non-JSON response still gets a useful HTTP-status message below.
  }

  if (!response.ok) {
    const detail = describeDetail(payload?.detail)
    const message = detail
      ? `${label}: ${detail}`
      : `${label}: request failed with HTTP ${response.status}.`
    throw new ApiError(message, {
      status: response.status,
      path,
      details: payload?.detail ?? null,
    })
  }

  return payload
}
