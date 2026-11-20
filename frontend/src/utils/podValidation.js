import { mapApiErrors } from './apiErrorMapping'
import { NAME_MAX_LENGTH } from './namedResourceValidation'

const POD_FIELDS = ['pod_name', 'description', 'pod_lead_id', 'is_active']

export function emptyPodForm() {
  return {
    pod_name: '',
    description: '',
    pod_lead_id: '',
    is_active: true,
  }
}

export function podToForm(pod) {
  return {
    pod_name: pod.pod_name ?? '',
    description: pod.description ?? '',
    pod_lead_id: pod.pod_lead_id == null ? '' : String(pod.pod_lead_id),
    is_active: pod.is_active ?? true,
  }
}

// `validEmployeeIds` is a Set built from the live employee API response.
export function validatePod(values, validEmployeeIds) {
  const errors = {}
  const name = (values.pod_name ?? '').trim()
  const lead = String(values.pod_lead_id ?? '').trim()

  if (!name) {
    errors.pod_name = 'Pod Name is required.'
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.pod_name = `Pod Name must be ${NAME_MAX_LENGTH} characters or fewer.`
  }

  if (lead && !validEmployeeIds.has(Number(lead))) {
    errors.pod_lead_id = 'Select a valid employee as pod lead.'
  }

  return errors
}

export function buildPodPayload(values) {
  const lead = String(values.pod_lead_id ?? '').trim()
  return {
    pod_name: (values.pod_name ?? '').trim(),
    description: (values.description ?? '').trim() || null,
    pod_lead_id: lead ? Number(lead) : null,
    is_active: Boolean(values.is_active),
  }
}

export function mapPodServerErrors(error) {
  return mapApiErrors(error, POD_FIELDS, (message) => {
    if (message.includes('pod_name')) {
      return 'pod_name'
    }
    // The backend validates the lead against the Employee table.
    if (/employee/i.test(message)) {
      return 'pod_lead_id'
    }
    return null
  })
}
