import { requestJson } from './apiClient'

// Generic CRUD wrapper for the master-data endpoints that share one shape
// (brands and processes). All calls still go through the shared apiClient,
// so there is only one fetch/serialisation/error path in the frontend.
export function createNamedResourceService({
  path,
  collectionLabel,
  recordLabel,
}) {
  return {
    list: (options) => requestJson(path, { ...options, label: collectionLabel }),
    get: (id, options) =>
      requestJson(`${path}/${id}`, { ...options, label: recordLabel }),
    create: (payload, options) =>
      requestJson(path, {
        ...options,
        method: 'POST',
        body: payload,
        label: recordLabel,
      }),
    update: (id, payload, options) =>
      requestJson(`${path}/${id}`, {
        ...options,
        method: 'PUT',
        body: payload,
        label: recordLabel,
      }),
    // Backend soft-deletes (sets is_active = false).
    deactivate: (id, options) =>
      requestJson(`${path}/${id}`, {
        ...options,
        method: 'DELETE',
        label: recordLabel,
      }),
  }
}
