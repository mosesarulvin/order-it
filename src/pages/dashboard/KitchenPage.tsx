import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { OrderCardSkeleton } from '@/components/ui/Skeleton'
import { Bell, CheckCircle, Clock, ChefHat, RefreshCw } from 'lucide-react'
import type { Order, OrderStatus } from '@/types'
import toast from 'react-hot-toast'
import type { RealtimeChannel } from '@supabase/supabase-js'

const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready']

const STATUS_FLOW: Record<string, { next: OrderStatus; label: string; color: string }> = {
  pending: { next: 'confirmed', label: 'Confirm', color: 'bg-blue-500 text-white hover:bg-blue-600' },
  confirmed: { next: 'preparing', label: 'Start Cooking', color: 'bg-orange-500 text-white hover:bg-orange-600' },
  preparing: { next: 'ready', label: 'Mark Ready', color: 'bg-green-500 text-white hover:bg-green-600' },
  ready: { next: 'completed', label: 'Completed', color: 'bg-gray-500 text-white hover:bg-gray-600' },
}

const STATUS_COLUMNS: { key: OrderStatus; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'pending', label: 'New Orders', icon: Bell, color: 'text-yellow-500' },
  { key: 'preparing', label: 'Preparing', icon: ChefHat, color: 'text-orange-500' },
  { key: 'ready', label: 'Ready', icon: CheckCircle, color: 'text-green-500' },
]

export default function KitchenPage() {
  const { shop } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!shop) return
    fetchOrders()
    subscribeToOrders()

    return () => {
      channelRef.current?.unsubscribe()
    }
  }, [shop])

  const fetchOrders = async () => {
    if (!shop) return
    setLoading(true)
    const { data, error } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('shop_id', shop.id)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: true })
    if (error) console.error('Kitchen fetchOrders error:', error.message)
    setOrders((data as Order[]) || [])
    setLoading(false)
  }

  const subscribeToOrders = () => {
    if (!shop) return
    const channel = supabase
      .channel(`kitchen-${shop.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `shop_id=eq.${shop.id}` }, (payload) => {
        if (payload.eventType === 'INSERT') {
          fetchOrders()
          playNotification()
          toast('🛎️ New order received!', { icon: '🔔', style: { fontWeight: '600' } })
        } else if (payload.eventType === 'UPDATE') {
          fetchOrders()
        }
      })
      .subscribe()
    channelRef.current = channel
  }

  const playNotification = () => {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.4)
    } catch {
      // Audio context not available
    }
  }

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)
    if (error) { toast.error(error.message); return }
    if (status === 'completed') {
      setOrders((prev) => prev.filter((o) => o.id !== orderId))
    } else {
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status } : o))
    }
  }

  const cancelOrder = async (orderId: string) => {
    if (!confirm('Cancel this order?')) return
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId)
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
    toast.success('Order cancelled')
  }

  const getElapsedMinutes = (createdAt: string) => {
    return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Kitchen</h2>
          <p className="text-sm text-gray-500 mt-0.5">Live order feed · Auto-updates</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-full">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-medium text-green-700">Live</span>
          </div>
          <Button variant="outline" size="sm" onClick={fetchOrders}>
            <RefreshCw size={14} className="mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        {STATUS_COLUMNS.map(({ key, label, icon: Icon, color }) => {
          const count = orders.filter((o) => o.status === key || (key === 'preparing' && o.status === 'confirmed')).length
          return (
            <Card key={key}>
              <CardContent className="p-4 flex items-center gap-3">
                <Icon size={20} className={color} />
                <div>
                  <p className="text-2xl font-bold text-gray-900">{count}</p>
                  <p className="text-xs text-gray-500">{label}</p>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STATUS_COLUMNS.map(({ key, label, icon: Icon, color }) => {
          const colOrders = orders.filter((o) =>
            key === 'preparing' ? o.status === 'preparing' || o.status === 'confirmed' : o.status === key
          )
          return (
            <div key={key}>
              <div className="flex items-center gap-2 mb-3">
                <Icon size={16} className={color} />
                <h3 className="font-semibold text-gray-700 text-sm">{label}</h3>
                <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{colOrders.length}</span>
              </div>

              <div className="space-y-3">
                {loading ? (
                  <>
                    <OrderCardSkeleton />
                    <OrderCardSkeleton />
                  </>
                ) : colOrders.length === 0 ? (
                  <div className="bg-gray-50 rounded-2xl py-10 text-center text-sm text-gray-400">
                    <Clock size={24} className="mx-auto mb-2 text-gray-300" />
                    No orders here
                  </div>
                ) : (
                  colOrders.map((order) => {
                    const elapsed = getElapsedMinutes(order.created_at)
                    const isUrgent = elapsed > 10 && key !== 'ready'
                    const flow = STATUS_FLOW[order.status]

                    return (
                      <Card key={order.id} className={isUrgent ? 'border-red-200 ring-1 ring-red-100' : ''}>
                        <CardContent className="p-4 space-y-3">
                          {/* Header */}
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-bold text-gray-900">{order.order_number}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{order.customer_name}</p>
                            </div>
                            <div className="text-right">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isUrgent ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                {elapsed}m ago
                              </span>
                            </div>
                          </div>

                          {/* Items */}
                          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                            {order.items?.map((item) => (
                              <div key={item.id} className="flex justify-between text-sm">
                                <span className="text-gray-700 font-medium">{item.name}</span>
                                <span className="text-gray-500 font-semibold">×{item.quantity}</span>
                              </div>
                            ))}
                          </div>

                          {/* Payment */}
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span className="capitalize">{order.payment_method === 'cash' ? '💵 Cash' : '📱 UPI'}</span>
                            <span className="font-semibold text-gray-900">{formatCurrency(order.total)}</span>
                          </div>

                          {/* Actions */}
                          <div className="flex gap-2">
                            {flow && (
                              <button
                                onClick={() => updateStatus(order.id, flow.next)}
                                className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-colors ${flow.color}`}
                              >
                                {flow.label}
                              </button>
                            )}
                            <button
                              onClick={() => cancelOrder(order.id)}
                              className="px-3 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>
      <audio ref={audioRef} />
    </div>
  )
}
