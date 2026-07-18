export interface Shop {
  id: string
  owner_id: string
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  phone: string | null
  address: string | null
  currency: string
  is_open: boolean
  tax_percent: number
  coupons_enabled: boolean
  reviews_enabled: boolean
  auto_schedule_enabled: boolean
  auto_open_time: string | null
  auto_close_time: string | null
  brand_primary: string | null
  brand_secondary: string | null
  brand_accent: string | null
  created_at: string
  updated_at: string
}

export interface MenuCategory {
  id: string
  shop_id: string
  name: string
  description: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export interface CustomizationGroup {
  name: string
  type: 'single' | 'multi'
  required: boolean
  choices: string[]
}

export interface MenuItem {
  id: string
  shop_id: string
  category_id: string
  name: string
  description: string | null
  price: number
  image_url: string | null
  is_available: boolean
  is_popular: boolean
  is_instant: boolean
  stock_quantity: number | null
  low_stock_threshold: number
  customization_groups: CustomizationGroup[]
  sort_order: number
  created_at: string
  updated_at: string
  category?: MenuCategory
}

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'completed' | 'cancelled'
export type PaymentMethod = 'upi' | 'cash'
export type PaymentStatus = 'pending' | 'paid' | 'failed'

export interface Order {
  id: string
  shop_id: string
  order_number: string
  customer_name: string
  customer_phone: string
  status: OrderStatus
  payment_method: PaymentMethod
  payment_status: PaymentStatus
  subtotal: number
  tax_amount: number
  discount_amount: number
  total: number
  notes: string | null
  cancellation_reason: string | null
  is_anonymous: boolean
  coupon_code: string | null
  order_source: 'qr' | 'walkin'
  customer_profile_id: string | null
  created_at: string
  updated_at: string
  items?: OrderItem[]
  shop?: Shop
}

export interface OrderItem {
  id: string
  order_id: string
  menu_item_id: string
  name: string
  price: number
  quantity: number
  subtotal: number
  customizations: { group: string; choice: string }[]
  created_at: string
  menu_item?: MenuItem
}

export interface CartItem {
  menu_item: MenuItem
  quantity: number
  customizations: { group: string; choice: string }[]
}

export interface DashboardStats {
  total_orders: number
  pending_orders: number
  today_revenue: number
  total_revenue: number
}

export interface StockLog {
  id: string
  shop_id: string
  menu_item_id: string | null
  item_name: string
  delta: number
  reason: 'order' | 'restock' | 'adjustment'
  note: string | null
  created_at: string
}

export interface Coupon {
  id: string
  shop_id: string
  code: string
  type: 'percentage' | 'amount'
  coupon_type: 'general' | 'new_user' | 'birthday' | 'promotion'
  value: number
  min_order_amount: number
  max_uses: number | null
  used_count: number
  expires_at: string | null
  is_active: boolean
  created_at: string
}

export interface Review {
  id: string
  shop_id: string
  order_id: string | null
  order_number: string | null
  customer_name: string
  rating: number
  comment: string | null
  created_at: string
}

export interface CustomerProfile {
  id: string
  shop_id: string
  name: string
  phone: string
  email: string | null
  birthday: string | null
  created_at: string
}

export interface ProfileCoupon {
  id: string
  profile_id: string
  shop_id: string
  coupon_id: string | null
  coupon_code: string
  label: string
  assigned_at: string
  used_at: string | null
  used_order_id: string | null
}
