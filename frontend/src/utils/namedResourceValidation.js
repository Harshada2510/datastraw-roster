// Client-side rules mirror backend/app/schemas/brand.py and process.py.
// Those two schemas are identical apart from the name field, so one factory
// serves both pages.
export const NAME_MAX_LENGTH = 150

export const RESOURCE_FIELDS = ['description', 'is_active']

export function createNamedResourceUtils(nameField, nameLabel) {
  const emptyForm = () => ({
    [nameField]: '',
    description: '',
    is_active: true,
  })

  const toForm = (record) => ({
    [nameField]: record[nameField] ?? '',
    description: record.description ?? '',
    is_active: record.is_active ?? true,
  })

  const validate = (values) => {
    const errors = {}
    const name = (values[nameField] ?? '').trim()

    if (!name) {
      errors[nameField] = `${nameLabel} is required.`
    } else if (name.length > NAME_MAX_LENGTH) {
      errors[nameField] = `${nameLabel} must be ${NAME_MAX_LENGTH} characters or fewer.`
    }

    return errors
  }

  const buildPayload = (values) => ({
    [nameField]: (values[nameField] ?? '').trim(),
    // The backend normalises blank descriptions to null.
    description: (values.description ?? '').trim() || null,
    is_active: Boolean(values.is_active),
  })

  const mapServerErrors = (error) => {
    const fieldErrors = {}
    const generalErrors = []
    const details = error?.details

    const assignField = (field, message) => {
      if (field === nameField || RESOURCE_FIELDS.includes(field)) {
        fieldErrors[field] = message
      } else {
        generalErrors.push(message)
      }
    }

    if (Array.isArray(details)) {
      details.forEach((item) => {
        const message = item?.msg ?? 'Invalid value.'
        const field = Array.isArray(item?.loc)
          ? item.loc.filter((part) => part !== 'body').join('.')
          : ''
        assignField(field, message)
      })
    } else if (typeof details === 'string' && details.trim()) {
      const message = details.trim()
      // Uniqueness checks return a plain string containing the field name.
      if (message.includes(nameField)) {
        fieldErrors[nameField] = message
      } else {
        generalErrors.push(message)
      }
    }

    if (!Object.keys(fieldErrors).length && !generalErrors.length && error?.message) {
      generalErrors.push(error.message)
    }

    return { fieldErrors, generalErrors }
  }

  return { emptyForm, toForm, validate, buildPayload, mapServerErrors }
}
