import { describe, expect, it } from 'vitest'
import { humanizeError } from '@/lib/api/customerOrders'

describe('humanizeError', () => {
  it('maps known codes to user-friendly copy', () => {
    expect(humanizeError(new Error('invalid_credentials')))
      .toBe('Invalid mobile number or password')
    expect(humanizeError(new Error('rate_limited')))
      .toMatch(/Too many attempts/i)
  })

  it('formats item_unavailable with the item name', () => {
    expect(humanizeError(new Error('item_unavailable:Latte'))).toContain('Latte')
  })

  it('formats insufficient_stock with the item name', () => {
    expect(humanizeError(new Error('insufficient_stock:Croissant'))).toContain('Croissant')
  })

  it('maps ordering_disabled to a menu-only message', () => {
    expect(humanizeError(new Error('ordering_disabled'))).toMatch(/view-only|counter/i)
  })

  it('formats item_display_only with the item name', () => {
    expect(humanizeError(new Error('item_display_only:Chef Special')))
      .toMatch(/Chef Special.*menu-only/i)
  })

  it('falls back to the raw string for unknown codes', () => {
    expect(humanizeError(new Error('mystery_code'))).toBe('mystery_code')
  })

  it('handles non-Error values without throwing', () => {
    expect(humanizeError(null)).toBe('Something went wrong')
    expect(humanizeError(undefined)).toBe('Something went wrong')
  })

  it('extracts .message from Supabase PostgrestError-style plain objects', () => {
    // Simulate what supabase-js surfaces from a Postgres RAISE EXCEPTION.
    const supabaseErr = { code: '42501', message: 'invalid_credentials', details: null, hint: null }
    expect(humanizeError(supabaseErr)).toBe('Invalid mobile number or password')
  })

  it('never returns "[object Object]"', () => {
    expect(humanizeError({ foo: 'bar' })).not.toContain('[object Object]')
    expect(humanizeError({ foo: 'bar' })).toBe('Something went wrong')
  })
})
