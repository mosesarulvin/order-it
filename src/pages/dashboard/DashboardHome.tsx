import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp,
  ArrowRight,
  Flame,
  Package,
  Zap,
  BarChart3,
  PieChart as PieChartIcon,
  Percent,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { DatePicker } from '@/components/ui/DatePicker'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { captureException } from '@/lib/observability'
import {
  addCalendarDays,
  buildChartData,
  formatMonthLabel,
  formatMonthShortLabel,
  formatWeekRangeLabel,
  getPeriodBoundaries,
  localDateKey,
  monthKey,
  startOfWeekLocal,
  type ChartPoint,
  type PeriodBoundaries,
  type PeriodSelection,
  type TimeRange,
} from '@/lib/dashboardPeriods'
import type { MenuItem } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface AnalyticsData {
  periodRevenue: number
  revenueGrowth: number
  aov: number
  completionRate: number
  totalOrders: number
  chartData: ChartPoint[]
  topItems: { name: string; quantity: number; revenue: number }[]
  orderSourceSplit: { name: string; value: number; color: string }[]
  paymentSplit: { name: string; value: number; color: string }[]
}

interface AnalyticsOrder {
  created_at: string
  total: number | null
  status: string
  payment_method: string | null
  order_source: string | null
  order_items: { name: string; quantity: number | null; subtotal: number | null }[] | null
}

async function fetchPeriodOrders(shopId: string, boundaries: PeriodBoundaries): Promise<{ data: AnalyticsOrder[]; error: unknown }> {
  const pageSize = 1000
  const orders: AnalyticsOrder[] = []

  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, total, status, payment_method, order_source, created_at, order_items(name, quantity, subtotal)')
      .eq('shop_id', shopId)
      .gte('created_at', boundaries.previousStart.toISOString())
      .lt('created_at', boundaries.currentEnd.toISOString())
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) return { data: [], error }
    const page = (data ?? []) as AnalyticsOrder[]
    orders.push(...page)
    if (page.length < pageSize) return { data: orders, error: null }
  }
}

function monthKeyToDate(key: string): Date {
  const [year, month] = key.split('-').map(Number)
  return new Date(year, month - 1, 1)
}

function shiftMonthKey(key: string, amount: number): string {
  const [year, month] = key.split('-').map(Number)
  return monthKey(new Date(year, month - 1 + amount, 1))
}

