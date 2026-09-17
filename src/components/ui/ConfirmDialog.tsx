import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { AlertTriangle, Trash2 } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  isDanger?: boolean
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDanger = false,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} size="sm">
      <div className="flex flex-col items-center text-center p-2">
        <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4 bg-brand-primary-lighter dark:bg-brand-primary-shadow text-brand-accent dark:text-brand-primary-light">
          {isDanger ? <Trash2 size={24} /> : <AlertTriangle size={24} />}
        </div>
        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{title}</h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">{description}</p>
        <div className="flex gap-3 w-full">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={loading}
          >
            {cancelText}
          </Button>
          <Button
            variant="primary"
            className="flex-1"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? '...' : confirmText}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
