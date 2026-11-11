import { useCallback, useEffect, useState, type DependencyList } from 'react'
import { friendlyError } from '../data/api'
import { useApp } from '../app/AppContext'

export interface AsyncState<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  reload: () => void
  setData: (updater: T | ((current: T | undefined) => T | undefined)) => void
}

/** Load something when the screen opens; exposes loading / error / reload. */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    load()
      .then((result) => active && setData(result))
      .catch((e) => active && setError(friendlyError(e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { data, error, loading, reload, setData }
}

/** Resolves a private storage path to a short-lived link. */
export function usePhotoUrl(path: string | null | undefined) {
  const { api } = useApp()
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false })

  useEffect(() => {
    if (!path) {
      setState({ url: null, failed: false })
      return
    }
    let active = true
    setState({ url: null, failed: false })
    api
      .photoUrl(path)
      .then((url) => active && setState({ url, failed: false }))
      .catch(() => active && setState({ url: null, failed: true }))
    return () => {
      active = false
    }
  }, [api, path])

  return state
}
