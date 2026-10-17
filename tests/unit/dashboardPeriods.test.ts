import { describe, expect, it } from 'vitest'
import { buildChartData, formatMonthLabel, formatWeekRangeLabel, getPeriodBoundaries } from '@/lib/dashboardPeriods'

describe('dashboard analytics periods', () => {
  it('uses calendar week boundaries and compares the same elapsed local time last week', () => {
    const now = new Date(2026, 9, 17, 14, 30)
    const period = getPeriodBoundaries('weekly', now)

    expect(period.currentStart).toEqual(new Date(2026, 9, 12))
    expect(period.currentEnd).toEqual(now)
    expect(period.previousStart).toEqual(new Date(2026, 9, 5))
    expect(period.previousEnd).toEqual(new Date(2026, 9, 10, 14, 30))
  })

  it('uses a full historical week and compares it with the previous full week', () => {
    const period = getPeriodBoundaries('weekly', new Date(2026, 9, 17, 14), { weekStart: '2026-10-05' })

    expect(period.currentStart).toEqual(new Date(2026, 9, 5))
    expect(period.currentEnd).toEqual(new Date(2026, 9, 12))
    expect(period.previousStart).toEqual(new Date(2026, 8, 28))
    expect(period.previousEnd).toEqual(new Date(2026, 9, 5))
  })

  it('normalizes a non-Monday weekStart to that week and rejects future weeks', () => {
    const period = getPeriodBoundaries('weekly', new Date(2026, 9, 17), { weekStart: '2026-10-08' })
    expect(period.currentStart).toEqual(new Date(2026, 9, 5))

    expect(() => getPeriodBoundaries('weekly', new Date(2026, 9, 17), { weekStart: '2026-10-19' })).toThrow(RangeError)
  })

  it('compares month-to-date against the same elapsed portion of the previous month', () => {
    const period = getPeriodBoundaries('monthly', new Date(2026, 2, 31, 12))

    expect(period.currentStart).toEqual(new Date(2026, 2, 1))
    expect(period.previousStart).toEqual(new Date(2026, 1, 1))
    expect(period.previousEnd).toEqual(new Date(2026, 1, 28, 12))
  })

  it('uses a full historical month and compares it with the previous full month', () => {
    const period = getPeriodBoundaries('monthly', new Date(2026, 9, 17), { month: '2026-08' })

    expect(period.currentStart).toEqual(new Date(2026, 7, 1))
    expect(period.currentEnd).toEqual(new Date(2026, 8, 1))
    expect(period.previousStart).toEqual(new Date(2026, 6, 1))
    expect(period.previousEnd).toEqual(new Date(2026, 7, 1))
  })

  it('rejects an invalid or future month', () => {
    expect(() => getPeriodBoundaries('monthly', new Date(2026, 9, 17), { month: '2026-13' })).toThrow(RangeError)
    expect(() => getPeriodBoundaries('monthly', new Date(2026, 9, 17), { month: '2026-11' })).toThrow(RangeError)
  })

  it('uses year-to-date and clamps leap day when comparing with last year', () => {
    const period = getPeriodBoundaries('yearly', new Date(2024, 1, 29, 12))

    expect(period.currentStart).toEqual(new Date(2024, 0, 1))
    expect(period.previousStart).toEqual(new Date(2023, 0, 1))
    expect(period.previousEnd).toEqual(new Date(2023, 1, 28, 12))
    expect(period.bucket).toBe('month')
  })

  it('uses a full historical year and compares it with the previous full year', () => {
    const period = getPeriodBoundaries('yearly', new Date(2026, 9, 17), { year: 2024 })

    expect(period.currentStart).toEqual(new Date(2024, 0, 1))
    expect(period.currentEnd).toEqual(new Date(2025, 0, 1))
    expect(period.previousStart).toEqual(new Date(2023, 0, 1))
    expect(period.previousEnd).toEqual(new Date(2024, 0, 1))

    expect(() => getPeriodBoundaries('yearly', new Date(2026, 9, 17), { year: 2027 })).toThrow(RangeError)
  })

  it('treats custom date ranges as inclusive local dates with an exclusive end', () => {
    const period = getPeriodBoundaries('custom', new Date(2026, 9, 17, 14), {
      custom: { start: '2026-10-10', end: '2026-10-12' },
    })

    expect(period.currentStart).toEqual(new Date(2026, 9, 10))
    expect(period.currentEnd).toEqual(new Date(2026, 9, 13))
    expect(period.previousStart).toEqual(new Date(2026, 9, 7))
    expect(period.previousEnd).toEqual(new Date(2026, 9, 10))
  })

  it('compares a custom range ending today over the same elapsed time', () => {
    const period = getPeriodBoundaries('custom', new Date(2026, 9, 17, 14), {
      custom: { start: '2026-10-17', end: '2026-10-17' },
    })

    expect(period.currentStart).toEqual(new Date(2026, 9, 17))
    expect(period.currentEnd).toEqual(new Date(2026, 9, 17, 14))
    expect(period.previousStart).toEqual(new Date(2026, 9, 16))
    expect(period.previousEnd).toEqual(new Date(2026, 9, 16, 14))
    expect(period.bucket).toBe('hour')
  })

  it('uses hourly buckets for a historical single-day custom range, matching the Daily picker', () => {
    const period = getPeriodBoundaries('custom', new Date(2026, 9, 17, 14), {
      custom: { start: '2026-10-12', end: '2026-10-12' },
    })

    expect(period.bucket).toBe('hour')
    expect(period.currentStart).toEqual(new Date(2026, 9, 12))
    expect(period.currentEnd).toEqual(new Date(2026, 9, 13))
  })

  it('rejects invalid custom date ranges', () => {
    expect(() => getPeriodBoundaries('custom', new Date(2026, 9, 17), {
      custom: { start: '2026-10-13', end: '2026-10-12' },
    })).toThrow(RangeError)
    expect(() => getPeriodBoundaries('custom', new Date(2026, 9, 17), {
      custom: { start: '2026-10-18', end: '2026-10-18' },
    })).toThrow(RangeError)
  })

  it('builds all 24 hourly bins from the selected interval', () => {
    const period = getPeriodBoundaries('daily', new Date(2026, 9, 17, 23, 30))
    const chart = buildChartData([
      { created_at: new Date(2026, 9, 17, 2).toISOString(), total: 25, status: 'completed' },
    ], period)

    expect(chart).toHaveLength(24)
    expect(chart[2]).toEqual({ label: '2 AM', revenue: 25, orders: 1 })
  })

  it('uses the selected historical day and the previous full day', () => {
    const period = getPeriodBoundaries('daily', new Date(2026, 9, 17, 14), { dailyDate: '2026-10-12' })

    expect(period.currentStart).toEqual(new Date(2026, 9, 12))
    expect(period.currentEnd).toEqual(new Date(2026, 9, 13))
    expect(period.previousStart).toEqual(new Date(2026, 9, 11))
    expect(period.previousEnd).toEqual(new Date(2026, 9, 12))
    expect(period.bucket).toBe('hour')
  })

  it('keeps today partial and compares the same elapsed time yesterday', () => {
    const period = getPeriodBoundaries('daily', new Date(2026, 9, 17, 14, 30), { dailyDate: '2026-10-17' })

    expect(period.currentStart).toEqual(new Date(2026, 9, 17))
    expect(period.currentEnd).toEqual(new Date(2026, 9, 17, 14, 30))
    expect(period.previousStart).toEqual(new Date(2026, 9, 16))
    expect(period.previousEnd).toEqual(new Date(2026, 9, 16, 14, 30))
  })

  it('rejects invalid and future daily selections', () => {
    expect(() => getPeriodBoundaries('daily', new Date(2026, 9, 17), { dailyDate: '2026-02-30' })).toThrow(RangeError)
    expect(() => getPeriodBoundaries('daily', new Date(2026, 9, 17), { dailyDate: '2026-10-18' })).toThrow(RangeError)
  })

  it('formats week and month labels', () => {
    expect(formatWeekRangeLabel(new Date(2026, 9, 12))).toBe('Oct 12 – Oct 18')
    expect(formatWeekRangeLabel(new Date(2025, 11, 29))).toBe('Dec 29 – Jan 4, 2026')
    expect(formatMonthLabel(new Date(2026, 9, 1))).toBe('October 2026')
  })
})