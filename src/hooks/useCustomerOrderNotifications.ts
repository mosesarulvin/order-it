import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { notifyCustomerOrderReady, playOrderReadySound, requestNotificationPermission } from '@/lib/sound'
import toast from 'react-hot-toast'
import type { RealtimeChannel } from '@supabase/supabase-js'

const ORDERS_KEY = (slug: string) => `orderit-orders-${slug}`

export function useCustomerOrderNotifications(slug?: string, currentOrderId?: string) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')
  const channelsRef = useRef<RealtimeChannel[]>([])

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const handleRequestPermission = async () => {
    const perm = await requestNotificationPermission()
    setPermission(perm)
    if (perm === 'granted') {
      toast.success('Notifications enabled! You will be alerted when your order is ready.')
      playOrderReadySound()
    } else if (perm === 'denied') {
      toast.error('Notification permission was blocked in browser settings.')
    }
  }

  useEffect(() => {
    if (!slug) return

    // Unsubscribe from previous channels
    channelsRef.current.forEach((ch) => ch.unsubscribe())
    channelsRef.current = []

    // Collect order IDs to monitor
    const idsToMonitor = new Set<string>()
    if (currentOrderId) {
      idsToMonitor.add(currentOrderId)
    }

    const saved = localStorage.getItem(ORDERS_KEY(slug))
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        parsed.forEach((e: any) => {
          const id = typeof e === 'string' ? e : e?.id
          if (id) idsToMonitor.add(id)
        })
      } catch (e) {
        console.error('Error parsing stored orders:', e)
      }
    }

    if (idsToMonitor.size === 0) return

    const newChannels: RealtimeChannel[] = []

    // Subscribe to each monitored order
    idsToMonitor.forEach((id) => {
      const channel = supabase
        .channel(`customer-order-${id}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${id}` },
          (payload) => {
            const updatedOrder = payload.new as { id: string; order_number: string; status: string }
            if (updatedOrder.status === 'ready') {
              const notifiedKey = `notified-ready-${updatedOrder.id}`
              if (!sessionStorage.getItem(notifiedKey)) {
                sessionStorage.setItem(notifiedKey, 'true')
                notifyCustomerOrderReady(updatedOrder.order_number)
                toast.success(`🎉 Order #${updatedOrder.order_number} is ready for pickup!`, {
                  duration: 8000,
                  icon: '🔔',
                  style: {
                    borderRadius: '16px',
                    background: '#10B981',
                    color: '#fff',
                    fontWeight: 'bold',
                  },
                })
              }
            }
          }
        )
        .subscribe()

      newChannels.push(channel)
    })

    channelsRef.current = newChannels

    return () => {
      newChannels.forEach((ch) => ch.unsubscribe())
    }
  }, [slug, currentOrderId])

  return {
    permission,
    requestPermission: handleRequestPermission,
    playSound: playOrderReadySound,
    triggerReadyAlert: (orderNumber: string, orderId: string) => {
      const notifiedKey = `notified-ready-${orderId}`
      if (!sessionStorage.getItem(notifiedKey)) {
        sessionStorage.setItem(notifiedKey, 'true')
        notifyCustomerOrderReady(orderNumber)
      }
    },
  }
}
