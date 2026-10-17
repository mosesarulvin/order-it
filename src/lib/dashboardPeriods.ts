export type TimeRange = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
export type ChartBucket = 'hour' | 'day' | 'month'

export interface CustomDateRange {
  start: string
  end: string
}

export interface PeriodSelection {
  custom?: CustomDateRange
  /** Local YYYY-MM-DD for the chosen day (daily mode). */
  dailyDate?: string
  /** Local YYYY-MM-DD for any day in the chosen week (weekly mode); normalized to that week's Monday. */
  weekStart?: string
  /** Local YYYY-MM for the chosen month (monthly mode). */
  month?: string
  /** The chosen calendar year (yearly mode). */
  year?: number
}

export interface PeriodBoundaries {
  currentStart: Date
  currentEnd: Date
  previousStart: Date
  previousEnd: Date
  bucket: ChartBucket
}

interface PeriodOrder {
  created_at: string
  total: number | null
  status: string
}

export interface ChartPoint {
  label: string
  revenue: number
  orders: number
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addCalendarDays(date: Date, amount: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + amount)
  return result
}

function addCalendarMonths(date: Date, amount: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(date.getDate(), lastDay))
  target.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds())
  return target
}

function addCalendarYears(date: Date, amount: number): Date {
  const targetYear = date.getFullYear() + amount
  const lastDay = new Date(targetYear, date.getMonth() + 1, 0).getDate()
  const result = new Date(date)
  result.setFullYear(targetYear, date.getMonth(), Math.min(date.getDate(), lastDay))
  return result
}

function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new RangeError('Dates must use YYYY-MM-DD format')
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) {
    throw new RangeError('Date is invalid')
  }
  return date
}

function parseMonthKey(value: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value)
  if (!match) throw new RangeError('Month must use YYYY-MM format')
  const year = Number(match[1])
  const month = Number(match[2]) - 1
  if (month < 0 || month > 11) throw new RangeError('Month is invalid')
  return { year, month }
}

export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** Monday-start of the calendar week containing `date`. */
export function startOfWeekLocal(date: Date): Date {
  const start = startOfLocalDay(date)
  return addCalendarDays(start, -((start.getDay() + 6) % 7))
}

function dayCount(start: Date, end: Date): number {
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
  const endUtc = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  return Math.round((endUtc - startUtc) / 86400000) + 1
}

export function getPeriodBoundaries(
  timeRange: TimeRange,
  now: Date = new Date(),
  selection?: PeriodSelection,
): PeriodBoundaries {
  const currentEnd = new Date(now)
  const todayStart = startOfLocalDay(now)

  if (timeRange === 'custom') {
    const custom = selection?.custom
    if (!custom?.start || !custom.end) throw new RangeError('Select both custom dates')
    const firstDate = parseLocalDate(custom.start)
    const lastDate = parseLocalDate(custom.end)
    if (firstDate > lastDate) throw new RangeError('Start date must not be after end date')
    if (lastDate > todayStart) throw new RangeError('Custom dates cannot be in the future')

    const currentStart = startOfLocalDay(firstDate)
    const selectedEnd = startOfLocalDay(addCalendarDays(lastDate, 1))
    const boundedEnd = selectedEnd < currentEnd ? selectedEnd : currentEnd
    const selectedDays = dayCount(firstDate, lastDate)
    const includesToday = localDateKey(lastDate) === localDateKey(now)
    const previousEnd = includesToday ? addCalendarDays(boundedEnd, -selectedDays) : currentStart
    const previousStart = addCalendarDays(currentStart, -selectedDays)
    return {
      currentStart,
      currentEnd: boundedEnd,
      previousStart,
      previousEnd,
      // Match the Daily picker's granularity so a single-day custom range looks the same.
      bucket: selectedDays === 1 ? 'hour' : selectedDays > 62 ? 'month' : 'day',
    }
  }

  if (timeRange === 'daily') {
    const selectedDate = selection?.dailyDate ? parseLocalDate(selection.dailyDate) : todayStart
    if (selectedDate > todayStart) throw new RangeError('Daily date cannot be in the future')

    const currentStart = startOfLocalDay(selectedDate)
    const isToday = localDateKey(currentStart) === localDateKey(todayStart)
    return {
      currentStart,
      currentEnd: isToday ? currentEnd : addCalendarDays(currentStart, 1),
      previousStart: addCalendarDays(currentStart, -1),
      previousEnd: isToday ? addCalendarDays(currentEnd, -1) : currentStart,
      bucket: 'hour',
    }
  }

  if (timeRange === 'weekly') {
    const currentWeekStart = startOfWeekLocal(now)
    const weekStart = selection?.weekStart ? startOfWeekLocal(parseLocalDate(selection.weekStart)) : currentWeekStart
    if (weekStart > currentWeekStart) throw new RangeError('Week cannot be in the future')
    const isCurrentWeek = localDateKey(weekStart) === localDateKey(currentWeekStart)
    return {
      currentStart: weekStart,
      currentEnd: isCurrentWeek ? currentEnd : addCalendarDays(weekStart, 7),
      previousStart: addCalendarDays(weekStart, -7),
      previousEnd: isCurrentWeek ? addCalendarDays(currentEnd, -7) : weekStart,
      bucket: 'day',
    }
  }

  if (timeRange === 'monthly') {
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const { year, month } = selection?.month ? parseMonthKey(selection.month) : { year: now.getFullYear(), month: now.getMonth() }
    const monthStart = new Date(year, month, 1)
    if (monthStart > currentMonthStart) throw new RangeError('Month cannot be in the future')
    const isCurrentMonth = monthStart.getTime() === currentMonthStart.getTime()
    return {
      currentStart: monthStart,
      currentEnd: isCurrentMonth ? currentEnd : new Date(year, month + 1, 1),
      previousStart: new Date(year, month - 1, 1),
      previousEnd: isCurrentMonth ? addCalendarMonths(currentEnd, -1) : monthStart,
      bucket: 'day',
    }
  }

  const currentYear = now.getFullYear()
  const year = selection?.year ?? currentYear
  if (!Number.isInteger(year)) throw new RangeError('Year is invalid')
  if (year > currentYear) throw new RangeError('Year cannot be in the future')
  const yearStart = new Date(year, 0, 1)
  const isCurrentYear = year === currentYear
  return {
    currentStart: yearStart,
    currentEnd: isCurrentYear ? currentEnd : new Date(year + 1, 0, 1),
    previousStart: new Date(year - 1, 0, 1),
    previousEnd: isCurrentYear ? addCalendarYears(currentEnd, -1) : yearStart,
    bucket: 'month',
  }
}

