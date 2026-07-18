import { useState, useRef, useEffect } from 'react'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeProvider'

type ThemeToggleProps = {
  className?: string
  isDarkBackground?: boolean // true if the header is dark (like Customer menu)
}

export function ThemeToggle({ className = '', isDarkBackground = false }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Determine current active icon based on resolved theme
  let CurrentIcon = Monitor
  if (theme === 'light') CurrentIcon = Sun
  if (theme === 'dark') CurrentIcon = Moon

  const buttonStyle = isDarkBackground
    ? 'text-white bg-white/10 hover:bg-white/20'
    : 'text-gray-500 hover:text-gray-700 bg-gray-50 dark:bg-slate-800 dark:text-gray-400 dark:hover:text-white'

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${buttonStyle}`}
        aria-label="Toggle theme"
      >
        <CurrentIcon size={18} />
      </button>

      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-36 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-100 dark:border-slate-700 overflow-hidden z-50 animate-in slide-in-from-top-2"
        >
          <div className="p-1">
            <button
              onClick={() => { setTheme('light'); setIsOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                theme === 'light' ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Sun size={14} /> Light
            </button>
            <button
              onClick={() => { setTheme('dark'); setIsOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors mt-0.5 ${
                theme === 'dark' ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Moon size={14} /> Dark
            </button>
            <button
              onClick={() => { setTheme('system'); setIsOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors mt-0.5 ${
                theme === 'system' ? 'bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              <Monitor size={14} /> System
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
