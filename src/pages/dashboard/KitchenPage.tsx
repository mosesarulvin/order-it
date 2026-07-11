import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { OrderCardSkeleton } from '@/components/ui/Skeleton'
import { Bell, CheckCircle, Clock, ChefHat, RefreshCw, ArrowUpDown, Search, ChevronRight, ChevronLeft } from 'lucide-react'
import { CancelOrderModal } from '@/components/CancelOrderModal'
import type { Order, OrderStatus } from '@/types'
import toast from 'react-hot-toast'
import type { RealtimeChannel } from '@supabase/supabase-js'

const ACTIVE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready']

// All non-terminal statuses in order — used for prev/next navigation
const STATUS_ORDER: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready']

const STATUS_COLUMNS: { key: OrderStatus; label: string; icon: React.ElementType; color: string; bg: string }[] = [
  { key: 'pending',   label: 'New Orders', icon: Bell,        color: 'text-yellow-500', bg: 'bg-yellow-50' },
  { key: 'confirmed', label: 'Confirmed',  icon: CheckCircle, color: 'text-blue-500',   bg: 'bg-blue-50'   },
  { key: 'preparing', label: 'Preparing',  icon: ChefHat,     color: 'text-orange-500', bg: 'bg-orange-50' },
  { key: 'ready',     label: 'Ready',      icon: CheckCircle, color: 'text-green-500',  bg: 'bg-green-50'  },
]

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:   'New',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready:     'Ready',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

