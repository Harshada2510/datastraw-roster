// Turns a FastAPI ApiError into field-level and general form messages.
// `resolveMessageField` maps plain-string details (409/404) onto a field.
export function mapApiErrors(error, allowedFields, resolveMessageField = () => null) {
  const fieldErrors = {}
  const generalErrors = []
  const details = error?.details

  const assign = (field, message) => {
    if (field && allowedFields.includes(field)) {
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
      assign(field, message)
    })
  } else if (typeof details === 'string' && details.trim()) {
    const message = details.trim()
    assign(resolveMessageField(message), message)
  }

  if (!Object.keys(fieldErrors).length && !generalErrors.length && error?.message) {
    generalErrors.push(error.message)
  }

  return { fieldErrors, generalErrors }
}
