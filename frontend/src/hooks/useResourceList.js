import { useCallback, useEffect, useRef, useState } from 'react'

// Shared list state for the brand and process pages: loading, error and a
// reload function that callers invoke after a successful write.
export function useResourceList(list, fallbackMessage) {
  const controllerRef = useRef(null)
  const [state, setState] = useState({
    records: [],
    loading: true,
    error: null,
  })

  const load = useCallback(
    async ({ initial = false } = {}) => {
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      if (!initial) {
        setState((current) => ({ ...current, loading: true, error: null }))
      }

      try {
        const records = await list({ signal: controller.signal })
        if (controller.signal.aborted) {
          return
        }
        setState({
          records: Array.isArray(records) ? records : [],
          loading: false,
          error: null,
        })
      } catch (error) {
        if (controller.signal.aborted || error?.name === 'AbortError') {
          return
        }
        setState({
          records: [],
          loading: false,
          error: error?.message ?? fallbackMessage,
        })
      }
    },
    [list, fallbackMessage],
  )

  useEffect(() => {
    // Start after the mount render so the loading state is painted first.
    void Promise.resolve().then(() => load({ initial: true }))
    return () => controllerRef.current?.abort()
  }, [load])

  const reload = useCallback(() => load(), [load])

  return { ...state, reload }
}
