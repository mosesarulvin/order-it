import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, ShoppingBag, Clock, CheckCircle, ArrowRight, UtensilsCrossed, Flame, Package } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, formatTime, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import type { MenuItem, Order, DashboardStats } from '@/types'
import type { RealtimeChannel } from '@supabase/supabase-js'

export default function DashboardHome() {
  const { shop } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [lowStockItems, setLowStockItems] = useState<MenuItem[]>([])
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

    const [statsRes, ordersRes, lowStockRes] = await Promise.all([
      supabase.rpc('get_dashboard_stats', { p_shop_id: shop.id }),
      supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })
        .limit(5),
      supabase
        .from('menu_items')
        .select('*')
        .eq('shop_id', shop.id)
        .not('stock_quantity', 'is', null),
    ])

    if (statsRes.data) {
      setStats(statsRes.data as DashboardStats)
    }

    setRecentOrders((ordersRes.data as Order[]) || [])
    const allTracked = (lowStockRes.data as MenuItem[]) || []
    setLowStockItems(allTracked.filter((i) => i.stock_quantity !== null && i.stock_quantity <= i.low_stock_threshold))
    setLoading(false)
  }

  const statCards = [
    {
      label: "Today's Revenue",
      value: formatCurrency(stats?.today_revenue || 0),
      icon: TrendingUp,
      color: 'text-green-600 dark:text-green-400',
      bg: 'bg-green-50 dark:bg-green-900/30',
      sub: 'Paid orders today',
    },
    {
      label: 'Total Orders',
      value: stats?.total_orders || 0,
      icon: ShoppingBag,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/30',
      sub: 'All time',
    },
    {
      label: 'Active Orders',
      value: stats?.pending_orders || 0,
      icon: Clock,
      color: 'text-orange-600 dark:text-orange-400',
      bg: 'bg-orange-50 dark:bg-orange-900/30',
      sub: 'Pending / preparing',
    },
    {
      label: 'Total Revenue',
      value: formatCurrency(stats?.total_revenue || 0),
      icon: CheckCircle,
      color: 'text-purple-600 dark:text-purple-400',
      bg: 'bg-purple-50 dark:bg-purple-900/30',
      sub: 'Last 90 days',
    },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-6 text-white shadow-lg shadow-orange-100 dark:shadow-orange-900/30">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Good {getGreeting()}, {shop?.name}! 👋</h2>
            <p className="text-orange-100 mt-1">Here's what's happening at your shop today.</p>
          </div>
          <div className="hidden sm:flex w-16 h-16 bg-white/20 rounded-2xl items-center justify-center">
            <UtensilsCrossed size={32} className="text-white" />
          </div>
        </div>
      </div>

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
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>
                </CardContent>
              </Card>
            ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link to="/dashboard/menu" className="group">
          <Card hover className="h-full">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                <UtensilsCrossed size={22} className="text-orange-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">Manage Menu</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Add or update items</p>
              </div>
              <ArrowRight size={16} className="text-gray-300 group-hover:text-orange-400 transition-colors" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/dashboard/kitchen" className="group">
          <Card hover className="h-full">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center group-hover:bg-red-100 transition-colors">
                <Flame size={22} className="text-red-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">Kitchen View</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Live order feed</p>
              </div>
              <ArrowRight size={16} className="text-gray-300 group-hover:text-red-400 transition-colors" />
            </CardContent>
          </Card>
        </Link>
        <Link to="/dashboard/qr" className="group">
          <Card hover className="h-full">
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center group-hover:bg-purple-100 transition-colors">
                <ShoppingBag size={22} className="text-purple-500" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 dark:text-white">Get QR Code</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Print for your shop</p>
              </div>
              <ArrowRight size={16} className="text-gray-300 group-hover:text-purple-400 transition-colors" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Low stock alert */}
      {!loading && lowStockItems.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Package size={16} className="text-orange-600" />
                <span className="font-semibold text-orange-900 text-sm">Low Stock Alert</span>
                <span className="text-xs bg-orange-200 text-orange-800 px-1.5 py-0.5 rounded-full">{lowStockItems.length}</span>
              </div>
              <Link to="/dashboard/stock" className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-0.5">
                Manage <ArrowRight size={12} />
              </Link>
            </div>
            <div className="space-y-1.5">
              {lowStockItems.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{item.name}</span>
                  <span className={`font-semibold ${item.stock_quantity === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                    {item.stock_quantity === 0 ? 'Out of stock' : `${item.stock_quantity} left`}
                  </span>
                </div>
              ))}
              {lowStockItems.length > 5 && (
                <p className="text-xs text-orange-600">+{lowStockItems.length - 5} more items low on stock</p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent orders */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Orders</h3>
          <Link to="/dashboard/orders" className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1">
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : recentOrders.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShoppingBag size={40} className="text-gray-200 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No orders yet</p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Share your QR code to start receiving orders</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {recentOrders.map((order) => (
              <Card key={order.id}>
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ShoppingBag size={18} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900 dark:text-white text-sm">{order.order_number}</span>
                      {order.order_source === 'walkin' && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">Walk-in</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getOrderStatusColor(order.status)}`}>
                        {getOrderStatusLabel(order.status)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{order.customer_name} · {formatTime(order.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 dark:text-white text-sm">{formatCurrency(order.total)}</p>
                    <p className="text-xs text-gray-400 capitalize">{order.payment_method}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
