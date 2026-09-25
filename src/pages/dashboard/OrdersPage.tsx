import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Filter, ShoppingBag, ChevronDown, Calendar, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { formatCurrency, formatDate, getOrderStatusColor, getOrderStatusLabel, getPaymentStatusColor } from '@/lib/utils'
import { startOfDay, endOfDay, subDays } from 'date-fns'
import { DayPicker } from 'react-day-picker'
import type { DateRange } from 'react-day-picker'
import 'react-day-picker/dist/style.css'
import { Card, CardContent } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { Modal } from '@/components/ui/Modal'
import { CancelOrderModal } from '@/components/CancelOrderModal'
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback'
import { captureException } from '@/lib/observability'
import type { Order, OrderStatus } from '@/types'
import toast from 'react-hot-toast'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'


const STATUS_OPTIONS: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled']

// Only allow the next logical step — prevents jumping from pending straight to completed
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  pending:   ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready:     ['completed'],
}

export default function OrdersPage() {
  const { shop } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'failed'>('all')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<'all' | 'cash' | 'upi'>('all')
  const [orderTypeFilter, setOrderTypeFilter] = useState<'all' | 'walkin' | 'takeaway' | 'dinein'>('all')
  
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false)
  const [paymentStatusDropdownOpen, setPaymentStatusDropdownOpen] = useState(false)
  const [paymentMethodDropdownOpen, setPaymentMethodDropdownOpen] = useState(false)
  const [orderTypeDropdownOpen, setOrderTypeDropdownOpen] = useState(false)
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false)
  const [pageSize, setPageSize] = useState<number>(10)
  const [totalCount, setTotalCount] = useState<number>(0)
  const [limitDropdownOpen, setLimitDropdownOpen] = useState(false)
  
  type DateFilter = 'all' | 'today' | 'yesterday' | 'last7days' | 'custom'
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>()
  
  const [selected, setSelected] = useState<Order | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)

  const getDateRange = useCallback(() => {
    if (dateFilter === 'all') return null
    const now = new Date()
    if (dateFilter === 'today') {
      return { start: startOfDay(now).toISOString(), end: endOfDay(now).toISOString() }
    }
    if (dateFilter === 'yesterday') {
      const yesterday = subDays(now, 1)
      return { start: startOfDay(yesterday).toISOString(), end: endOfDay(yesterday).toISOString() }
    }
    if (dateFilter === 'last7days') {
      const start = subDays(now, 7)
      return { start: startOfDay(start).toISOString(), end: endOfDay(now).toISOString() }
    }
    if (dateFilter === 'custom' && customDateRange?.from && customDateRange?.to) {
      return { start: startOfDay(customDateRange.from).toISOString(), end: endOfDay(customDateRange.to).toISOString() }
    }
    return null
  }, [dateFilter, customDateRange])

  // Clear filters
  const hasActiveFilters = search !== '' || statusFilter !== 'all' || paymentStatusFilter !== 'all' || paymentMethodFilter !== 'all' || orderTypeFilter !== 'all' || dateFilter !== 'all'
  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setPaymentStatusFilter('all')
    setPaymentMethodFilter('all')
    setOrderTypeFilter('all')
    setDateFilter('all')
    setCustomDateRange(undefined)
  }

  // Fetch the first pageSize orders on mount / shop change.
  const fetchFirstPage = useCallback(async () => {
    if (!shop) return
    setLoading(true)
    
    let query = supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('shop_id', shop.id)
      
    const range = getDateRange()
    if (range) {
      query = query.gte('created_at', range.start).lte('created_at', range.end)
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(pageSize)
    if (error) {
      toast.error('Failed to load orders')
      captureException(error, { where: 'OrdersPage.fetchFirstPage' })
    }
    
    // Fetch total count for the selected date range
    let countQuery = supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shop.id)
    if (range) {
      countQuery = countQuery.gte('created_at', range.start).lte('created_at', range.end)
    }
    const { count, error: countError } = await countQuery
    if (!countError && count !== null) {
      setTotalCount(count)
    }
    const rows = (data as Order[]) ?? []
    setOrders(rows)
    setHasMore(rows.length === pageSize)
    setLoading(false)
  }, [shop, getDateRange, pageSize])

  const fetchNextPage = useCallback(async () => {
    if (!shop || loadingMore || !hasMore) return
    const cursor = orders[orders.length - 1]?.created_at
    if (!cursor) return
    setLoadingMore(true)
    
    let query = supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('shop_id', shop.id)
      .lt('created_at', cursor)
      
    const range = getDateRange()
    if (range) {
      // For fetchNextPage, we still need the lower bound if a date range is active
      // The cursor handles the upper bound incrementally
      query = query.gte('created_at', range.start)
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .limit(pageSize)
    if (error) {
      toast.error('Failed to load more orders')
      captureException(error, { where: 'OrdersPage.fetchNextPage' })
    }
    const rows = (data as Order[]) ?? []
    setOrders((prev) => [...prev, ...rows])
    setHasMore(rows.length === pageSize)
    setLoadingMore(false)
  }, [shop, orders, loadingMore, hasMore, getDateRange, pageSize])

  // Fetch a single order (with items) — used by realtime INSERT/UPDATE.
  const fetchOne = useCallback(async (id: string): Promise<Order | null> => {
    if (!shop) return null
    const { data } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', id)
      .eq('shop_id', shop.id)
      .single()
    return (data as Order) ?? null
  }, [shop])

  const debouncedRefetchTop = useDebouncedCallback(() => { fetchFirstPage() }, 250)

  useEffect(() => {
    if (!shop) return
    // Only refetch if custom range is valid or not custom
    if (dateFilter === 'custom' && (!customDateRange?.from || !customDateRange?.to)) return
    fetchFirstPage()
  }, [shop, dateFilter, customDateRange?.from, customDateRange?.to, pageSize, fetchFirstPage])


  const applyRealtimeChange = useCallback(async (payload: RealtimePostgresChangesPayload<Order>) => {
    if (payload.eventType === 'DELETE') {
      const oldId = (payload.old as { id?: string } | undefined)?.id
      if (oldId) setOrders((prev) => prev.filter((o) => o.id !== oldId))
      return
    }
    const newRow = payload.new as Order | undefined
    if (!newRow?.id) return

    if (payload.eventType === 'UPDATE') {
      // Patch existing row in place with the fields the payload gave us.
      setOrders((prev) => prev.map((o) => o.id === newRow.id ? { ...o, ...newRow } : o))
      setSelected((prev) => prev && prev.id === newRow.id ? { ...prev, ...newRow } : prev)
      return
    }

    // INSERT: fetch the row with its items so it renders correctly.
    const full = await fetchOne(newRow.id)
    if (full) setOrders((prev) => prev.some((o) => o.id === full.id) ? prev : [full, ...prev])
  }, [fetchOne])

  useEffect(() => {
    if (!shop) return
    // Note: fetchFirstPage is now triggered by the dateFilter useEffect above

    const channel = supabase
      .channel(`orders-${shop.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `shop_id=eq.${shop.id}` },
        (payload) => { applyRealtimeChange(payload as RealtimePostgresChangesPayload<Order>) },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
        // order_items realtime doesn't carry shop_id, so debounce-refresh the top page.
        () => { debouncedRefetchTop() },
      )
      .subscribe()
    channelRef.current = channel

    return () => { channel.unsubscribe(); channelRef.current = null }
  }, [shop, fetchFirstPage, applyRealtimeChange, debouncedRefetchTop])

  const updateStatus = async (orderId: string, status: OrderStatus) => {
    if (status === 'cancelled') {
      const order = orders.find((o) => o.id === orderId)
      if (order) { setCancelTarget(order); return }
    }
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId)
    if (error) { toast.error(error.message); return }
    toast.success(`Order marked as ${status}`)
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status } : o))
    if (selected?.id === orderId) setSelected((prev) => prev ? { ...prev, status } : prev)
  }

  const cancelOrder = async (orderId: string, reason: string) => {
    const { error } = await supabase.from('orders').update({ status: 'cancelled', cancellation_reason: reason }).eq('id', orderId)
    if (error) { toast.error(error.message); return }
    toast.success('Order cancelled')
    const updated = { status: 'cancelled' as OrderStatus, cancellation_reason: reason }
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, ...updated } : o))
    if (selected?.id === orderId) setSelected((prev) => prev ? { ...prev, ...updated } : prev)
  }

  const markAsPaid = async (orderId: string) => {
    const { error } = await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', orderId)
    if (error) { toast.error(error.message); return }
    toast.success('Marked as paid ✓')
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, payment_status: 'paid' } : o))
    if (selected?.id === orderId) setSelected((prev) => prev ? { ...prev, payment_status: 'paid' } : prev)
  }

  const markAsUnpaid = async (orderId: string) => {
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, payment_status: 'pending' } : o))
    if (selected?.id === orderId) setSelected((prev) => prev ? { ...prev, payment_status: 'pending' } : prev)
    const { error } = await supabase.from('orders').update({ payment_status: 'pending' }).eq('id', orderId)
    if (error) {
      toast.error(error.message)
      setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, payment_status: 'paid' } : o))
      if (selected?.id === orderId) setSelected((prev) => prev ? { ...prev, payment_status: 'paid' } : prev)
      return
    }
    toast.success('Payment undone')
  }

  const filtered = orders.filter((o) => {
    const matchSearch = o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_phone.includes(search)
    const matchStatus = statusFilter === 'all' || o.status === statusFilter
    
    // payment status logic: order.payment_status is 'paid', 'failed', or 'pending' (unpaid)
    let matchPaymentStatus = true;
    if (paymentStatusFilter === 'paid') matchPaymentStatus = o.payment_status === 'paid';
    if (paymentStatusFilter === 'failed') matchPaymentStatus = o.payment_status === 'failed';
    if (paymentStatusFilter === 'unpaid') matchPaymentStatus = o.payment_status === 'pending';
    
    const matchPaymentMethod = paymentMethodFilter === 'all' || o.payment_method === paymentMethodFilter;
    
    let matchOrderType = true;
    if (orderTypeFilter === 'walkin') matchOrderType = o.order_source === 'walkin';
    if (orderTypeFilter === 'takeaway') matchOrderType = o.order_type === 'takeaway';
    if (orderTypeFilter === 'dinein') matchOrderType = o.order_type === 'dine_in' || (o.order_type !== 'takeaway' && o.order_source !== 'walkin');

    return matchSearch && matchStatus && matchPaymentStatus && matchPaymentMethod && matchOrderType;
  })

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Orders</h2>
          <div className="flex items-center gap-4 mt-0.5">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filtered.length < orders.length
                ? `Showing ${filtered.length} matching orders (out of ${totalCount} total)`
                : `Showing ${orders.length} of ${totalCount} orders`}
            </p>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 relative">
              <span>Show:</span>
              <button
                onClick={() => setLimitDropdownOpen(!limitDropdownOpen)}
                className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-gray-200 dark:border-slate-700 hover:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/50 bg-white dark:bg-slate-900 transition-colors"
              >
                <span>{pageSize}</span>
                <ChevronDown size={14} className="text-gray-400" />
              </button>
              
              {limitDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLimitDropdownOpen(false)} />
                  <div className="absolute top-full right-0 mt-1.5 w-24 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden z-50 py-1">
                    {[10, 20, 50].map((size) => (
                      <button
                        key={size}
                        onClick={() => { setPageSize(size); setLimitDropdownOpen(false) }}
                        className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${pageSize === size ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex-1 min-w-48">
          <Input
            placeholder="Search orders, customer..."
            icon={<Search size={16} />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        
        {/* Status Filter */}
        <div className="relative">
          <button
            onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
            className="flex items-center gap-2 h-10 pl-9 pr-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-gray-200 hover:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/50"
          >
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <span>{statusFilter === 'all' ? 'All statuses' : getOrderStatusLabel(statusFilter)}</span>
            <ChevronDown size={14} className="text-gray-400 ml-1" />
          </button>
          
          {statusDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setStatusDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden z-50 py-1">
                <button
                  onClick={() => { setStatusFilter('all'); setStatusDropdownOpen(false) }}
                  className={`w-full text-left px-4 py-2 text-sm transition-colors ${statusFilter === 'all' ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                >
                  All statuses
                </button>
                {STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); setStatusDropdownOpen(false) }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${statusFilter === s ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                  >
                    {getOrderStatusLabel(s)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Payment Status Filter */}
        <div className="relative">
          <button
            onClick={() => setPaymentStatusDropdownOpen(!paymentStatusDropdownOpen)}
            className="flex items-center gap-2 h-10 px-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-gray-200 hover:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/50"
          >
            <span>{paymentStatusFilter === 'all' ? 'Payment: All' : paymentStatusFilter === 'paid' ? 'Paid' : paymentStatusFilter === 'unpaid' ? 'Unpaid' : 'Failed'}</span>
            <ChevronDown size={14} className="text-gray-400 ml-1" />
          </button>
          
          {paymentStatusDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPaymentStatusDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-2 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden z-50 py-1">
                {['all', 'paid', 'unpaid', 'failed'].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setPaymentStatusFilter(s as any); setPaymentStatusDropdownOpen(false) }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors capitalize ${paymentStatusFilter === s ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                  >
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Payment Method Filter */}
        {/* <div className="relative">
          <button
            onClick={() => setPaymentMethodDropdownOpen(!paymentMethodDropdownOpen)}
            className="flex items-center gap-2 h-10 px-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-gray-200 hover:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/50"
          >
            <span className="capitalize">{paymentMethodFilter === 'all' ? 'Method: All' : paymentMethodFilter}</span>
            <ChevronDown size={14} className="text-gray-400 ml-1" />
          </button>
          
          {paymentMethodDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPaymentMethodDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-2 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden z-50 py-1">
                {['all', 'cash', 'upi'].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setPaymentMethodFilter(s as any); setPaymentMethodDropdownOpen(false) }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors capitalize ${paymentMethodFilter === s ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                  >
                    {s === 'all' ? 'All' : s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div> */}

        {/* Order Type Filter */}
        {/* <div className="relative">
          <button
            onClick={() => setOrderTypeDropdownOpen(!orderTypeDropdownOpen)}
            className="flex items-center gap-2 h-10 px-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-gray-200 hover:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/50"
          >
            <span>{orderTypeFilter === 'all' ? 'Type: All' : orderTypeFilter === 'walkin' ? 'Walk-in' : orderTypeFilter === 'takeaway' ? 'Takeaway' : 'Dine-in'}</span>
            <ChevronDown size={14} className="text-gray-400 ml-1" />
          </button>
          
          {orderTypeDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOrderTypeDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-2 w-40 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden z-50 py-1">
                {['all', 'walkin', 'takeaway', 'dinein'].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setOrderTypeFilter(s as any); setOrderTypeDropdownOpen(false) }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors capitalize ${orderTypeFilter === s ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                  >
                    {s === 'all' ? 'All' : s === 'walkin' ? 'Walk-in' : s === 'takeaway' ? 'Takeaway' : 'Dine-in'}
                  </button>
                ))}
              </div>
            </>
          )}
        </div> */}
        
        {/* Date Range Filter */}
        <div className="relative">
          <button
            onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
            className="flex items-center gap-2 h-10 px-4 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-700 dark:text-gray-200 hover:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 dark:focus:ring-orange-900/50"
          >
            <Calendar size={14} className="text-gray-400" />
            <span>
              {dateFilter === 'all' ? 'All time' : 
               dateFilter === 'today' ? 'Today' : 
               dateFilter === 'yesterday' ? 'Yesterday' : 
               dateFilter === 'last7days' ? 'Last 7 days' : 'Custom'}
            </span>
            <ChevronDown size={14} className="text-gray-400 ml-1" />
          </button>
          
          {dateDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setDateDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-2 min-w-56 w-auto bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden z-50 p-1">
                {[
                  { value: 'all', label: 'All time' },
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'last7days', label: 'Last 7 days' },
                  { value: 'custom', label: 'Custom range' }
                ].map((s) => (
                  <button
                    key={s.value}
                    onClick={() => { setDateFilter(s.value as any); if (s.value !== 'custom') setDateDropdownOpen(false) }}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors rounded-lg ${dateFilter === s.value ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 font-medium' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
                  >
                    {s.label}
                  </button>
                ))}
                
                {dateFilter === 'custom' && (
                  <div className="p-3 mt-1 border-t border-gray-100 dark:border-slate-700 flex justify-center">
                    <style>{`
                      .rdp-root {
                        --rdp-accent-color: #f97316;
                        --rdp-accent-background-color: #fff7ed;
                        --rdp-font-family: inherit;
                        margin: 0;
                      }
                      .rdp-day_selected { font-weight: bold; }
                      .dark .rdp-root {
                        --rdp-accent-background-color: #7c2d12;
                      }
                      .rdp-months { justify-content: center; }
                      .rdp-day { border-radius: 6px; font-size: 0.85rem; height: 32px; width: 32px; }
                      .rdp-head_cell { font-size: 0.8rem; font-weight: 500; text-transform: uppercase; color: #9ca3af; }
                    `}</style>
                    <DayPicker 
                      mode="range" 
                      selected={customDateRange} 
                      onSelect={setCustomDateRange} 
                      className="text-gray-900 dark:text-gray-200 bg-white dark:bg-slate-800"
                    />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        
        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 h-10 px-3 rounded-xl text-sm text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <X size={14} /> Clear
          </button>
        )}
      </div>

      {/* Order list */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <ShoppingBag size={48} className="text-gray-200 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">No orders found</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try adjusting your search or filter</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((order) => (
            <Card key={order.id} hover onClick={() => setSelected(order)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ShoppingBag size={18} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 dark:text-white text-sm">{order.order_number}</span>
                      {order.order_source === 'walkin' && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700">Walk-in</span>
                      )}
                      {order.order_type === 'takeaway' && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">Takeaway</span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getOrderStatusColor(order.status)}`}>
                        {getOrderStatusLabel(order.status)}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getPaymentStatusColor(order.payment_status)}`}>
                        {order.payment_status === 'paid' ? 'Paid' : order.payment_status === 'failed' ? 'Failed' : 'Unpaid'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {order.customer_name} · {order.customer_phone} · {formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(order.total)}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 capitalize mt-0.5">{order.payment_method}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {hasMore && (
            <div className="pt-2 flex justify-center">
              <button
                onClick={() => fetchNextPage()}
                disabled={loadingMore}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {loadingMore ? 'Loading…' : 'Load older orders'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Order detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={`Order ${selected?.order_number}${selected?.order_source === 'walkin' ? ' · Walk-in' : ''}`}
        size="md"
      >
        {selected && (
          <div className="space-y-5">
            {/* Customer info */}
            <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50 rounded-xl p-4 space-y-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Customer</p>
              <p className="font-semibold text-gray-900 dark:text-white">{selected.customer_name}</p>
              {selected.is_anonymous
                ? <p className="text-sm text-blue-500 dark:text-blue-400">🔒 Anonymous</p>
                : <p className="text-sm text-gray-500 dark:text-gray-400">{selected.customer_phone}</p>
              }
              <p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(selected.created_at)}</p>
            </div>

            {/* Items */}
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Items ordered</p>
              <div className="space-y-2">
                {selected.items?.map((item) => (
                  <div key={item.id} className="text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-700 dark:text-gray-300">{item.name} <span className="text-gray-400 dark:text-gray-500">× {item.quantity}</span></span>
                      {(() => {
                        const customizationsPrice = item.customizations?.reduce((s, c) => s + (c.price || 0), 0) || 0
                        const unitOrig = item.original_price ? item.original_price + customizationsPrice : undefined
                        const origSubtotal = unitOrig ? unitOrig * item.quantity : undefined
                        
                        return origSubtotal ? (
                          <div className="flex items-center gap-1.5 flex-wrap justify-end text-right">
                            <span className="text-xs text-gray-400 line-through">{formatCurrency(origSubtotal)}</span>
                            <span className="font-bold text-orange-600 dark:text-orange-400">{formatCurrency(item.subtotal)}</span>
                          </div>
                        ) : (
                          <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(item.subtotal)}</span>
                        )
                      })()}
                    </div>
                    {item.customizations && item.customizations.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {item.customizations.map((c, ci) => (
                          <span key={ci} className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded-full">{c.choice}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 dark:border-slate-700 mt-3 pt-3 space-y-1">
                <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                  <span>Subtotal</span><span>{formatCurrency(selected.subtotal)}</span>
                </div>
                {selected.packing_charge > 0 && (
                  <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>Packing Charge</span><span>{formatCurrency(selected.packing_charge)}</span>
                  </div>
                )}
                {selected.tax_amount > 0 && (
                  <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                    <span>Tax</span><span>{formatCurrency(selected.tax_amount)}</span>
                  </div>
                )}
                {selected.discount_amount > 0 && (
                  <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                    <span>Discount{selected.coupon_code ? ` (${selected.coupon_code})` : ''}</span>
                    <span>-{formatCurrency(selected.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-gray-900 dark:text-white">
                  <span>Total</span><span>{formatCurrency(selected.total)}</span>
                </div>
              </div>
            </div>

            {/* Payment */}
            <div className="flex gap-3">
              <div className="flex-1 bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Payment</p>
                <p className="font-semibold text-gray-900 dark:text-white capitalize">{selected.payment_method === 'cash' ? '💵 Cash' : '📱 UPI'}</p>
              </div>
              <div className="flex-1 bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700/50 rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400">Payment Status</p>
                <p className={`font-semibold ${selected.payment_status === 'paid' ? 'text-green-600 dark:text-green-400' : selected.payment_status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
                  {selected.payment_status === 'paid' ? '✓ Paid' : selected.payment_status === 'failed' ? '✗ Failed' : 'Unpaid'}
                </p>
              </div>
            </div>

            {/* Payment action buttons */}
            {selected.payment_status !== 'paid' ? (
              <button
                onClick={() => markAsPaid(selected.id)}
                className="w-full py-2 rounded-xl text-sm font-semibold bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-all border border-green-200 dark:border-green-900/50"
              >
                ✓ Mark as Paid
              </button>
            ) : selected.payment_method === 'cash' && (
              <button
                onClick={() => markAsUnpaid(selected.id)}
                className="w-full py-2 rounded-xl text-sm font-semibold bg-gray-50 dark:bg-slate-800/50 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-all border border-gray-200 dark:border-slate-700/50"
              >
                ↩ Undo Payment
              </button>
            )}

            {/* Status update */}
            {!['completed', 'cancelled'].includes(selected.status) && (
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Update status</p>
                <div className="flex flex-wrap gap-2">
                  {(NEXT_STATUS[selected.status] ?? []).map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(selected.id, s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${getOrderStatusColor(s)} hover:opacity-80`}
                    >
                      → {getOrderStatusLabel(s)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      <CancelOrderModal
        open={!!cancelTarget}
        orderNumber={cancelTarget?.order_number ?? ''}
        onClose={() => setCancelTarget(null)}
        onConfirm={(reason) => cancelOrder(cancelTarget!.id, reason)}
      />
    </div>
  )
}
