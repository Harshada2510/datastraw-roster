import { useCallback, useEffect, useRef, useState } from 'react'
import { getEmployees } from '../services/employeeService'

export function useEmployees() {
  const controllerRef = useRef(null)
  const [state, setState] = useState({
    employees: [],
    loading: true,
    error: null,
    loadedAt: null,
  })

  const load = useCallback(async ({ initial = false } = {}) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    if (!initial) {
      setState((current) => ({ ...current, loading: true, error: null }))
    }

    try {
      const employees = await getEmployees({ signal: controller.signal })
      if (controller.signal.aborted) {
        return
      }
      setState({
        employees: Array.isArray(employees) ? employees : [],
        loading: false,
        error: null,
        loadedAt: new Date(),
      })
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError') {
        return
      }
      setState({
        employees: [],
        loading: false,
        error: error?.message ?? 'Could not load employees.',
        loadedAt: null,
      })
    }
  }, [])

  useEffect(() => {
    // Start after the mount render so loading state is painted first.
    void Promise.resolve().then(() => load({ initial: true }))
    return () => controllerRef.current?.abort()
  }, [load])

  const reload = useCallback(() => load(), [load])

  return { ...state, reload }
}
