import { useState } from 'react'
import { CalendarIcon, X } from 'lucide-react'
import { format } from 'date-fns'
import { DayPicker } from 'react-day-picker'
import * as Popover from '@radix-ui/react-popover'
import 'react-day-picker/dist/style.css'

export interface DatePickerProps {
  value: string | undefined
  onChange: (isoString: string) => void
  placeholder?: string
  label?: string
  error?: string
  /** Overrides the trigger text (e.g. a week range or month name) while the calendar still opens on the given value. */
  displayLabel?: string
  /** Suppresses the clear (X) button, for pickers that always need a value. */
  hideClear?: boolean
}

export function DatePicker({ value, onChange, placeholder = 'Select date...', label, error, displayLabel, hideClear }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const dateParts = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const dateValue = dateParts
    ? new Date(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3]))
    : value ? new Date(value) : undefined

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
          {label}
        </label>
      )}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={`
              group w-full h-10 px-3 flex items-center gap-2 text-left rounded-xl border bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-white
              hover:border-orange-300 dark:hover:border-orange-700
              focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30 transition-colors
              ${error ? 'border-red-500 focus:border-red-500' : 'border-gray-200 dark:border-slate-700'}
            `}
          >
            <CalendarIcon size={16} className="text-gray-400 group-hover:text-orange-500 shrink-0" />
            <span className="flex-1 truncate text-gray-600 dark:text-gray-300 group-hover:text-orange-600 dark:group-hover:text-orange-400">{displayLabel ?? (dateValue ? format(dateValue, 'PPP') : placeholder)}</span>
            {!hideClear && dateValue && (
              <X 
                size={14} 
                className="ml-auto text-gray-400 hover:text-red-500 shrink-0" 
                onClick={(e) => { 
                  e.stopPropagation()
                  onChange('')
                }} 
              />
            )}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content sideOffset={4} align="start" className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 z-[60] p-2">
            <style>{`
              .rdp-root {
                --rdp-accent-color: var(--brand-primary);
                --rdp-accent-background-color: var(--color-brand-50);
                --rdp-font-family: inherit;
                margin: 0;
              }
              .rdp-day_selected { font-weight: bold; }
              .dark .rdp-root { --rdp-accent-background-color: var(--brand-primary-shadow); }
              .rdp-months { justify-content: center; }
              .rdp-day { border-radius: 6px; font-size: 0.85rem; height: 32px; width: 32px; }
              .rdp-head_cell { font-size: 0.8rem; font-weight: 500; text-transform: uppercase; color: #9ca3af; }
            `}</style>
            <DayPicker 
              mode="single"
              selected={dateValue}
              disabled={{ after: new Date() }}
              onSelect={(date) => {
                if (date) {
                  const tzOffset = date.getTimezoneOffset() * 60000;
                  const localISOTime = (new Date(date.getTime() - tzOffset)).toISOString().split('T')[0];
                  onChange(localISOTime);
                } else {
                  onChange('')
                }
                setOpen(false)
              }}
              className="text-gray-900 dark:text-gray-200 bg-white dark:bg-slate-800"
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {error && (
        <p className="mt-1.5 text-sm text-red-500 animate-in slide-in-from-top-1">
          {error}
        </p>
      )}
    </div>
  )
}
