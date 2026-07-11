import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CartItem, MenuItem } from '@/types'

interface CartStore {
  items: CartItem[]
  shopSlug: string | null
  addItem: (item: MenuItem, customizations?: { group: string; choice: string }[]) => void
  removeItem: (itemId: string) => void
  removeItemAt: (index: number) => void
  updateQuantity: (itemId: string, quantity: number) => void
  updateQuantityAt: (index: number, quantity: number) => void
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

      addItem: (menuItem: MenuItem, customizations: { group: string; choice: string }[] = []) => {
        set((state) => {
          // Items with customizations are always added as separate entries
          if (customizations.length > 0) {
            return { items: [...state.items, { menu_item: menuItem, quantity: 1, customizations }] }
          }
          const existing = state.items.find(
            (i) => i.menu_item.id === menuItem.id && i.customizations.length === 0
          )
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.menu_item.id === menuItem.id && i.customizations.length === 0
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              ),
            }
          }
          return { items: [...state.items, { menu_item: menuItem, quantity: 1, customizations: [] }] }
        })
      },

      // removeItem: removes first matching by itemId (no-customization items)
      removeItem: (itemId: string) => {
        set((state) => {
          const idx = state.items.findIndex((i) => i.menu_item.id === itemId && i.customizations.length === 0)
          if (idx === -1) return state
          const items = [...state.items]
          items.splice(idx, 1)
          return { items }
        })
      },

      // removeItemAt: removes by exact cart row index (safe for customized duplicates)
      removeItemAt: (index: number) => {
        set((state) => {
          const items = [...state.items]
          items.splice(index, 1)
          return { items }
        })
      },

      updateQuantity: (itemId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(itemId)
          return
        }
        set((state) => {
          const idx = state.items.findIndex((i) => i.menu_item.id === itemId && i.customizations.length === 0)
          if (idx === -1) return state
          const items = [...state.items]
          items[idx] = { ...items[idx], quantity }
          return { items }
        })
      },

      // updateQuantityAt: update by exact cart row index (safe for customized duplicates)
      updateQuantityAt: (index: number, quantity: number) => {
        if (quantity <= 0) {
          get().removeItemAt(index)
          return
        }
        set((state) => {
          const items = [...state.items]
          items[index] = { ...items[index], quantity }
          return { items }
        })
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
