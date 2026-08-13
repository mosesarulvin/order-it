// Web Audio API sound generator & Notification helper for Customer Order Ready alerts

let sharedAudioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!sharedAudioContext) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (AudioCtx) {
      sharedAudioContext = new AudioCtx()
    }
  }
  return sharedAudioContext
}

/**
 * Plays a bright, pleasant 4-note chime sequence (C5 -> E5 -> G5 -> C6).
 * Returns true if audio played successfully, false if blocked by browser autoplay policy.
 */
export async function playOrderReadySound(): Promise<boolean> {
  try {
    const ctx = getAudioContext()
    if (!ctx) return false

    // Resume AudioContext if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume()
      } catch {
        // Could not resume — blocked by autoplay policy
        return false
      }
    }

    // If still suspended after resume attempt, audio is blocked
    if (ctx.state === 'suspended') return false

    const now = ctx.currentTime

    // Pleasant celebratory chord sequence: C5 (523.25 Hz), E5 (659.25 Hz), G5 (783.99 Hz), C6 (1046.50 Hz)
    const notes = [
      { freq: 523.25, start: 0.0, duration: 0.18, vol: 0.25 },
      { freq: 659.25, start: 0.12, duration: 0.18, vol: 0.3 },
      { freq: 783.99, start: 0.24, duration: 0.22, vol: 0.35 },
      { freq: 1046.50, start: 0.38, duration: 0.55, vol: 0.4 },
    ]

    notes.forEach(({ freq, start, duration, vol }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + start)

      gain.gain.setValueAtTime(0, now + start)
      gain.gain.linearRampToValueAtTime(vol, now + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, now + start + duration)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now + start)
      osc.stop(now + start + duration)
    })

    return true
  } catch (err) {
    console.error('Audio playback error:', err)
    return false
  }
}

/**
 * Requests native browser Notification permission.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  if (Notification.permission === 'granted') {
    return 'granted'
  }
  if (Notification.permission !== 'denied') {
    try {
      const perm = await Notification.requestPermission()
      return perm
    } catch {
      return Notification.permission
    }
  }
  return Notification.permission
}

/**
 * Displays a native OS / browser notification when an order is ready.
 */
export function sendBrowserNotification(title: string, body: string, icon = '/favicon.ico') {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        body,
        icon,
        badge: icon,
        tag: 'order-ready-notification',
        renotify: true,
        requireInteraction: true,
      })
      notif.onclick = () => {
        window.focus()
        notif.close()
      }
    } catch (e) {
      console.warn('Native notification failed:', e)
    }
  }
}

/**
 * Triggers mobile device haptic vibration pattern if supported.
 */
export function triggerHapticFeedback() {
  if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
    try {
      // 3 crisp bursts
      navigator.vibrate([200, 100, 200, 100, 300])
    } catch {
      // Ignore vibration error
    }
  }
}

/**
 * Triggers all notification channels (Audio Chime + Browser Notification + Haptic Vibration)
 * for a customer order ready event.
 */
export function notifyCustomerOrderReady(orderNumber: string) {
  playOrderReadySound()
  triggerHapticFeedback()
  sendBrowserNotification(
    `🎉 Order Ready! #${orderNumber}`,
    `Your order #${orderNumber} is ready for pickup! Please collect it at the counter.`
  )
}
