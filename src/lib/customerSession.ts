/**
 * Customer session helpers.
 *
 * Replaces the pre-refactor pattern of storing a raw `customer_profile_id` in
 * localStorage and treating it as a bearer. The server now issues an opaque
 * 32-byte hex session token (see migration 018) that is verified on every
 * privileged RPC. This module is the only place the client is allowed to
 * read/write those tokens.
 */

import { supabase } from '@/lib/supabase'

const KEY = (slug: string) => `orderit-session-${slug}`

export interface CustomerSession {
  token: string
  name: string
  phone: string
}

export function getSessionToken(slug: string): string | null {
  return localStorage.getItem(KEY(slug))
}

export function saveSession(slug: string, session: CustomerSession): void {
  localStorage.setItem(KEY(slug), session.token)
  localStorage.setItem(`${KEY(slug)}-name`, session.name)
  localStorage.setItem(`${KEY(slug)}-phone`, session.phone)
}

export function getCachedIdentity(slug: string): { name: string; phone: string } | null {
  const name = localStorage.getItem(`${KEY(slug)}-name`)
  const phone = localStorage.getItem(`${KEY(slug)}-phone`)
  if (!name || !phone) return null
  return { name, phone }
}

export async function signOut(slug: string): Promise<void> {
  const token = getSessionToken(slug)
  if (token) {
    await supabase.rpc('sign_out_customer', { p_session_token: token })
  }
  localStorage.removeItem(KEY(slug))
  localStorage.removeItem(`${KEY(slug)}-name`)
  localStorage.removeItem(`${KEY(slug)}-phone`)
}

/**
 * Migrate any legacy `profile-{slug}` entry. Returns true if a legacy entry
 * was removed. Callers can prompt the customer to sign in again.
 */
export function purgeLegacyProfileKey(slug: string): boolean {
  const legacy = localStorage.getItem(`profile-${slug}`)
  if (!legacy) return false
  localStorage.removeItem(`profile-${slug}`)
  return true
}
