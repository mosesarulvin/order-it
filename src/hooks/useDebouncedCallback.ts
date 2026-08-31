import { useEffect, useMemo, useRef } from 'react'

/**
 * Coalesce bursty callbacks into a single call after `delayMs` of quiet.
 * The returned function is stable across re-renders — safe as a realtime
 * event handler.
 *
 * Cancels pending invocations on unmount.
 */
export function useDebouncedCallback<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
): (...args: Args) => void {
  const fnRef = useRef(fn)
  fnRef.current = fn

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debounced = useMemo(() => {
    return (...args: Args) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => fnRef.current(...args), delayMs)
    }
  }, [delayMs])

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  return debounced
}
