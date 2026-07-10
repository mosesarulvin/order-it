import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Plus, Minus, Search, Star, Clock, ChevronRight, UtensilsCrossed } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCurrency } from '@/lib/utils'
import { useCartStore } from '@/store/cartStore'
import { MenuItemSkeleton } from '@/components/ui/Skeleton'
import type { Shop, MenuCategory, MenuItem } from '@/types'

export default function OrderMenuPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const [shop, setShop] = useState<Shop | null>(null)
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const categoryRefs = useRef<Record<string, HTMLDivElement>>({})

  const { items: cartItems, addItem, updateQuantity, getTotalItems, getTotalPrice, setShopSlug } = useCartStore()

  useEffect(() => {
    if (slug) fetchShopData()
  }, [slug])

  const fetchShopData = async () => {
    if (!slug) return
    setLoading(true)

    const { data: shopData } = await supabase
      .from('shops')
      .select('*')
      .eq('slug', slug)
      .single()

    if (!shopData) { setLoading(false); return }
    setShop(shopData)
    setShopSlug(slug)

    const [catRes, itemRes] = await Promise.all([
      supabase.from('menu_categories').select('*').eq('shop_id', shopData.id).eq('is_active', true).order('sort_order'),
      supabase.from('menu_items').select('*').eq('shop_id', shopData.id).eq('is_available', true).order('sort_order'),
    ])

    const cats = (catRes.data as MenuCategory[]) || []
    setCategories(cats)
    setItems((itemRes.data as MenuItem[]) || [])
    if (cats.length > 0) setActiveCategory(cats[0].id)
    setLoading(false)
  }

  const getItemQuantity = (itemId: string) => {
    return cartItems.find((c) => c.menu_item.id === itemId)?.quantity || 0
  }

  const scrollToCategory = (categoryId: string) => {
    setActiveCategory(categoryId)
    categoryRefs.current[categoryId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const filteredItems = (categoryId: string) => {
    return items.filter((i) => i.category_id === categoryId && (
      !search || i.name.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase())
    ))
  }

  const totalItems = getTotalItems()
  const totalPrice = getTotalPrice()

  if (!loading && !shop) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        <div>
          <UtensilsCrossed size={64} className="text-gray-200 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900">Shop not found</h2>
          <p className="text-gray-500 mt-2">This menu link is invalid or the shop no longer exists.</p>
        </div>
      </div>
    )
  }

  if (!loading && shop && !shop.is_open) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center bg-gray-50">
        <div>
          <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock size={40} className="text-orange-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">{shop.name}</h2>
          <p className="text-lg text-gray-500 mt-2">Sorry, we're currently closed</p>
          <p className="text-sm text-gray-400 mt-1">Please visit us again later!</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-500 to-amber-500 text-white pt-safe px-4 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 pt-4 mb-4">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0">
              {shop?.logo_url ? (
                <img src={shop.logo_url} alt={shop.name} className="w-10 h-10 rounded-xl object-cover" />
              ) : (
                <UtensilsCrossed size={24} className="text-white" />
              )}
            </div>
            <div>
              {loading ? (
                <div className="space-y-1.5">
                  <div className="h-5 w-32 bg-white/20 rounded-lg animate-pulse" />
                  <div className="h-3 w-20 bg-white/20 rounded-lg animate-pulse" />
                </div>
              ) : (
                <>
                  <h1 className="text-xl font-bold">{shop?.name}</h1>
                  {shop?.description && <p className="text-orange-100 text-sm">{shop.description}</p>}
                </>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search menu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-4 rounded-xl bg-white text-sm text-gray-900 placeholder:text-gray-400 outline-none"
            />
          </div>
        </div>
      </div>

      {/* Category pills */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto">
          <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-8 w-24 bg-gray-100 rounded-full animate-pulse flex-shrink-0" />
                ))
              : categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => scrollToCategory(cat.id)}
                    className={`flex-shrink-0 h-8 px-4 rounded-full text-sm font-medium transition-all ${
                      activeCategory === cat.id
                        ? 'bg-orange-500 text-white shadow-sm shadow-orange-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
          </div>
        </div>
      </div>

      {/* Menu */}
      <div className="max-w-lg mx-auto px-4 pt-4 space-y-8">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <MenuItemSkeleton key={i} />)}
          </div>
        ) : (
          categories.map((cat) => {
            const catItems = filteredItems(cat.id)
            if (catItems.length === 0) return null
            return (
              <div key={cat.id} ref={(el) => { if (el) categoryRefs.current[cat.id] = el }}>
                <h2 className="text-lg font-bold text-gray-900 mb-3">{cat.name}</h2>
                <div className="space-y-3">
                  {catItems.map((item) => {
                    const qty = getItemQuantity(item.id)
                    return (
                      <div
                        key={item.id}
                        className="bg-white rounded-2xl border border-gray-100 p-4 flex gap-3 shadow-sm transition-shadow hover:shadow-md"
                        style={{ animation: 'fadeIn 0.3s ease-out' }}
                      >
                        {item.image_url ? (
                          <img src={item.image_url} alt={item.name} className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center flex-shrink-0 border border-orange-100">
                            <span className="text-3xl">🍽️</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-1.5">
                            <p className="font-semibold text-gray-900 text-sm leading-snug">{item.name}</p>
                            {item.is_popular && (
                              <span className="flex-shrink-0 inline-flex items-center gap-0.5 text-xs bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">
                                <Star size={9} fill="currentColor" /> Popular
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-xs text-gray-400 mt-1 leading-relaxed line-clamp-2">{item.description}</p>
                          )}
                          <div className="flex items-center justify-between mt-2">
                            <p className="font-bold text-orange-600">{formatCurrency(item.price)}</p>
                            {qty === 0 ? (
                              <button
                                onClick={() => addItem(item)}
                                className="flex items-center gap-1 h-8 px-3 bg-orange-500 text-white rounded-xl text-sm font-semibold hover:bg-orange-600 active:scale-95 transition-all"
                              >
                                <Plus size={14} /> Add
                              </button>
                            ) : (
                              <div className="flex items-center gap-2 bg-orange-50 rounded-xl p-1">
                                <button
                                  onClick={() => updateQuantity(item.id, qty - 1)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white text-orange-600 shadow-sm hover:bg-orange-50 transition-colors"
                                >
                                  <Minus size={13} />
                                </button>
                                <span className="w-5 text-center text-sm font-bold text-orange-700">{qty}</span>
                                <button
                                  onClick={() => addItem(item)}
                                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-orange-500 text-white shadow-sm hover:bg-orange-600 transition-colors"
                                >
                                  <Plus size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Floating cart button */}
      {totalItems > 0 && (
        <div
          className="fixed bottom-6 left-0 right-0 px-4 z-20"
          style={{ animation: 'slideUp 0.3s ease-out' }}
        >
          <div className="max-w-lg mx-auto">
            <button
              onClick={() => navigate(`/order/${slug}/checkout`)}
              className="w-full bg-orange-500 text-white rounded-2xl p-4 flex items-center justify-between shadow-xl shadow-orange-300/50 hover:bg-orange-600 active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center text-sm font-bold">
                  {totalItems}
                </span>
                <span className="font-semibold">View Cart</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{formatCurrency(totalPrice)}</span>
                <ChevronRight size={18} />
              </div>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
