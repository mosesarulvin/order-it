/**
 * Thin, typed wrappers around the customer-facing RPCs introduced in
 * migration 018. All customer order/profile/coupon mutations flow through
 * these functions — never touch the underlying tables from the browser.
 */

import { supabase } from '@/lib/supabase'
import type { CartItem, PaymentMethod } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PlacedOrder {
  order_id:       string
  order_number:   string
  tracking_token: string
  status:         string
  total:          number
}

export interface CustomerSessionResult {
  session_token: string
  name:          string
  phone:         string
}

export interface CustomerCoupon {
  id:                string
  coupon_code:       string
  label:             string
  discount_type?:    'percentage' | 'flat' | null
  discount_value?:   number | null
  min_order_amount?: number | null
  assigned_at:       string
  used_at:           string | null
  expires_at?:       string | null
}

export interface CustomerOrderSummary {
  id:              string
  order_number:    string
  status:          string
  payment_method:  string
  payment_status:  string
  subtotal:        number
  tax_amount:      number
  packing_charge:  number
  discount_amount: number
  total:           number
  created_at:      string
  items: {
    id:             string
    menu_item_id:   string | null
    name:           string
    price:          number
    quantity:       number
    subtotal:       number
    customizations: { group: string; choice: string; price: number }[]
  }[]
}

// ── Cart → RPC payload ─────────────────────────────────────────────────────

export function cartToPayload(items: CartItem[]): unknown[] {
  return items.map((ci) => ({
    menu_item_id:   ci.menu_item.id,
    quantity:       ci.quantity,
    variant_id:     ci.variant?.id ?? null,
    customizations: ci.customizations ?? [],
  }))
}

// ── RPCs ───────────────────────────────────────────────────────────────────

export async function signInCustomer(
  shopId: string,
  phone: string,
  password: string,
): Promise<CustomerSessionResult> {
  const { data, error } = await supabase.rpc('sign_in_customer', {
    p_shop_id:  shopId,
    p_phone:    phone,
    p_password: password,
  })
  if (error) throw error
  return data as CustomerSessionResult
}

export async function createCustomerProfile(input: {
  shopId:   string
  name:     string
  phone:    string
  email:    string
  birthday: string
  password: string
}): Promise<CustomerSessionResult> {
  const { data, error } = await supabase.rpc('create_customer_profile', {
    p_shop_id:  input.shopId,
    p_name:     input.name,
    p_phone:    input.phone,
    p_email:    input.email,
    p_birthday: input.birthday,
    p_password: input.password,
  })
  if (error) throw error
  return data as CustomerSessionResult
}

export async function fetchCustomerProfile(token: string) {
  const { data, error } = await supabase.rpc('get_customer_profile', { p_session_token: token })
  if (error) throw error
  return data as { id: string; shop_id: string; name: string; phone: string; email: string | null; birthday: string | null } | null
}

export async function fetchCustomerCoupons(token: string): Promise<CustomerCoupon[]> {
  const { data, error } = await supabase.rpc('get_customer_coupons', { p_session_token: token })
  if (error) throw error
  return (data ?? []) as CustomerCoupon[]
}

export async function fetchCustomerOrders(token: string, limit = 20): Promise<CustomerOrderSummary[]> {
  const { data, error } = await supabase.rpc('get_customer_orders', {
    p_session_token: token,
    p_limit:         limit,
  })
  if (error) throw error
  return (data ?? []) as CustomerOrderSummary[]
}

export async function placeCustomerOrder(input: {
  shopId:        string
  sessionToken:  string | null
  items:         CartItem[]
  orderType:     'dine_in' | 'takeaway'
  paymentMethod: PaymentMethod
  notes:         string | null
  couponCode:    string | null
  isAnonymous:   boolean
}): Promise<PlacedOrder> {
  const { data, error } = await supabase.rpc('place_customer_order', {
    p_shop_id:        input.shopId,
    p_session_token:  input.sessionToken,
    p_items:          cartToPayload(input.items),
    p_order_type:     input.orderType,
    p_payment_method: input.paymentMethod,
    p_notes:          input.notes,
    p_coupon_code:    input.couponCode,
    p_is_anonymous:   input.isAnonymous,
  })
  if (error) throw error
  return data as PlacedOrder
}

export async function placeWalkinOrder(input: {
  shopId:        string
  items:         { menu_item_id: string; quantity: number }[]
  customerName:  string
  orderType:     'dine_in' | 'takeaway'
  paymentMethod: PaymentMethod
}): Promise<PlacedOrder> {
  const { data, error } = await supabase.rpc('place_walkin_order', {
    p_shop_id:        input.shopId,
    p_items:          input.items,
    p_customer_name:  input.customerName,
    p_order_type:     input.orderType,
    p_payment_method: input.paymentMethod,
  })
  if (error) throw error
  return data as PlacedOrder
}

// ── Error mapping ─────────────────────────────────────────────────────────

const ERROR_MESSAGES: Record<string, string> = {
  auth_required:              'Please sign in to continue',
  invalid_session:            'Your session has expired. Please sign in again.',
  invalid_credentials:        'Invalid mobile number or password',
  rate_limited:               'Too many attempts. Please try again in a few minutes.',
  empty_cart:                 'Your cart is empty',
  invalid_order_type:         'Invalid order type',
  invalid_payment_method:     'Invalid payment method',
  payment_method_unavailable: 'This payment method is not available for the shop',
  shop_closed:                'The shop is currently closed',
  shop_unavailable:           'The shop is not accepting orders right now',
  shop_not_found:             'Shop not found',
  ordering_disabled:          'This menu is currently view-only — please order at the counter',
  invalid_coupon:             'Invalid or inactive coupon',
  coupon_expired:             'This coupon has expired',
  coupon_exhausted:           'This coupon has reached its usage limit',
  coupon_min_order:           'Order does not meet the minimum for this coupon',
  invalid_quantity:           'Invalid item quantity',
  notes_too_long:             'Notes are too long',
  invalid_name:               'Please enter a valid name',
  invalid_phone:              'Please enter a valid mobile number',
  invalid_email:              'Please enter a valid email',
  weak_password:              'Password is too weak',
  profile_exists:             'A profile with this mobile number already exists. Please sign in.',
}

export function humanizeError(err: unknown): string {
  const raw = extractMessage(err)
  const code = extractCode(err)

  // PostgREST → function/table not deployed in the DB. Almost always means
  // a pending migration hasn't been applied yet.
  if (code === 'PGRST202' || code === 'PGRST205') {
    return 'This feature is not available on the server yet. Please contact support.'
  }

  if (!raw) return 'Something went wrong'
  const [msgCode, arg] = raw.split(':')
  if (msgCode === 'item_unavailable')  return `"${arg ?? 'An item'}" is no longer available`
  if (msgCode === 'insufficient_stock') return `Not enough stock for "${arg ?? 'an item'}"`
  if (msgCode === 'item_display_only') return `"${arg ?? 'An item'}" is menu-only and cannot be ordered online`
  return ERROR_MESSAGES[msgCode as string] ?? raw
}

// Duck-types Error instances, Supabase PostgrestError objects, and plain strings.
function extractMessage(err: unknown): string {
  if (err == null) return ''
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  if (typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message
    if (typeof m === 'string') return m
  }
  return ''
}

function extractCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const c = (err as { code: unknown }).code
    if (typeof c === 'string') return c
  }
  return ''
}