export default function DashboardHome() {
  const { shop } = useAuth()
  const [lowStockItems, setLowStockItems] = useState<MenuItem[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('weekly')
  const [selectedDailyDate, setSelectedDailyDate] = useState(() => localDateKey(new Date()))
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => localDateKey(startOfWeekLocal(new Date())))
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()))
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  const [openPicker, setOpenPicker] = useState<TimeRange | null>(null)
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const fetchDataRef = useRef<(() => Promise<void>) | undefined>(undefined)
  const rangeSelectorRef = useRef<HTMLDivElement>(null)

  // Dismiss any open period dropdown on outside click or Escape; ignore clicks inside
  // the DatePicker's portaled calendar, which Radix renders outside this subtree.
  useEffect(() => {
    if (!openPicker) return
    const closeAll = () => setOpenPicker(null)
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Element
      if (target.closest('[data-radix-popper-content-wrapper]')) return
      if (rangeSelectorRef.current && !rangeSelectorRef.current.contains(target)) closeAll()
    }
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeAll() }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openPicker])

  // A first click on a preset switches to it with its sensible default; a second click while
  // already active toggles that preset's own picker, so switching tabs never pops a dropdown open.
  const selectPeriod = (range: Exclude<TimeRange, 'custom'>) => {
    if (timeRange !== range) { setTimeRange(range); setOpenPicker(null); return }
    setOpenPicker((current) => (current === range ? null : range))
  }

  // Re-fetch whenever the selected range changes so the query window matches what's displayed.
  useEffect(() => {
    if (!shop) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, timeRange, selectedDailyDate, selectedWeekStart, selectedMonth, selectedYear])

  useEffect(() => {
    if (!shop) return
    const channel = supabase
      .channel(`dashboard-${shop.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `shop_id=eq.${shop.id}` },
        () => { debouncedRefresh(() => fetchDataRef.current?.()) },
      )
      .subscribe()
    channelRef.current = channel
    return () => { channel.unsubscribe() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop])

  const fetchData = useCallback(async () => {
    if (!shop) return
    setLoading(true)

    const selection: PeriodSelection = {
      dailyDate: selectedDailyDate,
      weekStart: selectedWeekStart,
      month: selectedMonth,
      year: selectedYear,
    }
    let boundaries: PeriodBoundaries
    try {
      boundaries = getPeriodBoundaries(timeRange, new Date(), selection)
    } catch (err) {
      // An invalid/future selection shouldn't crash the dashboard; just skip this fetch.
      captureException(err, { where: 'DashboardHome.getPeriodBoundaries' })
      setLoading(false)
      return
    }

    const [lowStockRes, ordersRes] = await Promise.all([
      supabase
        .from('menu_items')
        .select('id, shop_id, name, stock_quantity, low_stock_threshold, is_available, price')
        .eq('shop_id', shop.id)
        .not('stock_quantity', 'is', null),
      fetchPeriodOrders(shop.id, boundaries),
    ])

    if (ordersRes.error) captureException(ordersRes.error, { where: 'DashboardHome.orders' })

    const allTracked = (lowStockRes.data as MenuItem[]) || []
    setLowStockItems(allTracked.filter((i) => i.stock_quantity !== null && i.stock_quantity <= i.low_stock_threshold))

    const ordersList = ordersRes.data
    setAnalytics(processAnalytics(ordersList, boundaries))
    setLoading(false)
  }, [shop, timeRange, selectedDailyDate, selectedWeekStart, selectedMonth, selectedYear])

  useEffect(() => { fetchDataRef.current = fetchData }, [fetchData])

  const debouncedRefresh = useDebouncedCallback((run: () => void) => run(), 400)

  const today = new Date()
  const todayKey = localDateKey(today)
  const currentWeekKey = localDateKey(startOfWeekLocal(today))
  const currentMonthKey = monthKey(today)
  const currentYear = today.getFullYear()

  const selectedDailyLabel = new Date(`${selectedDailyDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const selectedDailyShortLabel = new Date(`${selectedDailyDate}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const selectedWeekLabel = formatWeekRangeLabel(new Date(`${selectedWeekStart}T00:00:00`))
  const selectedMonthDate = monthKeyToDate(selectedMonth)
  const selectedMonthLabel = formatMonthLabel(selectedMonthDate)
  const selectedMonthShortLabel = formatMonthShortLabel(selectedMonthDate)

  const periodLabel = timeRange === 'daily'
    ? (selectedDailyDate === todayKey ? "Today's" : selectedDailyLabel)
    : timeRange === 'weekly'
      ? (selectedWeekStart === currentWeekKey ? "This Week's" : selectedWeekLabel)
      : timeRange === 'monthly'
        ? (selectedMonth === currentMonthKey ? "This Month's" : selectedMonthLabel)
        : timeRange === 'yearly'
          ? (selectedYear === currentYear ? "This Year's" : String(selectedYear))
          : 'Selected Period'
  const comparisonLabel = timeRange === 'daily'
    ? (selectedDailyDate === todayKey ? 'vs yesterday to now' : 'vs previous day')
    : timeRange === 'weekly'
      ? (selectedWeekStart === currentWeekKey ? 'vs last week to now' : 'vs previous week')
      : timeRange === 'monthly'
        ? (selectedMonth === currentMonthKey ? 'vs last month to date' : 'vs previous month')
        : timeRange === 'yearly'
          ? (selectedYear === currentYear ? 'vs last year to date' : 'vs previous year')
          : 'vs previous period'

  const statCards = [
    {
      label: `${periodLabel} Revenue`,
      value: formatCurrency(analytics?.periodRevenue || 0),
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-900/30',
      sub: analytics ? (
        <span className={`inline-flex items-center font-medium ${analytics.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {analytics.revenueGrowth >= 0 ? '↑' : '↓'} {Math.abs(analytics.revenueGrowth)}% {comparisonLabel}
        </span>
      ) : 'Paid orders',
    },
    {
      label: 'Average Order Value',
      value: formatCurrency(analytics?.aov || 0),
      icon: Zap,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/30',
      sub: 'Per completed order',
    },
    {
      label: 'Order Completion Rate',
      value: `${analytics?.completionRate || 100}%`,
      icon: Percent,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-900/30',
      sub: `${analytics?.totalOrders || 0} total orders`,
    },
  ]

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{shop?.name ? `${shop.name}'s performance overview` : "Your shop's performance overview"}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Time range selector */}
          <div ref={rangeSelectorRef} className="relative flex flex-wrap items-center gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => selectPeriod('daily')}
              aria-haspopup="true"
              aria-expanded={openPicker === 'daily'}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeRange === 'daily'
                  ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {selectedDailyDate === todayKey ? 'Daily' : selectedDailyLabel}
              <ChevronDown size={12} className={`transition-transform ${openPicker === 'daily' ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={() => selectPeriod('weekly')}
              aria-haspopup="true"
              aria-expanded={openPicker === 'weekly'}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeRange === 'weekly'
                  ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {selectedWeekStart === currentWeekKey ? 'Weekly' : selectedWeekLabel}
              <ChevronDown size={12} className={`transition-transform ${openPicker === 'weekly' ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={() => selectPeriod('monthly')}
              aria-haspopup="true"
              aria-expanded={openPicker === 'monthly'}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                timeRange === 'monthly'
                  ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              {selectedMonth === currentMonthKey ? 'Monthly' : selectedMonthShortLabel}
              <ChevronDown size={12} className={`transition-transform ${openPicker === 'monthly' ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={() => selectPeriod('yearly')}
              aria-haspopup="true"
              aria-expanded={openPicker === 'yearly'}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${timeRange === 'yearly' ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
            >
              {selectedYear === currentYear ? 'Yearly' : String(selectedYear)}
              <ChevronDown size={12} className={`transition-transform ${openPicker === 'yearly' ? 'rotate-180' : ''}`} />
            </button>
            {openPicker === 'daily' && (
              <div className="absolute left-0 top-full mt-2 z-50 w-72 p-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl space-y-3">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Choose a date</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous day"
                    onClick={() => setSelectedDailyDate(localDateKey(addCalendarDays(new Date(`${selectedDailyDate}T00:00:00`), -1)))}
                    className="shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <DatePicker
                      value={selectedDailyDate}
                      displayLabel={selectedDailyShortLabel}
                      hideClear
                      onChange={(value) => {
                        setSelectedDailyDate(value || todayKey)
                        setTimeRange('daily')
                        setOpenPicker(null)
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Next day"
                    disabled={selectedDailyDate === todayKey}
                    onClick={() => setSelectedDailyDate(localDateKey(addCalendarDays(new Date(`${selectedDailyDate}T00:00:00`), 1)))}
                    className="shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                {selectedDailyDate !== todayKey && (
                  <button
                    onClick={() => { setSelectedDailyDate(todayKey); setOpenPicker(null) }}
                    className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-slate-700"
                  >
                    Today
                  </button>
                )}
              </div>
            )}
            {openPicker === 'weekly' && (
              <div className="absolute left-0 top-full mt-2 z-50 w-72 p-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl space-y-3">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Choose a week</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous week"
                    onClick={() => setSelectedWeekStart(localDateKey(addCalendarDays(new Date(`${selectedWeekStart}T00:00:00`), -7)))}
                    className="shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <DatePicker
                      value={selectedWeekStart}
                      displayLabel={selectedWeekLabel}
                      hideClear
                      onChange={(pickedDate) => {
                        if (!pickedDate) return
                        setSelectedWeekStart(localDateKey(startOfWeekLocal(new Date(`${pickedDate}T00:00:00`))))
                        setTimeRange('weekly')
                        setOpenPicker(null)
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Next week"
                    disabled={selectedWeekStart === currentWeekKey}
                    onClick={() => setSelectedWeekStart(localDateKey(addCalendarDays(new Date(`${selectedWeekStart}T00:00:00`), 7)))}
                    className="shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                {selectedWeekStart !== currentWeekKey && (
                  <button
                    onClick={() => { setSelectedWeekStart(currentWeekKey); setOpenPicker(null) }}
                    className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-slate-700"
                  >
                    This week
                  </button>
                )}
              </div>
            )}
            {openPicker === 'monthly' && (
              <div className="absolute left-0 top-full mt-2 z-50 w-72 p-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl space-y-3">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Choose a month</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, -1))}
                    className="shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <DatePicker
                      value={`${selectedMonth}-01`}
                      displayLabel={selectedMonthLabel}
                      hideClear
                      onChange={(pickedDate) => {
                        if (!pickedDate) return
                        setSelectedMonth(monthKey(new Date(`${pickedDate}T00:00:00`)))
                        setTimeRange('monthly')
                        setOpenPicker(null)
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Next month"
                    disabled={selectedMonth === currentMonthKey}
                    onClick={() => setSelectedMonth(shiftMonthKey(selectedMonth, 1))}
                    className="shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                {selectedMonth !== currentMonthKey && (
                  <button
                    onClick={() => { setSelectedMonth(currentMonthKey); setOpenPicker(null) }}
                    className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-slate-700"
                  >
                    This month
                  </button>
                )}
              </div>
            )}
            {openPicker === 'yearly' && (
              <div className="absolute left-0 top-full mt-2 z-50 w-72 p-4 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl space-y-3">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Choose a year</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous year"
                    onClick={() => setSelectedYear((year) => year - 1)}
                    className="shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <DatePicker
                      value={`${selectedYear}-01-01`}
                      displayLabel={String(selectedYear)}
                      hideClear
                      onChange={(pickedDate) => {
                        if (!pickedDate) return
                        setSelectedYear(new Date(`${pickedDate}T00:00:00`).getFullYear())
                        setTimeRange('yearly')
                        setOpenPicker(null)
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Next year"
                    disabled={selectedYear === currentYear}
                    onClick={() => setSelectedYear((year) => year + 1)}
                    className="shrink-0 p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                {selectedYear !== currentYear && (
                  <button
                    onClick={() => { setSelectedYear(currentYear); setOpenPicker(null) }}
                    className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-slate-700"
                  >
                    This year
                  </button>
                )}
              </div>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading} className="gap-1.5 text-sm">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading
          ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          : statCards.map(({ label, value, icon: Icon, color, bg, sub }) => (
              <Card key={label}>
                <CardContent className="p-5">
                  <div className={`inline-flex p-2.5 rounded-xl ${bg} mb-3`}>
                    <Icon size={20} className={color} />
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">{label}</p>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</div>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Main Revenue & Order Volume Chart */}
      <Card>
        <CardContent className="p-6">
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <BarChart3 className="text-orange-500" size={20} />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Revenue & Sales Trends</h3>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Track financial growth and identify peak sales periods</p>
          </div>

          {loading ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics?.chartData || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.9} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" opacity={0.5} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#64748B' }}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                  <Tooltip
                    cursor={{ fill: '#f97316', fillOpacity: 0.08 }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-3 rounded-xl shadow-xl text-xs space-y-1">
                            <p className="font-semibold text-gray-500 dark:text-slate-400">
                              {timeRange === 'daily' ? `Time: ${data.label}` : `Date: ${data.label}`}
                            </p>
                            <p className="text-orange-600 dark:text-orange-400 font-bold">Revenue: {formatCurrency(data.revenue)}</p>
                            <p className="text-gray-600 dark:text-gray-300">Orders: {data.orders}</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Bar dataKey="revenue" fill="url(#colorRevenue)" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Two column grid: Top Selling Items & Payment/Channel Distributions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Best-Selling Items */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Flame className="text-orange-500" size={20} />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Top 5 Best-Selling Items</h3>
            </div>

            {loading ? (
              <Skeleton className="h-56 w-full rounded-xl" />
            ) : !analytics?.topItems || analytics.topItems.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">No sales data available yet</div>
            ) : (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.topItems} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={110} tick={{ fontSize: 11, fill: '#64748B' }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const d = payload[0].payload
                          return (
                            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-2.5 rounded-xl shadow-lg text-xs">
                              <p className="font-semibold text-gray-900 dark:text-white mb-0.5">{d.name}</p>
                              <p className="text-orange-600 dark:text-orange-400">{d.quantity} sold ({formatCurrency(d.revenue)})</p>
                            </div>
                          )
                        }
                        return null
                      }}
                      cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                    />
                    <Bar dataKey="quantity" fill="#f97316" radius={[0, 8, 8, 0]} barSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Channels & Payment Preference Breakdown */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <PieChartIcon className="text-purple-500" size={20} />
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">Channels & Payments</h3>
            </div>

            {loading ? (
              <Skeleton className="h-56 w-full rounded-xl" />
            ) : (
              <div className="grid grid-cols-2 gap-4 h-56 items-center">
                {/* Channel Donut */}
                <div className="flex flex-col items-center">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Order Source</p>
                  <div className="h-36 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics?.orderSourceSplit || []}
                          innerRadius={30}
                          outerRadius={50}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {(analytics?.orderSourceSplit || []).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload
                              return (
                                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-2 rounded-lg shadow-lg text-xs">
                                  <p className="text-gray-900 dark:text-white font-medium">{d.name} : <span className="text-orange-600 dark:text-orange-400 font-bold">{d.value}</span></p>
                                </div>
                              )
                            }
                            return null
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-gray-600 dark:text-gray-300">
                    {(analytics?.orderSourceSplit || []).map((s) => (
                      <span key={s.name} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name} ({s.value})
                      </span>
                    ))}
                  </div>
                </div>

                {/* Payment Method Donut */}
                <div className="flex flex-col items-center">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Payment Method</p>
                  <div className="h-36 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={analytics?.paymentSplit || []}
                          innerRadius={30}
                          outerRadius={50}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {(analytics?.paymentSplit || []).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload
                              return (
                                <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-2 rounded-lg shadow-lg text-xs">
                                  <p className="text-gray-900 dark:text-white font-medium">{d.name} : <span className="text-orange-600 dark:text-orange-400 font-bold">{d.value}</span></p>
                                </div>
                              )
                            }
                            return null
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-gray-600 dark:text-gray-300">
                    {(analytics?.paymentSplit || []).map((s) => (
                      <span key={s.name} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        {s.name} ({s.value})
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>



      {/* Low stock alert */}
      {!loading && lowStockItems.length > 0 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-orange-600 dark:text-orange-400" />
                <span className="font-semibold text-orange-900 dark:text-orange-300 text-sm">Low Stock Alert</span>
                <span className="text-xs bg-orange-200 dark:bg-orange-800 text-orange-800 dark:text-orange-200 px-1.5 py-0.5 rounded-full">{lowStockItems.length}</span>
              </div>
              <Link to="/dashboard/stock" className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 font-medium flex items-center gap-0.5">
                Manage <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-1.5">
              {lowStockItems.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700 dark:text-gray-300">{item.name}</span>
                  <span className={`font-semibold ${item.stock_quantity === 0 ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'}`}>
                    {item.stock_quantity === 0 ? 'Out of stock' : `${item.stock_quantity} left`}
                  </span>
                </div>
              ))}
              {lowStockItems.length > 5 && (
                <p className="text-xs text-orange-600 dark:text-orange-400">+{lowStockItems.length - 5} more items low on stock</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}


    </div>
  )
}

function isCompleted(o: AnalyticsOrder) {
  return o.status === 'completed' || o.status === 'ready'
}

function processAnalytics(orders: AnalyticsOrder[], boundaries: PeriodBoundaries): AnalyticsData {
  const { currentStart, currentEnd, previousStart, previousEnd } = boundaries

  const currentOrders = orders.filter((o) => {
    const createdAt = new Date(o.created_at)
    return createdAt >= currentStart && createdAt < currentEnd
  })
  const previousOrders = orders.filter((o) => {
    const d = new Date(o.created_at)
    return d >= previousStart && d < previousEnd
  })

  const completedCurrent = currentOrders.filter(isCompleted)
  const periodRevenue = completedCurrent.reduce((sum, o) => sum + (o.total || 0), 0)
  const previousRevenue = previousOrders.filter(isCompleted).reduce((sum, o) => sum + (o.total || 0), 0)

  const aov = completedCurrent.length > 0 ? Math.round((periodRevenue / completedCurrent.length) * 100) / 100 : 0
  const completionRate = currentOrders.length > 0 ? Math.round((completedCurrent.length / currentOrders.length) * 100) : 100

  let revenueGrowth = 0
  if (previousRevenue > 0) {
    revenueGrowth = Math.round(((periodRevenue - previousRevenue) / previousRevenue) * 100)
  } else if (periodRevenue > 0) {
    revenueGrowth = 100
  }

  const chartData = buildChartData(currentOrders, boundaries)

  // Top Items
  const itemsMap: Record<string, { name: string; quantity: number; revenue: number }> = {}
  completedCurrent.forEach((o) => {
    const items = o.order_items || []
    items.forEach((item: any) => {
      if (!itemsMap[item.name]) {
        itemsMap[item.name] = { name: item.name, quantity: 0, revenue: 0 }
      }
      itemsMap[item.name].quantity += item.quantity || 1
      itemsMap[item.name].revenue += item.subtotal || 0
    })
  })

  const topItems = Object.values(itemsMap)
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 5)

  // Order Sources & Payments
  let qrCount = 0
  let walkinCount = 0
  let upiCount = 0
  let cashCount = 0

  currentOrders.forEach((o) => {
    if (o.order_source === 'walkin') walkinCount++
    else qrCount++

    if (o.payment_method === 'upi') upiCount++
    else cashCount++
  })

  const orderSourceSplit = [
    { name: 'QR Menu', value: qrCount, color: '#f97316' },
    { name: 'Walk-in', value: walkinCount, color: '#6366f1' },
  ]

  const paymentSplit = [
    { name: 'UPI', value: upiCount, color: '#10b981' },
    { name: 'Cash', value: cashCount, color: '#a855f7' },
  ]

  return {
    periodRevenue: Math.round(periodRevenue),
    revenueGrowth,
    aov,
    completionRate,
    totalOrders: currentOrders.length,
    chartData,
    topItems,
    orderSourceSplit,
    paymentSplit,
  }
}
