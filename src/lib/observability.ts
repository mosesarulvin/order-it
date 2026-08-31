/**
 * Client observability bootstrap.
 *
 * Initialises Sentry (error + performance) and forwards Web Vitals to it.
 * Called once from src/main.tsx. Safe to call even when DSN is unset —
 * everything short-circuits to a no-op.
 */

import * as Sentry from '@sentry/react'
import { onCLS, onINP, onLCP, onFCP, onTTFB } from 'web-vitals'

interface BootOptions {
  release?: string
  environment?: string
}

let booted = false

export function bootObservability(opts: BootOptions = {}): void {
  if (booted) return
  booted = true

  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    release:      opts.release     ?? import.meta.env.VITE_RELEASE ?? 'dev',
    environment:  opts.environment ?? import.meta.env.MODE,
    tracesSampleRate:       0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    beforeSend(event) {
      // Best-effort PII scrubbing: strip common auth-token query params.
      if (event.request?.url) {
        event.request.url = event.request.url.replace(/([?&](access_token|refresh_token|token)=)[^&]*/gi, '$1[REDACTED]')
      }
      return event
    },
  })

  const report = (metric: { name: string; value: number; id: string }) => {
    Sentry.metrics?.distribution?.(`web-vitals.${metric.name.toLowerCase()}`, metric.value, {
      unit: metric.name === 'CLS' ? 'none' : 'millisecond',
    })
  }

  onCLS(report)
  onINP(report)
  onLCP(report)
  onFCP(report)
  onTTFB(report)
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!booted) { console.error(err, context); return }
  Sentry.captureException(err, context ? { extra: context } : undefined)
}

export function setUserContext(user: { id: string } | null): void {
  if (!booted) return
  Sentry.setUser(user)
}
