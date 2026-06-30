import { useEffect, useState } from 'react'

// Simulates a short data-fetch so loading skeletons are visible.
// Real API calls would replace this with the request's pending state.
export function useFakeLoading(ms = 550) {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setLoading(false), ms)
    return () => clearTimeout(id)
  }, [ms])
  return loading
}
