import { useState } from 'react'
import { Clock, X, ChevronDown, ChevronUp, Check } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import * as Select from '@radix-ui/react-select'

export interface TimePickerProps {
  value: string | undefined
  onChange: (hhmm: string) => void
  placeholder?: string
  label?: string
  error?: string
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = Array.from({ length: 60 }, (_, i) => i)

// Parses a 24-hour "HH:mm" string into 12-hour parts for the picker UI.
function parseTime(value: string | undefined) {
  if (!value) return null
  const [hStr, mStr] = value.split(':')
  const hour24 = parseInt(hStr, 10)
  const minute = parseInt(mStr, 10)
  if (Number.isNaN(hour24) || Number.isNaN(minute)) return null
  const period: 'AM' | 'PM' = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return { hour12, minute, period }
}

function buildTime(hour12: number, minute: number, period: 'AM' | 'PM') {
  const hour24 = period === 'AM' ? hour12 % 12 : (hour12 % 12) + 12
  return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// Custom-styled hour/minute dropdown so both the trigger and the open list match the app theme.
function TimeSelect({ value, onChange, options }: { value: number; onChange: (v: number) => void; options: number[] }) {
  return (
    <Select.Root value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <Select.Trigger className="flex-1 min-w-0 h-10 px-2.5 flex items-center justify-center gap-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-white outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30 transition-colors">
        <Select.Value />
        <Select.Icon className="text-gray-400">
          <ChevronDown size={14} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content position="popper" sideOffset={4} className="z-[70] bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
          <Select.ScrollUpButton className="flex items-center justify-center h-6 bg-white dark:bg-slate-800 text-gray-400 cursor-default">
            <ChevronUp size={14} />
          </Select.ScrollUpButton>
          <Select.Viewport
            className="max-h-56 p-1 overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-thumb]:rounded-full"
          >
            {options.map((opt) => (
              <Select.Item
                key={opt}
                value={String(opt)}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg text-gray-700 dark:text-gray-200 outline-none cursor-pointer select-none data-[highlighted]:bg-orange-50 dark:data-[highlighted]:bg-slate-700 data-[state=checked]:bg-brand-primary data-[state=checked]:text-white"
              >
                <Select.ItemText>{String(opt).padStart(2, '0')}</Select.ItemText>
                <Select.ItemIndicator><Check size={14} /></Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
          <Select.ScrollDownButton className="flex items-center justify-center h-6 bg-white dark:bg-slate-800 text-gray-400 cursor-default">
            <ChevronDown size={14} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
}

export function TimePicker({ value, onChange, placeholder = 'Select time...', label, error }: TimePickerProps) {
  const [open, setOpen] = useState(false)
  const parsed = parseTime(value)

  const setPart = (part: Partial<{ hour12: number; minute: number; period: 'AM' | 'PM' }>) => {
    const base = parsed ?? { hour12: 12, minute: 0, period: 'AM' as const }
    const next = { ...base, ...part }
    onChange(buildTime(next.hour12, next.minute, next.period))
  }

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
              w-full h-10 px-3 flex items-center gap-2 text-left rounded-xl border bg-white dark:bg-slate-900 text-sm text-gray-900 dark:text-white
              focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/30 transition-colors
              ${error ? 'border-red-500 focus:border-red-500' : 'border-gray-200 dark:border-slate-700'}
            `}
          >
            <Clock size={16} className="text-gray-400 shrink-0" />
            <span className="flex-1 truncate text-gray-600 dark:text-gray-300">
              {parsed ? `${parsed.hour12}:${String(parsed.minute).padStart(2, '0')} ${parsed.period}` : placeholder}
            </span>
            {value && (
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
          <Popover.Content sideOffset={4} align="start" className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-100 dark:border-slate-700 z-[60] p-3 w-56">
            <div className="flex items-center gap-1.5">
              <TimeSelect value={parsed?.hour12 ?? 12} onChange={(h) => setPart({ hour12: h })} options={HOURS} />
              <span className="text-gray-400 font-semibold">:</span>
              <TimeSelect value={parsed?.minute ?? 0} onChange={(m) => setPart({ minute: m })} options={MINUTES} />
              <div className="flex rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden shrink-0">
                {(['AM', 'PM'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPart({ period: p })}
                    className={`px-2.5 h-10 text-xs font-semibold transition-colors ${
                      (parsed?.period ?? 'AM') === p
                        ? 'bg-brand-primary text-white'
                        : 'bg-white dark:bg-slate-900 text-gray-500 dark:text-gray-400'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full mt-3 h-9 rounded-lg bg-brand-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              Done
            </button>
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
