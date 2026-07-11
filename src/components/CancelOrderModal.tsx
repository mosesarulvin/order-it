import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { AlertTriangle } from 'lucide-react'

const PRESET_REASONS = [
  'Item out of stock',
  'Shop is closing soon',
  'Customer requested cancellation',
  'Unable to prepare at this time',
  'Incorrect order details',
]

interface CancelOrderModalProps {
  orderNumber: string
  open: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
}

export function CancelOrderModal({ orderNumber, open, onClose, onConfirm }: CancelOrderModalProps) {
  const [reason, setReason] = useState('')
  const [custom, setCustom] = useState('')
  const [loading, setLoading] = useState(false)

  const finalReason = reason === '__custom__' ? custom.trim() : reason

  const handleConfirm = async () => {
    if (!finalReason) return
    setLoading(true)
    await onConfirm(finalReason)
    setLoading(false)
    setReason('')
    setCustom('')
    onClose()
  }

  const handleClose = () => {
    setReason('')
    setCustom('')
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title="Cancel Order">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
          <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">
            You are cancelling <strong>{orderNumber}</strong>. The customer will be notified with your reason.
          </p>
        </div>

        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Reason for cancellation</p>
          <div className="space-y-2">
            {PRESET_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setReason(r)}
                className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                  reason === r
                    ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                    : 'border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {r}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setReason('__custom__')}
              className={`w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all ${
                reason === '__custom__'
                  ? 'border-red-400 bg-red-50 text-red-700 font-medium'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              Other (type your own)
            </button>
            {reason === '__custom__' && (
              <textarea
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Describe the reason..."
                maxLength={200}
                autoFocus
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 resize-none"
                rows={3}
              />
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="flex-1" onClick={handleClose} disabled={loading}>
            Keep Order
          </Button>
          <Button
            className="flex-1 bg-red-500 hover:bg-red-600 text-white"
            onClick={handleConfirm}
            loading={loading}
            disabled={!finalReason}
          >
            Cancel Order
          </Button>
        </div>
      </div>
    </Modal>
  )
}
