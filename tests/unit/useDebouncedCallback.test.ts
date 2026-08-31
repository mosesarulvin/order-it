import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'

describe('useDebouncedCallback', () => {
  it('invokes the callback once after the delay', () => {
    vi.useFakeTimers()
    const spy = vi.fn()
    const { result } = renderHook(() => useDebouncedCallback(spy, 100))

    act(() => {
      result.current('a')
      result.current('b')
      result.current('c')
    })

    expect(spy).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(100) })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenLastCalledWith('c')
    vi.useRealTimers()
  })

  it('cancels the pending call on unmount', () => {
    vi.useFakeTimers()
    const spy = vi.fn()
    const { result, unmount } = renderHook(() => useDebouncedCallback(spy, 100))

    act(() => { result.current('x') })
    unmount()
    act(() => { vi.advanceTimersByTime(200) })
    expect(spy).not.toHaveBeenCalled()
    vi.useRealTimers()
  })
})