export default function KitchenPage() {
  const { shop } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'all'>('all')
  const [sortBy, setSortBy] = useState<'oldest' | 'newest' | 'payment'>('oldest')
  const [filterPayment, setFilterPayment] = useState<'all' | 'cash' | 'upi'>('all')
  const [search, setSearch] = useState('')
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const [dragOverCol, setDragOverCol] = useState<OrderStatus | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const dragOrderRef = useRef<Order | null>(null)

  useEffect(() => {
    if (!shop) return
    fetchOrders()
    subscribeToOrders()

    return () => {
      channelRef.current?.unsubscribe()
    }
  }, [shop])

  const fetchOrders = async (silent = false) => {
    if (!shop) return
    if (!silent) setLoading(true)
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
          fetchOrders(true)  // silent refresh — no skeleton
          playNotification()
          toast('🛎️ New order received!', { icon: '🔔', style: { fontWeight: '600' } })
        } else if (payload.eventType === 'UPDATE') {
          fetchOrders(true)  // silent refresh
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
    // Optimistic update
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status } : o))
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)
    if (error) {
      toast.error(error.message)
      // Revert on failure
      fetchOrders(true)
      return
    }
    if (status === 'completed') {
      setOrders((prev) => prev.filter((o) => o.id !== orderId))
      toast.success('Order completed ✓')
    }
  }

  // Drag handlers
  const onDragStart = (order: Order) => {
    dragOrderRef.current = order
  }
  const onDragOver = (e: React.DragEvent, col: OrderStatus) => {
    e.preventDefault()
    setDragOverCol(col)
  }
  const onDragLeave = () => setDragOverCol(null)
  const onDrop = async (e: React.DragEvent, targetStatus: OrderStatus) => {
    e.preventDefault()
    setDragOverCol(null)
    const order = dragOrderRef.current
    dragOrderRef.current = null
    if (!order || order.status === targetStatus) return
    if (targetStatus === 'cancelled') {
      setCancelTarget(order)
      return
    }
    await updateStatus(order.id, targetStatus)
    toast.success(`Moved to ${STATUS_LABELS[targetStatus]}`)
  }

  const cancelOrder = async (orderId: string, reason: string) => {
    await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: reason }).eq('id', orderId)
    setOrders((prev) => prev.filter((o) => o.id !== orderId))
    toast.success('Order cancelled')
  }

  const markAsPaid = async (orderId: string) => {
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, payment_status: 'paid' } : o))
    const { error } = await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', orderId)
    if (error) { toast.error(error.message); setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, payment_status: 'pending' } : o)); return }
    toast.success('Marked as paid ✓')
  }

  const markAsUnpaid = async (orderId: string) => {
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, payment_status: 'pending' } : o))
    const { error } = await supabase.from('orders').update({ payment_status: 'pending' }).eq('id', orderId)
    if (error) { toast.error(error.message); setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, payment_status: 'paid' } : o)); return }
    toast.success('Payment reverted')
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
          <Button variant="outline" size="sm" onClick={() => fetchOrders()}>
            <RefreshCw size={14} className="mr-1.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Filter + sort strip */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search by order number */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search order #..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-8 pr-3 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 w-40"
          />
        </div>
        {/* Status filter */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {([['all', 'All'], ['pending', 'New'], ['confirmed', 'Confirmed'], ['preparing', 'Preparing'], ['ready', 'Ready']] as [OrderStatus | 'all', string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterStatus(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterStatus === val ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
              {val !== 'all' && (
                <span className="ml-1.5 text-gray-400">{orders.filter((o) => o.status === val).length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Payment filter */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          {([['all', 'All payments'], ['cash', '💵 Cash'], ['upi', '📱 UPI']] as ['all' | 'cash' | 'upi', string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterPayment(val)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filterPayment === val ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-1 ml-auto">
          <ArrowUpDown size={13} className="text-gray-400" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs font-medium text-gray-600 bg-transparent border-none outline-none cursor-pointer"
          >
            <option value="oldest">Oldest first</option>
            <option value="newest">Newest first</option>
            <option value="payment">Unpaid first</option>
          </select>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {STATUS_COLUMNS.map(({ key, label, icon: Icon, color }) => {
          const count = orders.filter((o) => o.status === key).length
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {STATUS_COLUMNS.filter((col) => filterStatus === 'all' || col.key === filterStatus).map(({ key, label, icon: Icon, color, bg }) => {
          let colOrders = orders.filter((o) => o.status === key)
          if (filterPayment !== 'all') colOrders = colOrders.filter((o) => o.payment_method === filterPayment)
          if (search.trim()) colOrders = colOrders.filter((o) =>
            o.order_number.toLowerCase().includes(search.toLowerCase()) ||
            o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
            o.customer_phone.includes(search)
          )
          colOrders = [...colOrders].sort((a, b) => {
            if (sortBy === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            if (sortBy === 'payment') {
              if (a.payment_status !== 'paid' && b.payment_status === 'paid') return -1
              if (a.payment_status === 'paid' && b.payment_status !== 'paid') return 1
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          })

          const isDragOver = dragOverCol === key

          return (
            <div
              key={key}
              onDragOver={(e) => onDragOver(e, key)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, key)}
              className={`rounded-2xl transition-all duration-150 ${isDragOver ? `ring-2 ring-offset-1 ${bg} ring-current ${color}` : ''}`}
            >
              <div className="flex items-center gap-2 mb-3 px-1">
                <Icon size={16} className={color} />
                <h3 className="font-semibold text-gray-700 text-sm">{label}</h3>
                <span className="ml-auto text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{colOrders.length}</span>
              </div>

              <div className="space-y-3 min-h-[80px]">
                {loading ? (
                  <>
                    <OrderCardSkeleton />
                    <OrderCardSkeleton />
                  </>
                ) : colOrders.length === 0 ? (
                  <div className={`rounded-2xl py-10 text-center text-sm text-gray-400 border-2 border-dashed transition-all ${isDragOver ? 'border-current ' + color + ' bg-white/60' : 'border-gray-200 bg-gray-50'}`}>
                    <Clock size={24} className="mx-auto mb-2 text-gray-300" />
                    {isDragOver ? 'Drop here' : 'No orders here'}
                  </div>
                ) : (
                  colOrders.map((order) => {
                    const elapsed = getElapsedMinutes(order.created_at)
                    const isUrgent = elapsed > 10 && key !== 'ready'
                    const curIdx = STATUS_ORDER.indexOf(order.status)
                    const prevStatus = curIdx > 0 ? STATUS_ORDER[curIdx - 1] : null
                    const nextStatus = curIdx < STATUS_ORDER.length - 1 ? STATUS_ORDER[curIdx + 1] : null

                    return (
                      <Card
                        key={order.id}
                        draggable
                        onDragStart={() => onDragStart(order)}
                        className={`cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md ${isUrgent ? 'border-red-200 ring-1 ring-red-100' : ''}`}
                      >
                        <CardContent className="p-4 space-y-3">
                          {/* Header */}
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-bold text-gray-900">{order.order_number}</p>
                              <p className="text-xs text-gray-500 mt-0.5">{order.customer_name}</p>
                              {order.is_anonymous
                                ? <p className="text-xs text-blue-500 mt-0.5">🔒 Anonymous</p>
                                : <p className="text-xs text-gray-400 mt-0.5">📞 {order.customer_phone}</p>
                              }
                            </div>
                            <div className="text-right flex flex-col items-end gap-1">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isUrgent ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                {elapsed}m ago
                              </span>
                              {/* Drag hint */}
                              <span className="text-[10px] text-gray-300 select-none">⠿ drag</span>
                            </div>
                          </div>

                          {/* Items */}
                          <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
                            {order.items?.map((item) => (
                              <div key={item.id} className="text-sm">
                                <div className="flex justify-between">
                                  <span className="text-gray-700 font-medium">{item.name}</span>
                                  <span className="text-gray-500 font-semibold">×{item.quantity}</span>
                                </div>
                                {item.customizations && item.customizations.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-0.5">
                                    {item.customizations.map((c, ci) => (
                                      <span key={ci} className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">{c.choice}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                            {order.notes && (
                              <p className="text-xs text-gray-400 pt-1 border-t border-gray-100">📝 {order.notes}</p>
                            )}
                          </div>

                          {/* Payment */}
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5 text-gray-500">
                              <span>{order.payment_method === 'cash' ? '💵 Cash' : '📱 UPI'}</span>
                              {order.payment_status === 'paid' ? (
                                <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Paid</span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Unpaid</span>
                              )}
                            </div>
                            <div className="text-right">
                              {order.discount_amount > 0 && (
                                <p className="text-green-600">-{formatCurrency(order.discount_amount)}{order.coupon_code ? ` (${order.coupon_code})` : ''}</p>
                              )}
                              <span className="font-semibold text-gray-900">{formatCurrency(order.total)}</span>
                            </div>
                          </div>

                          {/* Bidirectional status buttons */}
                          <div className="flex gap-1.5">
                            {prevStatus && (
                              <button
                                onClick={() => updateStatus(order.id, prevStatus)}
                                title={`Move back to ${STATUS_LABELS[prevStatus]}`}
                                className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
                              >
                                <ChevronLeft size={12} />
                                {STATUS_LABELS[prevStatus]}
                              </button>
                            )}
                            {nextStatus ? (
                              <button
                                onClick={() => updateStatus(order.id, nextStatus)}
                                className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                  nextStatus === 'ready'
                                    ? 'bg-green-500 text-white hover:bg-green-600'
                                    : nextStatus === 'confirmed'
                                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                                    : 'bg-orange-500 text-white hover:bg-orange-600'
                                }`}
                              >
                                {STATUS_LABELS[nextStatus]}
                                <ChevronRight size={12} />
                              </button>
                            ) : (
                              // On "ready" — mark as completed
                              <button
                                onClick={() => updateStatus(order.id, 'completed')}
                                className="flex-1 flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-semibold bg-gray-700 text-white hover:bg-gray-800 transition-colors"
                              >
                                ✓ Complete
                              </button>
                            )}
                            <button
                              onClick={() => setCancelTarget(order)}
                              className="px-2.5 py-2 rounded-xl text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                            >
                              ✕
                            </button>
                          </div>

                          {/* Mark cash as paid / undo */}
                          {order.payment_method === 'cash' && (
                            order.payment_status === 'paid' ? (
                              <button
                                onClick={() => markAsUnpaid(order.id)}
                                className="w-full py-1.5 rounded-xl text-xs font-semibold bg-gray-50 text-gray-500 hover:bg-gray-100 transition-colors border border-gray-200"
                              >
                                ↩ Undo Payment
                              </button>
                            ) : (
                              <button
                                onClick={() => markAsPaid(order.id)}
                                className="w-full py-1.5 rounded-xl text-xs font-semibold bg-green-50 text-green-700 hover:bg-green-100 transition-colors border border-green-200"
                              >
                                ✓ Mark as Paid
                              </button>
                            )
                          )}
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

      <CancelOrderModal
        open={!!cancelTarget}
        orderNumber={cancelTarget?.order_number ?? ''}
        onClose={() => setCancelTarget(null)}
        onConfirm={(reason) => cancelOrder(cancelTarget!.id, reason)}
      />
    </div>
  )
}
