import { useEffect, useRef, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  TrendingUp,
  ArrowRight,
  Flame,
  Package,
  Star,
  Zap,
  BarChart3,
  PieChart as PieChartIcon,
  Percent
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
import type { MenuItem, DashboardStats } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

type TimeRange = 'hourly' | '7days' | '30days'

interface ChartPoint {
  label: string
  revenue: number
  orders: number
}

interface AnalyticsData {
  aov: number
  completionRate: number
  yesterdayRevenue: number
  revenueGrowth: number
  avgRating: number
  totalReviews: number
  hourlyData: ChartPoint[]
  sevenDaysData: ChartPoint[]
  thirtyDaysData: ChartPoint[]
  topItems: { name: string; quantity: number; revenue: number }[]
  orderSourceSplit: { name: string; value: number; color: string }[]
  paymentSplit: { name: string; value: number; color: string }[]
}

export default function DashboardHome() {
  const { shop } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [lowStockItems, setLowStockItems] = useState<MenuItem[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange>('7days')
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (!shop) return
    fetchData()
    // Subscribe to order changes so stats update live
    const channel = supabase
      .channel(`dashboard-${shop.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `shop_id=eq.${shop.id}` }, () => {
        fetchData()
      })
      .subscribe()
    channelRef.current = channel
    return () => { channel.unsubscribe() }
  }, [shop])

  const fetchData = async () => {
    if (!shop) return
    setLoading(true)

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const [statsRes, lowStockRes, allOrdersRes, reviewsRes] = await Promise.all([
      supabase.rpc('get_dashboard_stats', { p_shop_id: shop.id }),
      supabase
        .from('menu_items')
        .select('*')
        .eq('shop_id', shop.id)
        .not('stock_quantity', 'is', null),
      supabase
        .from('orders')
        .select('id, total, status, payment_method, order_source, created_at, order_items(name, quantity, subtotal)')
        .eq('shop_id', shop.id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true }),
      supabase
        .from('reviews')
        .select('rating')
        .eq('shop_id', shop.id)
    ])

    if (statsRes.data) {
      setStats(statsRes.data as DashboardStats)
    }

    const allTracked = (lowStockRes.data as MenuItem[]) || []
    setLowStockItems(allTracked.filter((i) => i.stock_quantity !== null && i.stock_quantity <= i.low_stock_threshold))

    // Process analytics data
    const ordersList = allOrdersRes.data || []
    const reviewsList = reviewsRes.data || []

    const computedAnalytics = processAnalytics(ordersList, reviewsList)
    setAnalytics(computedAnalytics)
    setLoading(false)
  }

  const chartData = useMemo(() => {
    if (!analytics) return []
    if (timeRange === 'hourly') return analytics.hourlyData
    if (timeRange === '30days') return analytics.thirtyDaysData
    return analytics.sevenDaysData
  }, [analytics, timeRange])

  const statCards = [
    {
      label: "Today's Revenue",
      value: formatCurrency(stats?.today_revenue || 0),
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-900/30',
      sub: analytics ? (
        <span className={`inline-flex items-center font-medium ${analytics.revenueGrowth >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {analytics.revenueGrowth >= 0 ? '↑' : '↓'} {Math.abs(analytics.revenueGrowth)}% vs yesterday
        </span>
      ) : 'Paid orders today',
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
      sub: `${stats?.total_orders || 0} total orders`,
    },
    {
      label: 'Customer Rating (CSAT)',
      value: analytics?.avgRating ? `${analytics.avgRating.toFixed(1)} / 5.0` : 'N/A',
      icon: Star,
      color: 'text-amber-500 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/30',
      sub: analytics?.totalReviews ? `Based on ${analytics.totalReviews} reviews` : 'No reviews yet',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
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
                onClick={() => setTimeRange('hourly')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  timeRange === 'hourly'
                    ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                Today (Rush Hours)
              </button>
              <button
                onClick={() => setTimeRange('7days')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  timeRange === '7days'
                    ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                Last 7 Days
              </button>
              <button
                onClick={() => setTimeRange('30days')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  timeRange === '30days'
                    ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                }`}
              >
                Last 30 Days
              </button>
            </div>
          </div>

          {loading ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
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
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs space-y-1">
                            <p className="font-semibold text-slate-300">
                              {timeRange === 'hourly' ? `Time: ${data.label}` : `Date: ${data.label}`}
                            </p>
                            <p className="text-orange-400 font-bold">Revenue: {formatCurrency(data.revenue)}</p>
                            <p className="text-slate-300">Orders: {data.orders}</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#f97316"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorRevenue)"
                  />
                </AreaChart>
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
                            <div className="bg-slate-900 text-white p-2.5 rounded-xl shadow-lg text-xs">
                              <p className="font-semibold">{d.name}</p>
                              <p className="text-orange-400">{d.quantity} sold ({formatCurrency(d.revenue)})</p>
                            </div>
                          )
                        }
                        return null
                      }}
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
                        <Tooltip />
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
                        <Tooltip />
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

function processAnalytics(orders: any[], reviews: any[]): AnalyticsData {
  const totalOrdersCount = orders.length
  const completedOrders = orders.filter((o) => o.status === 'completed' || o.status === 'ready')
  const completedCount = completedOrders.length
  const totalRevenue = completedOrders.reduce((sum, o) => sum + (o.total || 0), 0)

  // Average Order Value
  const aov = completedCount > 0 ? Math.round((totalRevenue / completedCount) * 100) / 100 : 0

  // Completion Rate
  const completionRate = totalOrdersCount > 0 ? Math.round((completedCount / totalOrdersCount) * 100) : 100

  // Today & Yesterday revenue growth
  const todayStr = new Date().toISOString().split('T')[0]
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  let todayRev = 0
  let yesterdayRev = 0

  orders.forEach((o) => {
    if (o.status !== 'completed' && o.status !== 'ready') return
    const dateStr = new Date(o.created_at).toISOString().split('T')[0]
    if (dateStr === todayStr) todayRev += o.total || 0
    if (dateStr === yesterdayStr) yesterdayRev += o.total || 0
  })

  let revenueGrowth = 0
  if (yesterdayRev > 0) {
    revenueGrowth = Math.round(((todayRev - yesterdayRev) / yesterdayRev) * 100)
  } else if (todayRev > 0) {
    revenueGrowth = 100
  }

  // Hourly Data (Today 00:00 to 23:00)
  const hourlyMap: Record<number, { revenue: number; orders: number }> = {}
  for (let i = 8; i <= 22; i++) {
    hourlyMap[i] = { revenue: 0, orders: 0 }
  }

  orders.forEach((o) => {
    const oDate = new Date(o.created_at)
    if (oDate.toISOString().split('T')[0] === todayStr) {
      const hour = oDate.getHours()
      if (hourlyMap[hour] !== undefined) {
        if (o.status === 'completed' || o.status === 'ready') {
          hourlyMap[hour].revenue += o.total || 0
        }
        hourlyMap[hour].orders += 1
      }
    }
  })

  const hourlyData = Object.keys(hourlyMap).map((hKey) => {
    const h = parseInt(hKey, 10)
    const ampm = h >= 12 ? 'PM' : 'AM'
    const displayHour = h % 12 === 0 ? 12 : h % 12
    return {
      label: `${displayHour} ${ampm}`,
      revenue: Math.round(hourlyMap[h].revenue),
      orders: hourlyMap[h].orders,
    }
  })

  // 7 Days & 30 Days Data
  const last7DaysMap: Record<string, { revenue: number; orders: number }> = {}
  const last30DaysMap: Record<string, { revenue: number; orders: number }> = {}

  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    last7DaysMap[key] = { revenue: 0, orders: 0 }
  }

  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    last30DaysMap[key] = { revenue: 0, orders: 0 }
  }

  orders.forEach((o) => {
    const key = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    if (last7DaysMap[key]) {
      if (o.status === 'completed' || o.status === 'ready') {
        last7DaysMap[key].revenue += o.total || 0
      }
      last7DaysMap[key].orders += 1
    }
    if (last30DaysMap[key]) {
      if (o.status === 'completed' || o.status === 'ready') {
        last30DaysMap[key].revenue += o.total || 0
      }
      last30DaysMap[key].orders += 1
    }
  })

  const sevenDaysData = Object.keys(last7DaysMap).map((date) => ({
    label: date,
    revenue: Math.round(last7DaysMap[date].revenue),
    orders: last7DaysMap[date].orders,
  }))

  const thirtyDaysData = Object.keys(last30DaysMap).map((date) => ({
    label: date,
    revenue: Math.round(last30DaysMap[date].revenue),
    orders: last30DaysMap[date].orders,
  }))

  // Top Items
  const itemsMap: Record<string, { name: string; quantity: number; revenue: number }> = {}
  orders.forEach((o) => {
    if (o.status !== 'completed' && o.status !== 'ready') return
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

  orders.forEach((o) => {
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

  // Rating CSAT
  const totalReviews = reviews.length
  const avgRating = totalReviews > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews : 0

  return {
    aov,
    completionRate,
    yesterdayRevenue: Math.round(yesterdayRev),
    revenueGrowth,
    avgRating,
    totalReviews,
    hourlyData,
    sevenDaysData,
    thirtyDaysData,
    topItems,
    orderSourceSplit,
    paymentSplit,
  }
}
