import { useEffect } from 'react'
import { X } from 'lucide-react'

function Modal({ title, subtitle, onClose, children, size = 'medium', closeDisabled = false }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !closeDisabled) {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, closeDisabled])

  const handleBackdropMouseDown = (event) => {
    if (event.target === event.currentTarget && !closeDisabled) {
      onClose()
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdropMouseDown}>
      <div
        className={`card modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={closeDisabled}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

export default Modal
