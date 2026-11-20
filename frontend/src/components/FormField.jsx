// Shared labelled field wrapper used by the Leave, Weekly Off and Holiday forms.
function FormField({ label, name, error, required = false, children }) {
  return (
    <label className="form-field" htmlFor={name}>
      <span className="form-label">
        {label}
        {required && <span className="required-mark"> *</span>}
      </span>
      {children}
      {error && (
        <span className="field-error" id={`${name}-error`} role="alert">
          {error}
        </span>
      )}
    </label>
  )
}

export default FormField
