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
  Percent
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
import { Skeleton } from '@/components/ui/Skeleton'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { captureException } from '@/lib/observability'
import type { MenuItem } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

type TimeRange = 'daily' | 'weekly' | 'monthly'

interface ChartPoint {
  label: string
  revenue: number
  orders: number
}

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

// Current period is the selected range ending now; previous period is the equivalent range right before it (for growth comparison).
function getPeriodBoundaries(timeRange: TimeRange, now: Date = new Date()) {
  if (timeRange === 'daily') {
    const currentStart = new Date(now)
    currentStart.setHours(0, 0, 0, 0)
    const previousStart = new Date(currentStart)
    previousStart.setDate(previousStart.getDate() - 1)
    return { currentStart, previousStart }
  }
  const rangeDays = timeRange === 'weekly' ? 7 : 30
  const currentStart = new Date(now)
  currentStart.setDate(currentStart.getDate() - rangeDays)
  const previousStart = new Date(currentStart)
  previousStart.setDate(previousStart.getDate() - rangeDays)
  return { currentStart, previousStart }
}

export default function DashboardHome() {
  const { shop } = useAuth()
  const [lowStockItems, setLowStockItems] = useState<MenuItem[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('weekly')
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const fetchDataRef = useRef<(() => Promise<void>) | undefined>(undefined)

  // Re-fetch whenever the selected range changes so the query window matches what's displayed.
  useEffect(() => {
    if (!shop) return
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, timeRange])

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

    const { previousStart } = getPeriodBoundaries(timeRange)

    const [lowStockRes, ordersRes] = await Promise.all([
      supabase
        .from('menu_items')
        .select('id, shop_id, name, stock_quantity, low_stock_threshold, is_available, price')
        .eq('shop_id', shop.id)
        .not('stock_quantity', 'is', null),
      supabase
        .from('orders')
        .select('id, total, status, payment_method, order_source, created_at, order_items(name, quantity, subtotal)')
        .eq('shop_id', shop.id)
        .gte('created_at', previousStart.toISOString())
        .order('created_at', { ascending: true })
        .limit(2000),
    ])

    if (ordersRes.error) captureException(ordersRes.error, { where: 'DashboardHome.orders' })

    const allTracked = (lowStockRes.data as MenuItem[]) || []
    setLowStockItems(allTracked.filter((i) => i.stock_quantity !== null && i.stock_quantity <= i.low_stock_threshold))

    const ordersList = ordersRes.data || []
    setAnalytics(processAnalytics(ordersList, timeRange))
    setLoading(false)
  }, [shop, timeRange])

  useEffect(() => { fetchDataRef.current = fetchData }, [fetchData])

  const debouncedRefresh = useDebouncedCallback((run: () => void) => run(), 400)

  const periodLabel = timeRange === 'daily' ? "Today's" : timeRange === 'weekly' ? "This Week's" : "This Month's"
  const comparisonLabel = timeRange === 'daily' ? 'vs yesterday' : timeRange === 'weekly' ? 'vs last week' : 'vs last month'

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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="text-orange-500" size={20} />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Revenue & Sales Trends</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Track financial growth and identify peak sales periods</p>
            </div>
            {/* Time range selector */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setTimeRange('daily')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  timeRange === 'daily'
                    ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Daily
              </button>
              <button
                onClick={() => setTimeRange('weekly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  timeRange === 'weekly'
                    ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Weekly
              </button>
              <button
                onClick={() => setTimeRange('monthly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  timeRange === 'monthly'
                    ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                Monthly
              </button>
            </div>
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

function isCompleted(o: any) {
  return o.status === 'completed' || o.status === 'ready'
}

// Builds the revenue/orders chart bins for the selected period: hourly for daily, daily buckets for weekly/monthly.
function buildChartData(currentOrders: any[], timeRange: TimeRange): ChartPoint[] {
  if (timeRange === 'daily') {
    const hourlyMap: Record<number, { revenue: number; orders: number }> = {}
    for (let i = 8; i <= 22; i++) hourlyMap[i] = { revenue: 0, orders: 0 }

    currentOrders.forEach((o) => {
      const hour = new Date(o.created_at).getHours()
      if (hourlyMap[hour] === undefined) return
      if (isCompleted(o)) hourlyMap[hour].revenue += o.total || 0
      hourlyMap[hour].orders += 1
    })

    return Object.keys(hourlyMap).map((hKey) => {
      const h = parseInt(hKey, 10)
      const ampm = h >= 12 ? 'PM' : 'AM'
      const displayHour = h % 12 === 0 ? 12 : h % 12
      return {
        label: `${displayHour} ${ampm}`,
        revenue: Math.round(hourlyMap[h].revenue),
        orders: hourlyMap[h].orders,
      }
    })
  }

  const days = timeRange === 'weekly' ? 7 : 30
  const dayMap = new Map<string, { revenue: number; orders: number }>()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    dayMap.set(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), { revenue: 0, orders: 0 })
  }

  currentOrders.forEach((o) => {
    const key = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const bucket = dayMap.get(key)
    if (!bucket) return
    if (isCompleted(o)) bucket.revenue += o.total || 0
    bucket.orders += 1
  })

  return Array.from(dayMap.entries()).map(([label, v]) => ({
    label,
    revenue: Math.round(v.revenue),
    orders: v.orders,
  }))
}

function processAnalytics(orders: any[], timeRange: TimeRange): AnalyticsData {
  const { currentStart, previousStart } = getPeriodBoundaries(timeRange)

  const currentOrders = orders.filter((o) => new Date(o.created_at) >= currentStart)
  const previousOrders = orders.filter((o) => {
    const d = new Date(o.created_at)
    return d >= previousStart && d < currentStart
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

  const chartData = buildChartData(currentOrders, timeRange)

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
