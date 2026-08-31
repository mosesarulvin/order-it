import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from '@/contexts/AuthContext'
import { ThemeProvider } from '@/contexts/ThemeProvider'
import { bootObservability } from '@/lib/observability'
import './index.css'
import App from './App.tsx'

bootObservability()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

function AppFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8 text-center bg-gray-50 dark:bg-slate-950">
      <div>
        <p className="text-lg font-semibold text-gray-900 dark:text-white">Something went wrong</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Please refresh the page. If the problem persists, contact support.</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 rounded-xl bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600"
        >
          Reload
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<AppFallback />}>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider defaultTheme="system" storageKey="orderit-ui-theme">
            <AuthProvider>
              <App />
              <Toaster
                position="top-center"
                toastOptions={{
                  className: 'dark:!bg-slate-800 dark:!text-gray-100 dark:!border dark:!border-slate-700',
                  style: {
                    borderRadius: '12px',
                    fontWeight: '500',
                    fontSize: '14px',
                    padding: '12px 16px',
                  },
                  success: {
                    className: 'dark:!bg-emerald-950/80 dark:!text-emerald-400 dark:!border dark:!border-emerald-900',
                    style: { background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0' }
                  },
                  error: {
                    className: 'dark:!bg-red-950/80 dark:!text-red-400 dark:!border dark:!border-red-900',
                    style: { background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca' }
                  },
                }}
              />
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
