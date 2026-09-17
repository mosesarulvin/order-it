import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  description?: string
  error?: string
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ className = '', label, description, error, disabled, ...props }, ref) => {
    const input = (
      <input
        ref={ref}
        type="radio"
        disabled={disabled}
        className={`
          appearance-none h-4 w-4 shrink-0 rounded-full border-2 border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 transition-all relative
          hover:border-brand-primary/50 dark:hover:border-brand-primary/50
          checked:!border-brand-primary
          after:content-[''] after:absolute after:hidden checked:after:block after:left-[2px] after:top-[2px] after:w-[8px] after:h-[8px] after:rounded-full after:bg-brand-primary
          focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:ring-offset-1 dark:focus:ring-offset-slate-900
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          ${error ? '!border-red-500' : ''}
          ${className}
        `}
        {...props}
      />
    )

    if (!label && !description && !error) return input

    return (
      <div className="relative flex items-start">
        <div className="flex h-6 items-center">
          {input}
        </div>
        <div className="ml-3 text-sm leading-6">
          {label && (
            <label 
              htmlFor={props.id} 
              className={`font-medium ${disabled ? 'text-gray-400 dark:text-gray-600' : 'text-gray-900 dark:text-gray-100'} ${props.id ? 'cursor-pointer' : ''}`}
            >
              {label}
            </label>
          )}
          {description && (
            <p className={disabled ? 'text-gray-400 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}>
              {description}
            </p>
          )}
          {error && (
            <p className="mt-1 text-sm text-red-500">
              {error}
            </p>
          )}
        </div>
      </div>
    )
  }
)
Radio.displayName = 'Radio'
