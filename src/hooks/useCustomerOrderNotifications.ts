import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  notifyCustomerOrderReady, playOrderReadySound, requestNotificationPermission,
} from '@/lib/sound'
import toast from 'react-hot-toast'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'

const ORDERS_KEY = (slug: string) => `orderit-orders-${slug}`

interface OrderRow {
  id:           string
  order_number: string
  status:       string
}

/**
 * Subscribes to status changes for a customer's recent orders on a single
 * realtime channel, in contrast to the previous one-channel-per-order pattern
 * which scales poorly. The `filter` argument uses PostgREST's `in.(...)` syntax
 * so a single Postgres change subscription can match any of the tracked ids.
 *
 * The set of tracked order IDs is derived from:
 *   • whatever the caller explicitly wants to watch (currentOrderIds), and
 *   • the recent-orders cache written by OrderSuccessPage.
 */
export function useCustomerOrderNotifications(
  slug?: string,
  currentOrderIds?: string | string[],
) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const handleRequestPermission = useCallback(async () => {
    const perm = await requestNotificationPermission()
    setPermission(perm)
    if (perm === 'granted') {
      toast.success('Notifications enabled! You will be alerted when your order is ready.')
      playOrderReadySound()
    } else if (perm === 'denied') {
      toast.error('Notification permission was blocked in browser settings.')
    }
  }, [])

  // Build a stable, deduplicated list of order IDs to monitor.
  const idsSignature = Array.isArray(currentOrderIds)
    ? currentOrderIds.slice().sort().join(',')
    : currentOrderIds ?? ''

  useEffect(() => {
    if (!slug) return

    const ids = new Set<string>()
    if (Array.isArray(currentOrderIds)) currentOrderIds.forEach((id) => id && ids.add(id))
    else if (currentOrderIds) ids.add(currentOrderIds)

    const saved = localStorage.getItem(ORDERS_KEY(slug))
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        for (const entry of parsed) {
          const id = typeof entry === 'string' ? entry : entry?.id
          if (id) ids.add(id)
        }
      } catch { /* ignore malformed cache */ }
    }

    if (ids.size === 0) return

    const filter = `id=in.(${Array.from(ids).join(',')})`
    const channel = supabase
      .channel(`customer-orders-${slug}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter },
        (payload: RealtimePostgresChangesPayload<OrderRow>) => {
          const updated = payload.new as OrderRow
          if (!updated || updated.status !== 'ready') return

          const notifiedKey = `notified-ready-${updated.id}`
          if (sessionStorage.getItem(notifiedKey)) return
          sessionStorage.setItem(notifiedKey, 'true')

          notifyCustomerOrderReady(updated.order_number)
          toast.success(`🎉 Order #${updated.order_number} is ready for pickup!`, {
            duration: 8000,
            icon: '🔔',
            style: {
              borderRadius: '16px',
              background:   '#10B981',
              color:        '#fff',
              fontWeight:   'bold',
            },
          })
        },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, idsSignature])

  const triggerReadyAlert = useCallback((orderNumber: string, orderId: string) => {
    const key = `notified-ready-${orderId}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, 'true')
    notifyCustomerOrderReady(orderNumber)
  }, [])

  return {
    permission,
    requestPermission: handleRequestPermission,
    playSound:         playOrderReadySound,
    triggerReadyAlert,
  }
}
