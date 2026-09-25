import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatTime(date: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

// Scales the unit (minutes -> hours -> days -> months -> years) as elapsed time grows.
export function formatElapsedTime(createdAt: string): string {
  const created = new Date(createdAt)
  const now = new Date()
  const totalMinutes = Math.max(0, Math.floor((now.getTime() - created.getTime()) / 60000))
  if (totalMinutes < 60) return `${totalMinutes}m ago`
  const totalHours = Math.floor(totalMinutes / 60)
  if (totalHours < 24) return `${totalHours}h ${totalMinutes % 60}m ago`

  // Calendar-aware diff so real month lengths (28/29/30/31 days) decide the month/year rollover.
  let months = (now.getFullYear() - created.getFullYear()) * 12 + (now.getMonth() - created.getMonth())
  if (now.getDate() < created.getDate()) months--

  if (months < 1) {
    const days = Math.floor(totalHours / 24)
    return `${days}d ${totalHours % 24}h ago`
  }

  const monthMark = new Date(created)
  monthMark.setMonth(monthMark.getMonth() + months)
  const remainderDays = Math.max(0, Math.floor((now.getTime() - monthMark.getTime()) / 86400000))

  if (months < 12) return `${months}mo ${remainderDays}d ago`

  const years = Math.floor(months / 12)
  return `${years}y ${months % 12}mo ago`
}

// Formats a "HH:mm" (24-hour) string, e.g. from a <input type="time">, into 12-hour "h:mm AM/PM".
export function formatTimeString(hhmm: string | null | undefined): string {
  if (!hhmm) return ''
  const [hStr, mStr] = hhmm.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10)
  if (Number.isNaN(h) || Number.isNaN(m)) return ''
  const ampm = h >= 12 ? 'PM' : 'AM'
  const displayHour = h % 12 === 0 ? 12 : h % 12
  return `${displayHour}:${String(m).padStart(2, '0')} ${ampm}`
}

// Tells a closed customer when the shop's auto-schedule will next bring it online.
export function getReopenLabel(
  autoScheduleEnabled: boolean | null | undefined,
  autoOpenTime: string | null | undefined,
  autoCloseTime: string | null | undefined,
): string {
  if (!autoScheduleEnabled || !autoOpenTime || !autoCloseTime) return ''
  const now = new Date()
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const opensToday = hhmm < autoOpenTime
  return `Opens ${opensToday ? 'today' : 'tomorrow'} at ${formatTimeString(autoOpenTime)}`
}

export function generateOrderNumber(): string {
  const now = new Date()
  const prefix = 'ORD'
  const timestamp = now.getTime().toString().slice(-6)
  const random = Math.random().toString(36).slice(2, 5).toUpperCase()
  return `${prefix}-${timestamp}-${random}`
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function getOrderStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    preparing: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    ready: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    completed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  }
  return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
}

export function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    preparing: 'Preparing',
    ready: 'Ready',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }
  return labels[status] || status
}

export function getPaymentStatusColor(status: string): string {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  }
  return colors[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
}

export const convertToWebP = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Failed to get canvas context')); return }
        ctx.drawImage(img, 0, 0)
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error('Failed to convert image')); return }
          const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", {
            type: 'image/webp',
            lastModified: Date.now()
          })
          resolve(newFile)
        }, 'image/webp', 0.8) // 0.8 quality
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = e.target?.result as string
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
