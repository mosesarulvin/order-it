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
  total: number
  notes: string | null
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
  created_at: string
  menu_item?: MenuItem
}

export interface CartItem {
  menu_item: MenuItem
  quantity: number
}

export interface DashboardStats {
  total_orders: number
  pending_orders: number
  today_revenue: number
  total_revenue: number
}
