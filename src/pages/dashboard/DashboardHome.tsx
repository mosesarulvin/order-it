import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, ShoppingBag, Clock, CheckCircle, ArrowRight, UtensilsCrossed, Flame } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, formatTime, getOrderStatusColor, getOrderStatusLabel } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import type { Order, DashboardStats } from '@/types'

export default function DashboardHome() {
  const { shop } = useAuth()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!shop) return
    fetchData()
  }, [shop])

  const fetchData = async () => {
    if (!shop) return
    setLoading(true)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [statsRes, ordersRes] = await Promise.all([
      supabase
        .from('orders')
        .select('total, status, created_at')
        .eq('shop_id', shop.id),
      supabase
        .from('orders')
        .select('*, items:order_items(*)')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    if (statsRes.data) {
      const all = statsRes.data
      const todayOrders = all.filter((o) => new Date(o.created_at) >= today)
      setStats({
        total_orders: all.length,
        pending_orders: all.filter((o) => ['pending', 'confirmed', 'preparing'].includes(o.status)).length,
        today_revenue: todayOrders.reduce((s, o) => s + o.total, 0),
        total_revenue: all.reduce((s, o) => s + o.total, 0),
      })
    }

    setRecentOrders((ordersRes.data as Order[]) || [])
    setLoading(false)
  }

  const statCards = [
    {
      label: "Today's Revenue",
      value: formatCurrency(stats?.today_revenue || 0),
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
      sub: 'All paid orders today',
    },
    {
      label: 'Total Orders',
      value: stats?.total_orders || 0,
      icon: ShoppingBag,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      sub: 'All time',
    },
    {
      label: 'Active Orders',
      value: stats?.pending_orders || 0,
      icon: Clock,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      sub: 'Pending / preparing',
    },
    {
      label: 'Total Revenue',
      value: formatCurrency(stats?.total_revenue || 0),
      icon: CheckCircle,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      sub: 'All time',
    },
  ]

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Welcome banner */}
      <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-6 text-white shadow-lg shadow-orange-100">
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
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
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
                <p className="font-semibold text-gray-900">Manage Menu</p>
                <p className="text-sm text-gray-500">Add or update items</p>
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
                <p className="font-semibold text-gray-900">Kitchen View</p>
                <p className="text-sm text-gray-500">Live order feed</p>
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
                <p className="font-semibold text-gray-900">Get QR Code</p>
                <p className="text-sm text-gray-500">Print for your shop</p>
              </div>
              <ArrowRight size={16} className="text-gray-300 group-hover:text-purple-400 transition-colors" />
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent orders */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Recent Orders</h3>
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
              <ShoppingBag size={40} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No orders yet</p>
              <p className="text-sm text-gray-400 mt-1">Share your QR code to start receiving orders</p>
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
                      <span className="font-semibold text-gray-900 text-sm">{order.order_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getOrderStatusColor(order.status)}`}>
                        {getOrderStatusLabel(order.status)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{order.customer_name} · {formatTime(order.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900 text-sm">{formatCurrency(order.total)}</p>
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