/** e.g. "Oct 12 – Oct 18" (shows the end year only when the week crosses a year boundary). */
export function formatWeekRangeLabel(weekStart: Date): string {
  const weekEnd = addCalendarDays(weekStart, 6)
  const crossesYear = weekStart.getFullYear() !== weekEnd.getFullYear()
  const startLabel = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const endLabel = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: crossesYear ? 'numeric' : undefined })
  return `${startLabel} – ${endLabel}`
}

/** e.g. "October 2026". */
export function formatMonthLabel(monthStart: Date): string {
  return monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

/** e.g. "Oct 2026", for tighter spaces like the tab button. */
export function formatMonthShortLabel(monthStart: Date): string {
  return monthStart.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function isCompleted(order: PeriodOrder): boolean {
  return order.status === 'completed' || order.status === 'ready'
}

function formatHour(hour: number): string {
  const displayHour = hour % 12 || 12
  return `${displayHour} ${hour >= 12 ? 'PM' : 'AM'}`
}

function formatDay(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function buildChartData(orders: PeriodOrder[], boundaries: PeriodBoundaries): ChartPoint[] {
  const buckets = new Map<string, { label: string; revenue: number; orders: number }>()

  if (boundaries.bucket === 'hour') {
    for (let hour = 0; hour < 24; hour++) {
      buckets.set(String(hour), { label: formatHour(hour), revenue: 0, orders: 0 })
    }
  } else {
    const cursor = boundaries.bucket === 'month'
      ? new Date(boundaries.currentStart.getFullYear(), boundaries.currentStart.getMonth(), 1)
      : startOfLocalDay(boundaries.currentStart)
    while (cursor < boundaries.currentEnd) {
      const key = boundaries.bucket === 'month' ? formatMonth(cursor) : localDateKey(cursor)
      const label = boundaries.bucket === 'month' ? key : formatDay(cursor)
      buckets.set(key, { label, revenue: 0, orders: 0 })
      if (boundaries.bucket === 'month') cursor.setMonth(cursor.getMonth() + 1)
      else cursor.setDate(cursor.getDate() + 1)
    }
  }

  for (const order of orders) {
    const createdAt = new Date(order.created_at)
    const key = boundaries.bucket === 'hour'
      ? String(createdAt.getHours())
      : boundaries.bucket === 'month'
        ? formatMonth(createdAt)
        : localDateKey(createdAt)
    const bucket = buckets.get(key)
    if (!bucket) continue
    if (isCompleted(order)) bucket.revenue += order.total ?? 0
    bucket.orders += 1
  }

  return Array.from(buckets.values(), ({ label, revenue, orders }) => ({
    label,
    revenue: Math.round(revenue),
    orders,
  }))
}