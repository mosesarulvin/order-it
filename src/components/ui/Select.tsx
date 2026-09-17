import { forwardRef } from 'react'
import type { SelectHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className = '', label, error, children, disabled, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            disabled={disabled}
            className={`
              w-full appearance-none rounded-xl border bg-white dark:bg-slate-900 px-4 py-2.5 text-sm outline-none transition-all
              ${disabled ? 'opacity-60 cursor-not-allowed bg-gray-50 dark:bg-slate-800' : 'hover:border-gray-300 dark:hover:border-slate-600 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30'}
              ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30 dark:focus:ring-red-900/30' : 'border-gray-200 dark:border-slate-700'}
              text-gray-900 dark:text-gray-100
              ${className}
            `}
            {...props}
          >
            {children}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-gray-500">
            <ChevronDown size={16} />
          </div>
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-red-500 animate-in slide-in-from-top-1">
            {error}
          </p>
        )}
      </div>
    )
  }
)
Select.displayName = 'Select'
