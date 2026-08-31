/**
 * Typed TanStack Query wrappers around Supabase RPCs.
 *
 * Every customer-facing RPC is exposed as a hook here so callers get
 * automatic caching, dedup, retries, and query-key discipline. Domain
 * mutations invalidate the relevant caches.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseQueryOptions } from '@tanstack/react-query'
import {
  fetchCustomerCoupons,
  fetchCustomerOrders,
  fetchCustomerProfile,
  placeCustomerOrder,
  placeWalkinOrder,
  type CustomerCoupon,
  type CustomerOrderSummary,
  type PlacedOrder,
} from '@/lib/api/customerOrders'

export const qk = {
  customerProfile: (token: string | null) => ['customer', 'profile', token] as const,
  customerCoupons: (token: string | null) => ['customer', 'coupons', token] as const,
  customerOrders:  (token: string | null, limit: number) => ['customer', 'orders', token, limit] as const,
  shopOrders:      (shopId: string, cursor: string | null) => ['owner', 'orders', shopId, cursor] as const,
  shopKitchen:     (shopId: string) => ['owner', 'kitchen', shopId] as const,
  dashboardStats:  (shopId: string) => ['owner', 'dashboard-stats', shopId] as const,
}

// ── Customer queries ──────────────────────────────────────────────────────

export function useCustomerProfile(token: string | null, options?: Partial<UseQueryOptions<Awaited<ReturnType<typeof fetchCustomerProfile>>>>) {
  return useQuery({
    queryKey: qk.customerProfile(token),
    queryFn:  () => fetchCustomerProfile(token as string),
    enabled:  !!token,
    ...options,
  })
}

export function useCustomerCoupons(token: string | null) {
  return useQuery<CustomerCoupon[]>({
    queryKey: qk.customerCoupons(token),
    queryFn:  () => fetchCustomerCoupons(token as string),
    enabled:  !!token,
  })
}

export function useCustomerOrders(token: string | null, limit = 20) {
  return useQuery<CustomerOrderSummary[]>({
    queryKey: qk.customerOrders(token, limit),
    queryFn:  () => fetchCustomerOrders(token as string, limit),
    enabled:  !!token,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────

export function usePlaceCustomerOrder() {
  const qc = useQueryClient()
  return useMutation<PlacedOrder, Error, Parameters<typeof placeCustomerOrder>[0]>({
    mutationFn: placeCustomerOrder,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer', 'orders'] })
      qc.invalidateQueries({ queryKey: ['customer', 'coupons'] })
    },
  })
}

export function usePlaceWalkinOrder() {
  const qc = useQueryClient()
  return useMutation<PlacedOrder, Error, Parameters<typeof placeWalkinOrder>[0]>({
    mutationFn: placeWalkinOrder,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: qk.shopOrders(vars.shopId, null) })
      qc.invalidateQueries({ queryKey: qk.shopKitchen(vars.shopId) })
      qc.invalidateQueries({ queryKey: qk.dashboardStats(vars.shopId) })
    },
  })
}
