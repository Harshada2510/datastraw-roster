import { useCallback, useEffect, useRef, useState } from 'react'
import {
  dashboardLoaders,
  getResourceLabel,
} from '../services/dashboardService'

const resourceKeys = Object.keys(dashboardLoaders)

function emptyCollections() {
  return resourceKeys.reduce((collections, key) => {
    collections[key] = []
    return collections
  }, {})
}

function isAbortError(error) {
  return error?.name === 'AbortError'
}

/**
 * Loads every dashboard collection independently so one failing endpoint does
 * not hide the rest of the page. Each failure is reported with its own message.
 */
export function useDashboardData() {
  const controllerRef = useRef(null)
  const [state, setState] = useState({
    loading: true,
    data: emptyCollections(),
    errors: {},
    loadedAt: null,
  })

  const load = useCallback(async ({ initial = false } = {}) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    // The initial state already represents a loading dashboard.
    if (!initial) {
      setState((current) => ({ ...current, loading: true, errors: {} }))
    }

    const results = await Promise.allSettled(
      resourceKeys.map((key) =>
        dashboardLoaders[key]({ signal: controller.signal }),
      ),
    )

    // A newer request (or unmount) superseded this one.
    if (controller.signal.aborted) {
      return
    }

    const data = emptyCollections()
    const errors = {}

    results.forEach((result, index) => {
      const key = resourceKeys[index]

      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        data[key] = result.value
        return
      }

      if (result.status === 'fulfilled') {
        errors[key] = `${getResourceLabel(key)} returned an unexpected response.`
        return
      }

      if (!isAbortError(result.reason)) {
        errors[key] =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
      }
    })

    setState({ loading: false, data, errors, loadedAt: new Date() })
  }, [])

  useEffect(() => {
    // Defer one microtask so the initial fetch starts after the mount render.
    void Promise.resolve().then(() => load({ initial: true }))
    return () => controllerRef.current?.abort()
  }, [load])

  const reload = useCallback(() => load(), [load])

  return { ...state, reload }
}
