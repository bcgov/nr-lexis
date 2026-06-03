import { useCallback, useEffect, useRef } from 'react'

export const useLatestRequestGuard = (): (() => () => boolean) => {
  const requestIdRef = useRef(0)

  useEffect(() => {
    return () => {
      requestIdRef.current += 1
    }
  }, [])

  return useCallback(() => {
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    return () => requestIdRef.current === requestId
  }, [])
}
