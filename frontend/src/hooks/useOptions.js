import { useCallback, useEffect, useRef, useState } from 'react'

// Loads a reference list once for dropdown options (employees, brands,
// processes). Aborts on unmount and exposes reload for error retries.
export function useOptions(fetcher, fallbackMessage) {
  const controllerRef = useRef(null)
  const [state, setState] = useState({ items: [], loading: true, error: null })

  const load = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState((current) => ({ ...current, loading: true, error: null }))

    try {
      const items = await fetcher({ signal: controller.signal })
      if (controller.signal.aborted) {
        return
      }
      setState({
        items: Array.isArray(items) ? items : [],
        loading: false,
        error: null,
      })
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        return
      }
      setState({
        items: [],
        loading: false,
        error: error?.message ?? fallbackMessage,
      })
    }
  }, [fetcher, fallbackMessage])

  useEffect(() => {
    void Promise.resolve().then(() => load())
    return () => controllerRef.current?.abort()
  }, [load])

  return { ...state, reload: load }
}
