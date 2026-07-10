import { cn } from '@/lib/utils'

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label?: string
  disabled?: boolean
  className?: string
}

export function Toggle({ checked, onChange, label, disabled, className }: ToggleProps) {
  return (
    <label className={cn('flex items-center gap-3 cursor-pointer', disabled && 'opacity-50 pointer-events-none', className)}>
      <div
        role="switch"
        aria-checked={checked}
        className={cn(
          'relative w-10 h-6 rounded-full transition-colors duration-200',
          checked ? 'bg-orange-500' : 'bg-gray-200'
        )}
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            'absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200',
            checked && 'translate-x-4'
          )}
        />
      </div>
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </label>
  )
}
