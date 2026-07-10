import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem, MenuItem } from '@/types'

interface CartStore {
  items: CartItem[]
  shopSlug: string | null
  addItem: (item: MenuItem) => void
  removeItem: (itemId: string) => void
  updateQuantity: (itemId: string, quantity: number) => void
  clearCart: () => void
  setShopSlug: (slug: string) => void
  getTotalItems: () => number
  getTotalPrice: () => number
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      shopSlug: null,

      addItem: (menuItem: MenuItem) => {
        set((state) => {
          const existing = state.items.find((i) => i.menu_item.id === menuItem.id)
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.menu_item.id === menuItem.id
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              ),
            }
          }
          return { items: [...state.items, { menu_item: menuItem, quantity: 1 }] }
        })
      },

      removeItem: (itemId: string) => {
        set((state) => ({
          items: state.items.filter((i) => i.menu_item.id !== itemId),
        }))
      },

      updateQuantity: (itemId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(itemId)
          return
        }
        set((state) => ({
          items: state.items.map((i) =>
            i.menu_item.id === itemId ? { ...i, quantity } : i
          ),
        }))
      },

      clearCart: () => set({ items: [], shopSlug: null }),

      setShopSlug: (slug: string) => set({ shopSlug: slug }),

      getTotalItems: () => {
        return get().items.reduce((sum, i) => sum + i.quantity, 0)
      },

      getTotalPrice: () => {
        return get().items.reduce((sum, i) => sum + i.menu_item.price * i.quantity, 0)
      },
    }),
    {
      name: 'orderit-cart',
    }
  )
)
